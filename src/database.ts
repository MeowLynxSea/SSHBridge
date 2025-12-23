import SQLiteDatabase from 'better-sqlite3';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as path from 'path';
import {
  TunnelStats,
  RealtimeStats,
  TunnelStatsWithInfo,
  ClientAccessLog as ClientAccessLogType,
} from './types/stats.js';
import { parseDatabaseDate, createFutureTime } from './utils/timeUtils.js';
import { getJwtSecret } from './utils/jwtSecret.js';
import geoip from 'geoip-lite';

// SQLite types
interface Row {
  [key: string]: string | number | boolean | null;
}

interface TableColumn {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface TunnelRow {
  id: number;
  name: string;
  tunnel_id?: number;
}

interface RateHistoryRow {
  id: number;
  tunnel_id: number;
  timestamp: string;
  bytes_per_second_received: number;
  bytes_per_second_sent: number;
  current_bytes_received: number;
  current_bytes_sent: number;
  created_at: string;
}

export interface User {
  id: number;
  username: string;
  password: string;
  otp_secret?: string;
  otp_enabled: boolean;
  created_at: string;
}

export interface Tunnel {
  id: number;
  user_id: number;
  name: string;
  external_port: number;
  max_bandwidth?: number; // in bytes per second
  need_close?: boolean; // flag to indicate tunnel should be closed
  created_at: string;
}

export interface Session {
  id: number;
  user_id: number;
  token: string;
  expires_at: string;
  created_at: string;
}

class Database {
  private static instance: Database | null = null;
  private db: SQLiteDatabase.Database;
  private jwtSecret: string;
  private statsUpdateInterval: ReturnType<typeof setInterval> | null = null;
  private currentBytesReceived: Map<number, number> = new Map();
  private currentBytesSent: Map<number, number> = new Map();
  private rateHistory: Map<number, Array<RealtimeStats>> = new Map();
  private activeConnections: Map<string, { tunnelId: number; startTime: Date; clientIP: string }> =
    new Map();

  private constructor(dbPath?: string) {
    const databasePath =
      dbPath || process.env.DATABASE_PATH || path.join(process.cwd(), 'database.sqlite');
    this.db = new SQLiteDatabase(databasePath);
    this.jwtSecret = getJwtSecret();
    this.init();
  }

  static getInstance(dbPath?: string): Database {
    if (!Database.instance) {
      Database.instance = new Database(dbPath);
    }
    return Database.instance;
  }

  // Public getters for accessing private properties
  getCurrentSessionReceived(tunnelId: number): number {
    return this.currentBytesReceived.get(tunnelId) || 0;
  }

  getCurrentSessionSent(tunnelId: number): number {
    return this.currentBytesSent.get(tunnelId) || 0;
  }

  setCurrentSessionStats(tunnelId: number, received: number, sent: number): void {
    this.currentBytesReceived.set(tunnelId, received);
    this.currentBytesSent.set(tunnelId, sent);
  }

  private parsePossiblyIsoOrSqliteDate(dateString: string): Date | null {
    const input = dateString?.trim();
    if (!input) return null;

    // ISO (or ISO-like) strings parse directly.
    if (input.includes('T')) {
      const date = new Date(input);
      if (!isNaN(date.getTime())) return date;
    }

    // SQLite CURRENT_TIMESTAMP is typically "YYYY-MM-DD HH:MM:SS" (UTC).
    const normalized = input.replace(' ', 'T');
    const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(normalized);
    const date = new Date(hasTimezone ? normalized : `${normalized}Z`);
    if (!isNaN(date.getTime())) return date;

    const legacy = parseDatabaseDate(input);
    return isNaN(legacy.getTime()) ? null : legacy;
  }

  private async init() {
    // better-sqlite3 is synchronous, but we need to maintain the async interface
    // for compatibility with the rest of the code
    await Promise.resolve(); // Ensure async context

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        otp_secret TEXT,
        otp_enabled INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check if we need to add OTP columns to users table
    const usersTableInfo = this.db
      .prepare('PRAGMA table_info(users)')
      .all() as unknown as TableColumn[];
    const hasOtpSecretColumn = usersTableInfo.some((col) => col.name === 'otp_secret');
    const hasOtpEnabledColumn = usersTableInfo.some((col) => col.name === 'otp_enabled');

    if (!hasOtpSecretColumn) {
      console.log('Adding otp_secret column to users table');
      this.db.exec('ALTER TABLE users ADD COLUMN otp_secret TEXT');
    }

    if (!hasOtpEnabledColumn) {
      console.log('Adding otp_enabled column to users table');
      this.db.exec('ALTER TABLE users ADD COLUMN otp_enabled INTEGER NOT NULL DEFAULT 0');
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Create user settings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        refresh_interval INTEGER NOT NULL DEFAULT 2000,
        language TEXT NOT NULL DEFAULT 'zh',
        theme TEXT NOT NULL DEFAULT 'light',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Create the tunnels table with the new schema if it doesn't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tunnels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        external_port INTEGER NOT NULL,
        max_bandwidth INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Check if tunnels table exists for migration purposes
    const tableInfo = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tunnels'")
      .get();

    if (tableInfo) {
      // Check if we need to migrate from old schema to new schema
      const columns = this.db
        .prepare('PRAGMA table_info(tunnels)')
        .all() as unknown as TableColumn[];
      const hasOldColumns =
        columns.some((col) => col.name === 'local_port') &&
        !columns.some((col) => col.name === 'external_port');

      if (hasOldColumns) {
        console.log('Migrating tunnels database from old schema to new schema...');

        // Create a new table with the updated schema
        this.db.exec(`
          CREATE TABLE tunnels_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            external_port INTEGER NOT NULL,
            max_bandwidth INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
          )
        `);

        // Migrate data from old table to new table
        this.db.exec(`
          INSERT INTO tunnels_new (id, user_id, name, external_port, created_at)
          SELECT id, user_id, name, local_port, created_at FROM tunnels
        `);

        // Drop the old table and rename the new one
        this.db.exec('DROP TABLE tunnels');
        this.db.exec('ALTER TABLE tunnels_new RENAME TO tunnels');

        console.log('Database migration completed');
      }
    }

    // Check if we need to add max_bandwidth column to existing table
    const tunnelTableInfo = this.db
      .prepare('PRAGMA table_info(tunnels)')
      .all() as unknown as TableColumn[];
    const hasBandwidthColumn = tunnelTableInfo.some((col) => col.name === 'max_bandwidth');

    if (!hasBandwidthColumn) {
      console.log('Adding max_bandwidth column to tunnels table for bandwidth limiting');
      this.db.exec('ALTER TABLE tunnels ADD COLUMN max_bandwidth INTEGER');
    }

    // Check if we need to add the need_close column
    const hasNeedCloseColumn = tunnelTableInfo.some((col) => col.name === 'need_close');

    if (!hasNeedCloseColumn) {
      console.log('Adding need_close column to tunnels table for remote closure');
      this.db.exec('ALTER TABLE tunnels ADD COLUMN need_close INTEGER DEFAULT 0');
    }

    // Create the tunnel_stats table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tunnel_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tunnel_id INTEGER NOT NULL,
        total_bytes_received INTEGER DEFAULT 0,
        total_bytes_sent INTEGER DEFAULT 0,
        current_bytes_received INTEGER DEFAULT 0,
        current_bytes_sent INTEGER DEFAULT 0,
        active_connections INTEGER DEFAULT 0,
        is_online INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tunnel_id) REFERENCES tunnels (id) ON DELETE CASCADE
      )
    `);

    // Create rate_history table to store rate calculations across processes
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rate_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tunnel_id INTEGER NOT NULL,
        timestamp DATETIME NOT NULL,
        bytes_per_second_received REAL NOT NULL,
        bytes_per_second_sent REAL NOT NULL,
        current_bytes_received INTEGER NOT NULL,
        current_bytes_sent INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tunnel_id) REFERENCES tunnels (id) ON DELETE CASCADE
      )
    `);

    // Create index for faster queries
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_rate_history_tunnel_timestamp ON rate_history(tunnel_id, timestamp)`
    );

    // Create client_access_logs table to store detailed client access information
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS client_access_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tunnel_id INTEGER NOT NULL,
        connection_id TEXT NOT NULL,
        client_ip TEXT NOT NULL,
        client_country TEXT,
        client_region TEXT,
        client_city TEXT,
        connection_start_time DATETIME NOT NULL,
        connection_end_time DATETIME,
        duration_seconds INTEGER,
        bytes_sent INTEGER DEFAULT 0,
        bytes_received INTEGER DEFAULT 0,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tunnel_id) REFERENCES tunnels (id) ON DELETE CASCADE
      )
    `);

    // Create indexes for client_access_logs for faster queries
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_client_access_logs_tunnel_id ON client_access_logs(tunnel_id)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_client_access_logs_connection_id ON client_access_logs(connection_id)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_client_access_logs_start_time ON client_access_logs(connection_start_time)`
    );

    // Check if we need to add language and theme columns to user_settings
    const settingsTableInfo = this.db
      .prepare('PRAGMA table_info(user_settings)')
      .all() as unknown as TableColumn[];
    const hasLanguageColumn = settingsTableInfo.some((col) => col.name === 'language');
    const hasThemeColumn = settingsTableInfo.some((col) => col.name === 'theme');

    if (!hasLanguageColumn) {
      console.log('Adding language column to user_settings table');
      this.db.exec('ALTER TABLE user_settings ADD COLUMN language TEXT NOT NULL DEFAULT "zh"');
    }

    if (!hasThemeColumn) {
      console.log('Adding theme column to user_settings table');
      this.db.exec('ALTER TABLE user_settings ADD COLUMN theme TEXT NOT NULL DEFAULT "light"');
    }

    // Check if we need to add the is_online column (for backward compatibility)
    const statsTableInfo = this.db
      .prepare('PRAGMA table_info(tunnel_stats)')
      .all() as unknown as TableColumn[];
    const hasOnlineColumn = statsTableInfo.some((col) => col.name === 'is_online');

    if (!hasOnlineColumn) {
      console.log('Adding is_online column to tunnel_stats table for backward compatibility');
      this.db.exec('ALTER TABLE tunnel_stats ADD COLUMN is_online INTEGER DEFAULT 0');
    }

    // Load existing current session data from database
    await this.loadCurrentSessionData();

    // Initialize stats tracking
    this.startStatsTracking();

    // Start cleanup task for old access logs (older than 31 days)
    this.startAccessLogCleanup();
  }

  async createUser(username: string, password: string): Promise<User> {
    const hashedPassword = await bcrypt.hash(password, 10);
    const stmt = this.db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
    const result = stmt.run(username, hashedPassword);

    const user = await this.getUserById(result.lastInsertRowid as number);
    if (!user) throw new Error('Failed to create user');
    return user;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const stmt = this.db.prepare('SELECT * FROM users WHERE username = ?');
    const row = stmt.get(username) as Row;
    return row ? this.mapRowToUser(row) : null;
  }

  async getUserById(id: number): Promise<User | null> {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    const row = stmt.get(id) as Row;
    return row ? this.mapRowToUser(row) : null;
  }

  private mapRowToUser(row: Row): User {
    return {
      id: Number(row.id),
      username: String(row.username),
      password: String(row.password),
      otp_secret: row.otp_secret ? String(row.otp_secret) : undefined,
      otp_enabled: Number(row.otp_enabled) === 1,
      created_at: parseDatabaseDate(String(row.created_at)).toISOString(),
    };
  }

  async validatePassword(username: string, password: string): Promise<User | null> {
    const user = await this.getUserByUsername(username);
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  async createTunnel(
    userId: number,
    name: string,
    externalPort: number,
    maxBandwidth?: number
  ): Promise<Tunnel> {
    // Check port range (must be between 10000 and 65535)
    if (externalPort < 10000 || externalPort > 65535) {
      throw new Error(`Port ${externalPort} is not allowed. Port must be in range 10000-65535`);
    }

    // Check if port is already in use by any tunnel
    if (await this.isPortInUse(externalPort)) {
      throw new Error(`Port ${externalPort} is already in use by another tunnel`);
    }

    // Check if name is already in use by the same user
    if (await this.isNameInUseForUser(userId, name)) {
      throw new Error(`Name "${name}" is already in use for your tunnels`);
    }

    const stmt = this.db.prepare(
      'INSERT INTO tunnels (user_id, name, external_port, max_bandwidth) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(userId, name, externalPort, maxBandwidth || null);

    const tunnel = await this.getTunnelById(result.lastInsertRowid as number);
    if (!tunnel) throw new Error('Failed to create tunnel');

    // Create stats record for the new tunnel
    await this.createTunnelStats(tunnel.id);

    return tunnel;
  }

  async getTunnelsByUserId(userId: number): Promise<Tunnel[]> {
    const stmt = this.db.prepare('SELECT * FROM tunnels WHERE user_id = ?');
    return (stmt.all(userId) as unknown as Row[]).map((row) => this.mapRowToTunnel(row));
  }

  async getTunnelById(id: number): Promise<Tunnel | null> {
    const stmt = this.db.prepare('SELECT * FROM tunnels WHERE id = ?');
    const row = stmt.get(id) as Row;
    return row ? this.mapRowToTunnel(row) : null;
  }

  async updateTunnel(
    id: number,
    name: string,
    externalPort: number,
    maxBandwidth?: number
  ): Promise<Tunnel | null> {
    // Check port range (must be between 10000 and 65535)
    if (externalPort < 10000 || externalPort > 65535) {
      throw new Error(`Port ${externalPort} is not allowed. Port must be in range 10000-65535`);
    }

    // Get the current tunnel to compare
    const currentTunnel = await this.getTunnelById(id);
    if (!currentTunnel) {
      throw new Error('Tunnel not found');
    }

    // Check if port is already in use by another tunnel (exclude current tunnel)
    if (currentTunnel.external_port !== externalPort && (await this.isPortInUse(externalPort))) {
      throw new Error(`Port ${externalPort} is already in use by another tunnel`);
    }

    // Check if name is already in use by another tunnel of the same user (exclude current tunnel)
    if (
      currentTunnel.name !== name &&
      (await this.isNameInUseForUser(currentTunnel.user_id, name))
    ) {
      throw new Error(`Name "${name}" is already in use for your tunnels`);
    }

    const stmt = this.db.prepare(
      'UPDATE tunnels SET name = ?, external_port = ?, max_bandwidth = ? WHERE id = ?'
    );
    stmt.run(name, externalPort, maxBandwidth || null, id);

    return this.getTunnelById(id);
  }

  async updateTunnelBandwidth(id: number, maxBandwidth: number): Promise<Tunnel | null> {
    const stmt = this.db.prepare('UPDATE tunnels SET max_bandwidth = ? WHERE id = ?');
    stmt.run(maxBandwidth, id);

    return this.getTunnelById(id);
  }

  // Method to mark a tunnel as needing closure
  async markTunnelForClosure(id: number): Promise<boolean> {
    const stmt = this.db.prepare('UPDATE tunnels SET need_close = 1 WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Method to clear the need_close flag
  async clearTunnelCloseFlag(id: number): Promise<boolean> {
    const stmt = this.db.prepare('UPDATE tunnels SET need_close = 0 WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Method to get tunnels that need to be closed
  async getTunnelsNeedingClosure(): Promise<Tunnel[]> {
    const stmt = this.db.prepare('SELECT * FROM tunnels WHERE need_close = 1');
    const rows = stmt.all() as Row[];
    return rows.map((row) => this.mapRowToTunnel(row));
  }

  async deleteTunnel(id: number): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM tunnels WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Method to check if a port is already used by any tunnel
  async isPortInUse(externalPort: number): Promise<boolean> {
    const stmt = this.db.prepare('SELECT id FROM tunnels WHERE external_port = ?');
    const row = stmt.get(externalPort);
    return !!row;
  }

  // Method to check if a name is already used by the same user
  async isNameInUseForUser(userId: number, name: string): Promise<boolean> {
    const stmt = this.db.prepare('SELECT id FROM tunnels WHERE user_id = ? AND name = ?');
    const row = stmt.get(userId, name);
    return !!row;
  }

  private mapRowToTunnel(row: Row): Tunnel {
    const tunnel: Tunnel = {
      id: Number(row.id),
      user_id: Number(row.user_id),
      name: String(row.name),
      external_port: Number(row.external_port),
      created_at: parseDatabaseDate(String(row.created_at)).toISOString(),
    };

    // 只在有值时设置可选属性
    if (row.max_bandwidth !== null && row.max_bandwidth !== undefined) {
      tunnel.max_bandwidth = Number(row.max_bandwidth);
    }

    // Set need_close flag if present
    if (row.need_close !== null && row.need_close !== undefined) {
      tunnel.need_close = Number(row.need_close) === 1;
    }

    return tunnel;
  }

  async createSession(userId: number): Promise<string> {
    const token = jwt.sign({ userId }, this.jwtSecret, { expiresIn: '24h' });
    const expiresAt = createFutureTime(24);

    const stmt = this.db.prepare(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)'
    );
    stmt.run(userId, token, expiresAt);

    return token;
  }

  async validateSession(token: string): Promise<User | null> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { userId: number };

      const session = await this.getSession(token);
      if (!session || session.user_id !== decoded.userId) {
        return null;
      }

      return await this.getUserById(decoded.userId);
    } catch {
      return null;
    }
  }

  async deleteSession(token: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE token = ?');
    const result = stmt.run(token);
    return result.changes > 0;
  }

  // Statistics methods
  async createTunnelStats(tunnelId: number): Promise<TunnelStats> {
    const stmt = this.db.prepare('INSERT INTO tunnel_stats (tunnel_id) VALUES (?)');
    stmt.run(tunnelId);

    // Initialize rate history for the new tunnel
    if (!this.rateHistory.has(tunnelId)) {
      this.rateHistory.set(tunnelId, []);
      // Add initial data point
      this.rateHistory.get(tunnelId)!.push({
        timestamp: new Date(),
        bytes_per_second_received: 0,
        bytes_per_second_sent: 0,
        current_bytes_received: 0,
        current_bytes_sent: 0,
      });
    }

    const stats = await this.getTunnelStatsByTunnelId(tunnelId);
    if (!stats) throw new Error('Failed to create tunnel stats');
    return stats;
  }

  async getTunnelStatsByTunnelId(tunnelId: number): Promise<TunnelStats | null> {
    const stmt = this.db.prepare('SELECT * FROM tunnel_stats WHERE tunnel_id = ?');
    const row = stmt.get(tunnelId) as Row;
    return row ? this.mapRowToTunnelStats(row) : null;
  }

  async getTunnelStatsByUserId(userId: number): Promise<TunnelStatsWithInfo[]> {
    // First, ensure all tunnels have stats records
    const tunnels = this.db
      .prepare('SELECT * FROM tunnels WHERE user_id = ?')
      .all(userId) as unknown as Tunnel[];
    for (const tunnel of tunnels) {
      const existingStats = await this.getTunnelStatsByTunnelId(Number(tunnel.id));
      if (!existingStats) {
        await this.createTunnelStats(Number(tunnel.id));
      }
    }

    const stmt = this.db.prepare(`
      SELECT ts.*, t.name as tunnel_name, t.external_port, t.user_id
      FROM tunnel_stats ts
      JOIN tunnels t ON ts.tunnel_id = t.id
      WHERE t.user_id = ?
    `);
    const rows = stmt.all(userId) as (Row & {
      tunnel_name: string;
      external_port: number;
      user_id: number;
    })[];

    return rows.map((row) => this.mapRowToTunnelStatsWithInfo(row));
  }

  async getAllTunnelStats(): Promise<TunnelStatsWithInfo[]> {
    // First, ensure all tunnels have stats records
    const tunnels = this.db.prepare('SELECT * FROM tunnels').all() as unknown as Tunnel[];
    for (const tunnel of tunnels) {
      const existingStats = await this.getTunnelStatsByTunnelId(Number(tunnel.id));
      if (!existingStats) {
        await this.createTunnelStats(Number(tunnel.id));
      }
    }

    const stmt = this.db.prepare(`
      SELECT ts.*, t.name as tunnel_name, t.external_port, t.user_id
      FROM tunnel_stats ts
      JOIN tunnels t ON ts.tunnel_id = t.id
    `);
    const rows = stmt.all() as (Row & {
      tunnel_name: string;
      external_port: number;
      user_id: number;
    })[];

    return rows.map((row) => this.mapRowToTunnelStatsWithInfo(row));
  }

  async updateTunnelStats(
    tunnelId: number,
    bytesReceived: number,
    bytesSent: number,
    activeConnections: number
  ): Promise<void> {
    // Only update active connections and current session values
    // Total traffic is now updated in real-time by updateSessionStats
    const stmt = this.db.prepare(`
      UPDATE tunnel_stats 
      SET current_bytes_received = ?,
          current_bytes_sent = ?,
          active_connections = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE tunnel_id = ?
    `);
    stmt.run(
      Number(this.currentBytesReceived.get(tunnelId)) || 0,
      Number(this.currentBytesSent.get(tunnelId)) || 0,
      activeConnections,
      tunnelId
    );
  }

  // New method to update only in-memory stats for rate calculation
  updateSessionStats(
    tunnelId: number,
    bytesReceived: number,
    bytesSent: number,
    activeConnections?: number
  ): void {
    // Update in-memory counters for rate calculation
    const currentReceived = this.currentBytesReceived.get(tunnelId) || 0;
    const currentSent = this.currentBytesSent.get(tunnelId) || 0;

    this.currentBytesReceived.set(tunnelId, currentReceived + bytesReceived);
    this.currentBytesSent.set(tunnelId, currentSent + bytesSent);

    // Ensure rate history exists for this tunnel
    if (!this.rateHistory.has(tunnelId)) {
      this.rateHistory.set(tunnelId, []);
    }

    // Also update total traffic in real-time to keep Total Traffic and Current Session in sync
    // Use async but don't await to avoid blocking
    this.updateTunnelStatsAsync(tunnelId, bytesReceived, bytesSent, activeConnections);
  }

  // Async method to update total traffic without blocking
  private async updateTunnelStatsAsync(
    tunnelId: number,
    bytesReceived: number,
    bytesSent: number,
    activeConnections?: number
  ): Promise<void> {
    try {
      // Use provided connection count or fall back to reasonable default
      const connections = activeConnections !== undefined ? activeConnections : 0;

      const stmt = this.db.prepare(`
        UPDATE tunnel_stats 
        SET total_bytes_received = total_bytes_received + ?, 
            total_bytes_sent = total_bytes_sent + ?,
            active_connections = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE tunnel_id = ?
      `);
      stmt.run(bytesReceived, bytesSent, connections, tunnelId);
    } catch (error) {
      console.error('Error updating total traffic:', error);
    }
  }

  private async loadCurrentSessionData(): Promise<void> {
    try {
      // Check if this is a web process
      const isWebProcess = typeof window !== 'undefined' || process.env.NEXT_RUNTIME === 'nodejs';

      if (isWebProcess) {
        // Web server: Load current session data from database (read-only)
        const stats = this.db
          .prepare('SELECT tunnel_id, current_bytes_received, current_bytes_sent FROM tunnel_stats')
          .all() as unknown as {
          tunnel_id: number;
          current_bytes_received: number;
          current_bytes_sent: number;
        }[];

        for (const stat of stats) {
          // Use data from database
          this.currentBytesReceived.set(stat.tunnel_id, Number(stat.current_bytes_received) || 0);
          this.currentBytesSent.set(stat.tunnel_id, Number(stat.current_bytes_sent) || 0);

          // Initialize rate history for all tunnels
          if (!this.rateHistory.has(stat.tunnel_id)) {
            this.rateHistory.set(stat.tunnel_id, []);
          }
        }
      } else {
        // SSH server: Initialize to 0 and let updateSessionStats track data
        const stats = this.db.prepare('SELECT tunnel_id FROM tunnel_stats').all() as unknown as {
          tunnel_id: number;
        }[];

        for (const stat of stats) {
          // Initialize current session data to 0 for SSH server
          this.currentBytesReceived.set(stat.tunnel_id, 0);
          this.currentBytesSent.set(stat.tunnel_id, 0);

          // Initialize rate history for all tunnels
          if (!this.rateHistory.has(stat.tunnel_id)) {
            this.rateHistory.set(stat.tunnel_id, []);
            // Add initial data point to prevent null returns
            this.rateHistory.get(stat.tunnel_id)!.push({
              timestamp: new Date(),
              bytes_per_second_received: 0,
              bytes_per_second_sent: 0,
              current_bytes_received: 0,
              current_bytes_sent: 0,
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to initialize current session data:', error);
    }
  }

  // New method to update just the active connections count without modifying byte counters
  async updateTunnelConnections(tunnelId: number, activeConnections: number): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE tunnel_stats 
      SET active_connections = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE tunnel_id = ?
    `);
    stmt.run(activeConnections, tunnelId);
  }

  // Method to update tunnel online status based on SSH connection
  async updateTunnelOnlineStatus(tunnelId: number, isOnline: boolean): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE tunnel_stats 
      SET is_online = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE tunnel_id = ?
    `);
    stmt.run(Number(isOnline) ? 1 : 0, tunnelId);
  }

  // Method to check if a tunnel is online
  async isTunnelOnline(tunnelId: number): Promise<boolean> {
    const stmt = this.db.prepare('SELECT is_online FROM tunnel_stats WHERE tunnel_id = ?');
    const row = stmt.get(tunnelId) as Row;
    return row ? (row.is_online as number) === 1 : false;
  }

  // Method to check if any tunnel with a specific external port is online
  async isTunnelWithPortOnline(port: number): Promise<boolean> {
    const stmt = this.db.prepare(`
      SELECT ts.is_online 
      FROM tunnel_stats ts
      JOIN tunnels t ON ts.tunnel_id = t.id
      WHERE t.external_port = ?
    `);
    const row = stmt.get(port) as Row;
    return row ? (row.is_online as number) === 1 : false;
  }

  async resetCurrentSessionStats(tunnelId: number): Promise<void> {
    // Only reset in-memory counters, not database
    this.currentBytesReceived.set(tunnelId, 0);
    this.currentBytesSent.set(tunnelId, 0);

    // Reset database values for current session only (not total)
    const stmt = this.db.prepare(`
      UPDATE tunnel_stats 
      SET current_bytes_received = 0,
          current_bytes_sent = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE tunnel_id = ?
    `);
    stmt.run(tunnelId);
  }

  // New method to clear all tunnels' session statistics, active connections, and online status
  async clearAllTunnelsSessionState(): Promise<void> {
    try {
      console.log('Clearing all tunnels session state...');

      // Get all tunnel IDs
      const tunnelIds = await this.getAllTunnelIds();

      // Clear current session data for all tunnels in memory
      for (const tunnelId of tunnelIds) {
        this.currentBytesReceived.set(tunnelId, 0);
        this.currentBytesSent.set(tunnelId, 0);

        // Clear rate history for all tunnels
        if (this.rateHistory.has(tunnelId)) {
          this.rateHistory.set(tunnelId, []);
          // Add initial data point to prevent null returns
          this.rateHistory.get(tunnelId)!.push({
            timestamp: new Date(),
            bytes_per_second_received: 0,
            bytes_per_second_sent: 0,
            current_bytes_received: 0,
            current_bytes_sent: 0,
          });
        }
      }

      // Reset all tunnel statistics in database
      this.db.exec(`
        UPDATE tunnel_stats 
        SET current_bytes_received = 0,
            current_bytes_sent = 0,
            active_connections = 0,
            is_online = 0,
            updated_at = CURRENT_TIMESTAMP
      `);

      console.log(`Cleared session state for ${tunnelIds.length} tunnels`);
    } catch (error) {
      console.error('Error clearing all tunnel session state:', error);
    }
  }

  private mapRowToTunnelStats(row: Row): TunnelStats {
    return {
      id: Number(row.id),
      tunnel_id: Number(row.tunnel_id),
      total_bytes_received: Number(row.total_bytes_received),
      total_bytes_sent: Number(row.total_bytes_sent),
      current_bytes_received: Number(row.current_bytes_received),
      current_bytes_sent: Number(row.current_bytes_sent),
      active_connections: Number(row.active_connections),
      is_online: Number(Number(row.is_online) === 1),
      created_at: parseDatabaseDate(String(row.created_at)).toISOString(),
      updated_at: parseDatabaseDate(String(row.updated_at)).toISOString(),
    };
  }

  private mapRowToTunnelStatsWithInfo(
    row: Row & { tunnel_name: string; external_port: number; user_id: number }
  ): TunnelStatsWithInfo {
    return {
      ...this.mapRowToTunnelStats(row),
      tunnel_name: String(row.tunnel_name),
      external_port: Number(row.external_port),
      user_id: Number(row.user_id),
    };
  }

  private startStatsTracking(): void {
    // Only SSH server should calculate rates and sync data
    // Web server should only read data
    const isWebProcess = typeof window !== 'undefined' || process.env.NEXT_RUNTIME === 'nodejs';

    if (!isWebProcess) {
      console.log('Starting stats tracking for SSH server');
      // Update rates every 5 seconds
      this.statsUpdateInterval = setInterval(async () => {
        await this.calculateAndStoreRates();
      }, 5000);
    } else {
      console.log('Web server detected - not starting stats tracking');
    }
  }

  private startAccessLogCleanup(): void {
    // Run cleanup daily at 2 AM
    const now = new Date();
    const nextCleanup = new Date(now);
    nextCleanup.setHours(2, 0, 0, 0); // 2:00 AM

    // If it's already past 2 AM today, schedule for tomorrow
    if (now.getTime() > nextCleanup.getTime()) {
      nextCleanup.setDate(nextCleanup.getDate() + 1);
    }

    const timeUntilCleanup = nextCleanup.getTime() - now.getTime();

    console.log(
      `Scheduling access log cleanup in ${Math.round(timeUntilCleanup / (1000 * 60 * 60))} hours`
    );

    setTimeout(() => {
      this.cleanupOldAccessLogs();
      // Schedule daily cleanup
      setInterval(() => this.cleanupOldAccessLogs(), 24 * 60 * 60 * 1000); // Every 24 hours
    }, timeUntilCleanup);
  }

  private async cleanupOldAccessLogs(): Promise<void> {
    try {
      // Delete logs older than 31 days
      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();

      const stmt = this.db.prepare(
        `DELETE FROM client_access_logs WHERE connection_start_time < ?`
      );
      const result = stmt.run(thirtyOneDaysAgo);

      console.log(`Cleaned up ${result.changes} old access log entries (older than 31 days)`);
    } catch (error) {
      console.error('Error cleaning up old access logs:', error);
    }
  }

  private async calculateAndStoreRates(): Promise<void> {
    const now = new Date();

    // Get all tunnel IDs to ensure we're calculating rates for all of them
    try {
      const tunnelIds = await this.getAllTunnelIds();

      for (const tunnelId of tunnelIds) {
        const currentReceived = this.currentBytesReceived.get(tunnelId) || 0;
        const currentSent = this.currentBytesSent.get(tunnelId) || 0;

        // Get historical data for rate calculation
        if (!this.rateHistory.has(tunnelId)) {
          this.rateHistory.set(tunnelId, []);
        }

        const history = this.rateHistory.get(tunnelId)!;

        // Keep only last 12 data points (1 minute of history)
        if (history.length >= 12) {
          history.shift();
        }

        // Calculate rate (difference from last reading / time interval)
        let rateReceived = 0;
        let rateSent = 0;

        if (history.length > 0) {
          const lastReading = history[history.length - 1];
          const timeDiff = (now.getTime() - lastReading.timestamp.getTime()) / 1000; // seconds

          if (timeDiff > 0) {
            rateReceived =
              (currentReceived - (history[history.length - 1]?.current_bytes_received || 0)) /
              timeDiff;
            rateSent =
              (currentSent - (history[history.length - 1]?.current_bytes_sent || 0)) / timeDiff;
          }
        }

        const newEntry = {
          timestamp: now,
          bytes_per_second_received: Math.max(0, Number(rateReceived) || 0),
          bytes_per_second_sent: Math.max(0, Number(rateSent) || 0),
          current_bytes_received: Number(currentReceived) || 0,
          current_bytes_sent: Number(currentSent) || 0,
        };

        history.push(newEntry);
        this.rateHistory.set(tunnelId, history);

        // Save rate data to database for cross-process sharing
        const stmt = this.db.prepare(`
          INSERT INTO rate_history (tunnel_id, timestamp, bytes_per_second_received, bytes_per_second_sent, current_bytes_received, current_bytes_sent)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          tunnelId,
          now.toISOString(),
          newEntry.bytes_per_second_received,
          newEntry.bytes_per_second_sent,
          newEntry.current_bytes_received,
          newEntry.current_bytes_sent
        );

        // Also sync in-memory stats to database periodically
        await this.syncSessionStatsToDatabase(tunnelId, currentReceived, currentSent);
      }

      // Clean up old rate history records (keep only last 2 minutes)
      // This is executed after all tunnel rates are calculated to minimize impact
      // 2 minutes is sufficient for real-time monitoring while keeping database size minimal
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const cleanupStmt = this.db.prepare(`DELETE FROM rate_history WHERE timestamp < ?`);
      cleanupStmt.run(twoMinutesAgo);
    } catch (error) {
      console.error('Error calculating rates:', error);
    }
  }

  // New method to sync session stats to database
  private async syncSessionStatsToDatabase(
    tunnelId: number,
    currentReceived: number,
    currentSent: number
  ): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        UPDATE tunnel_stats 
        SET current_bytes_received = ?,
            current_bytes_sent = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE tunnel_id = ?
      `);
      stmt.run(currentReceived, currentSent, tunnelId);
    } catch (error) {
      console.error('Error syncing session stats to database:', error);
    }
  }

  private async updateCurrentSessionData(): Promise<void> {
    try {
      // Update current session data for all tunnels in memory
      for (const [tunnelId, currentReceived] of this.currentBytesReceived.entries()) {
        const currentSent = this.currentBytesSent.get(tunnelId) || 0;

        const stmt = this.db.prepare(`
          UPDATE tunnel_stats 
          SET current_bytes_received = ?,
              current_bytes_sent = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE tunnel_id = ?
        `);
        stmt.run(Number(currentReceived) || 0, Number(currentSent) || 0, tunnelId);
      }
    } catch (error) {
      console.error('Error updating current session data:', error);
    }
  }

  async getAllTunnelIds(): Promise<number[]> {
    try {
      const tunnels = this.db.prepare('SELECT id FROM tunnels').all() as unknown as TunnelRow[];
      return tunnels.map((t) => Number(t.id));
    } catch (error) {
      console.error('Error fetching tunnel IDs:', error);
      return [];
    }
  }

  async getRealtimeStats(tunnelId: number): Promise<RealtimeStats | null> {
    // Check if this is a web process
    const isWebProcess = typeof window !== 'undefined' || process.env.NEXT_RUNTIME === 'nodejs';

    if (isWebProcess) {
      try {
        const stmt = this.db.prepare(`
          SELECT * FROM rate_history 
          WHERE tunnel_id = ? 
          ORDER BY timestamp DESC 
          LIMIT 1
        `);
        const latest = stmt.get(tunnelId) as unknown as RateHistoryRow | undefined;

        if (latest) {
          return {
            timestamp: new Date(latest.timestamp),
            bytes_per_second_received: Number(latest.bytes_per_second_received),
            bytes_per_second_sent: Number(latest.bytes_per_second_sent),
          };
        }
      } catch (error) {
        console.error(`getRealtimeStats (Web) - Tunnel ${tunnelId}: Database query error:`, error);
      }
      return null;
    } else {
      // SSH process: Use in-memory history for most up-to-date data
      const history = this.rateHistory.get(tunnelId);

      if (history && history.length > 0) {
        const latest = history[history.length - 1];

        return {
          timestamp: latest.timestamp,
          bytes_per_second_received: latest.bytes_per_second_received,
          bytes_per_second_sent: latest.bytes_per_second_sent,
        };
      }

      return null;
    }
  }

  cleanup(): void {
    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval);
      this.statsUpdateInterval = null;
    }
    console.log('Database cleanup completed');
  }

  // User Settings Methods
  async getUserRefreshInterval(userId: number): Promise<number> {
    try {
      const stmt = this.db.prepare('SELECT refresh_interval FROM user_settings WHERE user_id = ?');
      const setting = stmt.get(userId) as { refresh_interval: number } | undefined;

      return setting ? setting.refresh_interval : 2000; // Default 2 seconds
    } catch (error) {
      console.error('Error getting user refresh interval:', error);
      return 2000; // Default on error
    }
  }

  async setUserRefreshInterval(userId: number, refreshInterval: number): Promise<boolean> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO user_settings (user_id, refresh_interval, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) 
        DO UPDATE SET refresh_interval = ?, updated_at = CURRENT_TIMESTAMP
      `);
      stmt.run(userId, refreshInterval, refreshInterval);

      return true;
    } catch (error) {
      console.error('Error setting user refresh interval:', error);
      return false;
    }
  }

  async getUserLanguage(userId: number): Promise<string> {
    try {
      const stmt = this.db.prepare('SELECT language FROM user_settings WHERE user_id = ?');
      const setting = stmt.get(userId) as { language: string } | undefined;

      return setting ? setting.language : 'zh'; // Default Chinese
    } catch (error) {
      console.error('Error getting user language:', error);
      return 'zh'; // Default on error
    }
  }

  async getUserTheme(userId: number): Promise<string> {
    try {
      const stmt = this.db.prepare('SELECT theme FROM user_settings WHERE user_id = ?');
      const setting = stmt.get(userId) as { theme: string } | undefined;

      return setting ? setting.theme : 'light'; // Default light theme
    } catch (error) {
      console.error('Error getting user theme:', error);
      return 'light'; // Default on error
    }
  }

  async setUserSettings(
    userId: number,
    refreshInterval?: number,
    language?: string,
    theme?: string
  ): Promise<boolean> {
    try {
      // First check if user settings exist
      const stmt = this.db.prepare('SELECT user_id FROM user_settings WHERE user_id = ?');
      const existing = stmt.get(userId);

      if (existing) {
        // Update existing settings
        const updates = [];
        const params = [];

        if (refreshInterval !== undefined) {
          updates.push('refresh_interval = ?');
          params.push(refreshInterval);
        }
        if (language !== undefined) {
          updates.push('language = ?');
          params.push(language);
        }
        if (theme !== undefined) {
          updates.push('theme = ?');
          params.push(theme);
        }

        if (updates.length > 0) {
          updates.push('updated_at = CURRENT_TIMESTAMP');
          params.push(userId);

          const updateStmt = this.db.prepare(
            `UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = ?`
          );
          updateStmt.run(...params);
        }
      } else {
        // Insert new settings
        const insertStmt = this.db.prepare(`
          INSERT INTO user_settings (user_id, refresh_interval, language, theme, updated_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          `);
        insertStmt.run(userId, refreshInterval || 2000, language || 'zh', theme || 'light');
      }

      return true;
    } catch (error) {
      console.error('Error setting user preferences:', error);
      return false;
    }
  }

  async getUserSettings(userId: number): Promise<{
    refresh_interval: number;
    language: string;
    theme: string;
  }> {
    try {
      const stmt = this.db.prepare(
        'SELECT refresh_interval, language, theme FROM user_settings WHERE user_id = ?'
      );
      const setting = stmt.get(userId) as
        | { refresh_interval: number; language: string; theme: string }
        | undefined;

      return setting
        ? {
            refresh_interval: setting.refresh_interval,
            language: setting.language,
            theme: setting.theme,
          }
        : {
            refresh_interval: 2000, // Default 2 seconds
            language: 'zh', // Default Chinese
            theme: 'light', // Default light theme
          };
    } catch (error) {
      console.error('Error getting user settings:', error);
      return {
        refresh_interval: 2000,
        language: 'zh',
        theme: 'light',
      };
    }
  }

  async getSession(token: string): Promise<Session | null> {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE token = ?');
    const row = stmt.get(token) as Row;
    if (!row) return null;

    const session = this.mapRowToSession(row);
    const expiresAt = this.parsePossiblyIsoOrSqliteDate(session.expires_at);

    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      // Best-effort cleanup of expired sessions
      try {
        this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      } catch {
        // ignore
      }
      return null;
    }

    return session;
  }

  async updateUserPassword(userId: number, hashedPassword: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare('UPDATE users SET password = ? WHERE id = ?');
      stmt.run(hashedPassword, userId);
      return true;
    } catch (error) {
      console.error('Error updating user password:', error);
      return false;
    }
  }

  private mapRowToSession(row: Row): Session {
    return {
      id: Number(row.id),
      user_id: Number(row.user_id),
      token: String(row.token),
      expires_at: parseDatabaseDate(String(row.expires_at)).toISOString(),
      created_at: parseDatabaseDate(String(row.created_at)).toISOString(),
    };
  }

  // OTP Methods
  async enableOTP(userId: number, secret: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare('UPDATE users SET otp_secret = ?, otp_enabled = 1 WHERE id = ?');
      stmt.run(secret, userId);
      return true;
    } catch (error) {
      console.error('Error enabling OTP:', error);
      return false;
    }
  }

  async disableOTP(userId: number): Promise<boolean> {
    try {
      const stmt = this.db.prepare(
        'UPDATE users SET otp_secret = NULL, otp_enabled = 0 WHERE id = ?'
      );
      stmt.run(userId);
      return true;
    } catch (error) {
      console.error('Error disabling OTP:', error);
      return false;
    }
  }

  async getUserOtpSecret(userId: number): Promise<string | null> {
    const stmt = this.db.prepare('SELECT otp_secret FROM users WHERE id = ?');
    const row = stmt.get(userId) as Row;
    return row && row.otp_secret ? String(row.otp_secret) : null;
  }

  async isUserOtpEnabled(userId: number): Promise<boolean> {
    const stmt = this.db.prepare('SELECT otp_enabled FROM users WHERE id = ?');
    const row = stmt.get(userId) as Row;
    return row ? (row.otp_enabled as number) === 1 : false;
  }

  async validatePasswordWithOtp(
    username: string,
    password: string,
    otpToken?: string
  ): Promise<User | null> {
    const user = await this.getUserByUsername(username);
    if (!user) return null;

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) return null;

    // If OTP is enabled, validate the OTP token
    if (user.otp_enabled) {
      if (!otpToken) {
        throw new Error('OTP token required');
      }

      const speakeasy = await import('speakeasy');
      const isValidOtp = speakeasy.totp.verify({
        secret: user.otp_secret!,
        encoding: 'base32',
        token: otpToken,
        window: 2, // Allow 2 time windows before and after
      });

      if (!isValidOtp) {
        throw new Error('Invalid OTP token');
      }
    }

    return user;
  }

  // Client Access Logs methods
  async logClientConnection(
    tunnelId: number,
    connectionId: string,
    clientIP: string,
    userAgent?: string
  ): Promise<void> {
    // Get location information for the IP
    const locationInfo = await this.getLocationInfo(clientIP);

    // Store the connection start
    this.activeConnections.set(connectionId, {
      tunnelId,
      startTime: new Date(),
      clientIP,
    });

    const stmt = this.db.prepare(`
      INSERT INTO client_access_logs 
      (tunnel_id, connection_id, client_ip, client_country, client_region, client_city, connection_start_time, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      tunnelId,
      connectionId,
      clientIP,
      locationInfo.country,
      locationInfo.region,
      locationInfo.city,
      new Date().toISOString(),
      userAgent || null
    );
  }

  async logClientDisconnection(
    connectionId: string,
    finalBytesSent: number = 0,
    finalBytesReceived: number = 0
  ): Promise<void> {
    const connection = this.activeConnections.get(connectionId);
    if (!connection) return;

    const endTime = new Date();
    const duration = Math.floor((endTime.getTime() - connection.startTime.getTime()) / 1000);

    const stmt = this.db.prepare(`
      UPDATE client_access_logs 
      SET connection_end_time = ?, duration_seconds = ?, bytes_sent = COALESCE(bytes_sent, 0) + ?, bytes_received = COALESCE(bytes_received, 0) + ?
      WHERE connection_id = ? AND connection_end_time IS NULL
    `);
    stmt.run(endTime.toISOString(), duration, finalBytesSent, finalBytesReceived, connectionId);

    this.activeConnections.delete(connectionId);
  }

  async getClientAccessLogs(tunnelId: number, limit: number = 100): Promise<ClientAccessLogType[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM client_access_logs 
      WHERE tunnel_id = ? 
      ORDER BY connection_start_time DESC 
      LIMIT ?
    `);
    const rows = stmt.all(tunnelId, limit) as unknown as Row[];

    return rows.map((row) => this.mapRowToClientAccessLog(row));
  }

  async getClientAccessLogStats(
    tunnelId: number,
    days: number = 7
  ): Promise<{
    totalConnections: number;
    uniqueIPs: number;
    totalBytesTransferred: number;
    averageConnectionDuration: number;
    topCountries: Array<{ country: string; count: number }>;
    hourlyActivity: Array<{ hour: number; count: number }>;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get total connections
    const totalStmt = this.db.prepare(
      `SELECT COUNT(*) as count FROM client_access_logs WHERE tunnel_id = ? AND connection_start_time >= ?`
    );
    const totalResult = totalStmt.get(tunnelId, startDate.toISOString()) as { count: number };
    const totalConnections = Number(totalResult?.count) || 0;

    // Get unique IPs
    const uniqueIPsStmt = this.db.prepare(
      `SELECT COUNT(DISTINCT client_ip) as count FROM client_access_logs WHERE tunnel_id = ? AND connection_start_time >= ?`
    );
    const uniqueIPsResult = uniqueIPsStmt.get(tunnelId, startDate.toISOString()) as {
      count: number;
    };
    const uniqueIPs = Number(uniqueIPsResult?.count) || 0;

    // Get total bytes transferred
    const bytesStmt = this.db.prepare(
      `SELECT SUM(bytes_sent + bytes_received) as total FROM client_access_logs WHERE tunnel_id = ? AND connection_start_time >= ?`
    );
    const bytesResult = bytesStmt.get(tunnelId, startDate.toISOString()) as { total: number };
    const totalBytesTransferred = Number(bytesResult?.total) || 0;

    // Get average connection duration
    const avgDurationStmt = this.db.prepare(
      `SELECT AVG(duration_seconds) as avg FROM client_access_logs WHERE tunnel_id = ? AND duration_seconds IS NOT NULL AND connection_start_time >= ?`
    );
    const avgDurationResult = avgDurationStmt.get(tunnelId, startDate.toISOString()) as {
      avg: number;
    };
    const averageConnectionDuration = Number(avgDurationResult?.avg) || 0;

    // Get top countries
    const topCountriesStmt = this.db.prepare(
      `SELECT client_country as country, COUNT(*) as count FROM client_access_logs WHERE tunnel_id = ? AND client_country IS NOT NULL AND connection_start_time >= ? GROUP BY client_country ORDER BY count DESC LIMIT 5`
    );
    const topCountriesResult = topCountriesStmt.all(tunnelId, startDate.toISOString()) as {
      country: string;
      count: number;
    }[];
    const topCountries = topCountriesResult.map((row) => ({
      country: String(row.country),
      count: Number(row.count),
    }));

    // Get hourly activity
    const hourlyStmt = this.db.prepare(
      `SELECT CAST(strftime('%H', connection_start_time) AS INTEGER) as hour, COUNT(*) as count FROM client_access_logs WHERE tunnel_id = ? AND connection_start_time >= ? GROUP BY hour ORDER BY hour`
    );
    const hourlyResult = hourlyStmt.all(tunnelId, startDate.toISOString()) as {
      hour: number;
      count: number;
    }[];
    const hourlyActivity = hourlyResult.map((row) => ({
      hour: Number(row.hour),
      count: Number(row.count),
    }));

    return {
      totalConnections,
      uniqueIPs,
      totalBytesTransferred,
      averageConnectionDuration,
      topCountries,
      hourlyActivity,
    };
  }

  private async getLocationInfo(ip: string): Promise<{
    country: string | null;
    region: string | null;
    city: string | null;
  }> {
    // Handle private IPs with special identifiers
    if (this.isPrivateIP(ip)) {
      let locationType = 'Private Network';

      if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
        locationType = 'Localhost';
      } else if (/^10\./.test(ip)) {
        locationType = 'Private Network (10.x.x.x)';
      } else if (/^192\.168\./.test(ip)) {
        locationType = 'Private Network (192.168.x.x)';
      } else if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) {
        locationType = 'Private Network (172.16-31.x.x)';
      } else if (/^fe80:/.test(ip)) {
        locationType = 'Link-Local IPv6';
      }

      return {
        country: 'Local',
        region: locationType,
        city: ip,
      };
    }

    try {
      // Use offline geoip-lite database
      const geo = geoip.lookup(ip);
      if (geo) {
        return {
          country: geo.country,
          region: geo.region,
          city: geo.city,
        };
      }
    } catch (error) {
      console.error('Error getting location info:', error);
    }

    return { country: null, region: null, city: null };
  }

  private isPrivateIP(ip: string): boolean {
    // Check for private IP ranges
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^127\./,
      /^localhost$/,
      /^::1$/,
      /^fe80:/,
    ];

    return privateRanges.some((range) => range.test(ip));
  }

  private mapRowToClientAccessLog(row: Row): ClientAccessLogType {
    return {
      id: Number(row.id),
      tunnel_id: Number(row.tunnel_id),
      connection_id: String(row.connection_id),
      client_ip: String(row.client_ip),
      client_country: row.client_country ? String(row.client_country) : undefined,
      client_region: row.client_region ? String(row.client_region) : undefined,
      client_city: row.client_city ? String(row.client_city) : undefined,
      connection_start_time: parseDatabaseDate(String(row.connection_start_time)).toISOString(),
      connection_end_time: row.connection_end_time
        ? parseDatabaseDate(String(row.connection_end_time)).toISOString()
        : undefined,
      duration_seconds: row.duration_seconds ? Number(row.duration_seconds) : undefined,
      bytes_sent: Number(row.bytes_sent),
      bytes_received: Number(row.bytes_received),
      user_agent: row.user_agent ? String(row.user_agent) : undefined,
      created_at: parseDatabaseDate(String(row.created_at)).toISOString(),
    };
  }
}

// Export a function that returns the singleton instance
export default function getDatabaseInstance(dbPath?: string): Database {
  return Database.getInstance(dbPath);
}

// Also export the Database class for type checking
export { Database };
