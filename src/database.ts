import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { TunnelStats, RealtimeStats, TunnelStatsWithInfo } from './types/stats';
import { parseDatabaseDate, createFutureTime } from './utils/timeUtils';

// SQLite types
interface RunResult {
  lastID: number;
  changes: number;
}

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

// Helper function to promisify database methods
const promisifyDb = (db: sqlite3.Database) => ({
  run: promisify((sql: string, params: unknown[], callback: (err: Error | null, result: RunResult) => void) => {
    db.run(sql, params, function(err) {
      callback(err, { lastID: this.lastID, changes: this.changes });
    });
  }),
  get: promisify((sql: string, params: unknown[], callback: (err: Error | null, row: Row) => void) => {
    db.get(sql, params, callback);
  }),
  all: promisify((sql: string, params: unknown[], callback: (err: Error | null, rows: Row[]) => void) => {
    db.all(sql, params, callback);
  })
});

export interface User {
  id: number;
  username: string;
  password: string;
  created_at: string;
}

export interface Tunnel {
  id: number;
  user_id: number;
  name: string;
  external_port: number;
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
  private db: sqlite3.Database;
  private jwtSecret: string;
  private statsUpdateInterval: ReturnType<typeof setInterval> | null = null;
  private currentBytesReceived: Map<number, number> = new Map();
  private currentBytesSent: Map<number, number> = new Map();
  private rateHistory: Map<number, Array<RealtimeStats>> = new Map();

  private constructor(dbPath: string = './sshbridge.db') {
    this.db = new sqlite3.Database(dbPath);
    this.jwtSecret = process.env.JWT_SECRET || 'default-secret-key-change-in-production';
    this.init();
  }

  static getInstance(dbPath?: string): Database {
    if (!Database.instance) {
      Database.instance = new Database(dbPath);
    }
    return Database.instance;
  }

  private async init() {
    const { run } = promisifyDb(this.db);
    
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, []);

    await run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `, []);
    
    // Create user settings table
    await run(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        refresh_interval INTEGER NOT NULL DEFAULT 2000,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `, []);
    
    // Check if tunnels table exists
    const { get, all } = promisifyDb(this.db);
    const tableInfo = await get("SELECT name FROM sqlite_master WHERE type='table' AND name='tunnels'", []);
    
    if (tableInfo) {
      // Check if we need to migrate from old schema to new schema
      const columns = await all("PRAGMA table_info(tunnels)", []) as unknown as TableColumn[];
      const hasOldColumns = columns.some((col) => col.name === 'local_port') && 
                            !columns.some((col) => col.name === 'external_port');
      
      if (hasOldColumns) {
        console.log('Migrating tunnels database from old schema to new schema...');
        
        // Create a new table with the updated schema
        await run(`
          CREATE TABLE tunnels_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            external_port INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
          )
        `, []);
        
        // Migrate data from old table to new table
        await run(`
          INSERT INTO tunnels_new (id, user_id, name, external_port, created_at)
          SELECT id, user_id, name, local_port, created_at FROM tunnels
        `, []);
        
        // Drop the old table and rename the new one
        await run('DROP TABLE tunnels', []);
        await run('ALTER TABLE tunnels_new RENAME TO tunnels', []);
        
        console.log('Database migration completed');
      } else if (!columns.some((col) => col.name === 'external_port')) {
        // Table exists but doesn't have external_port column, create it with default schema
        await run('DROP TABLE tunnels', []);
      }
    }
    
    // Create the tunnels table with the new schema if it doesn't exist
    await run(`
      CREATE TABLE IF NOT EXISTS tunnels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        external_port INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `, []);

    // Create the tunnel_stats table
    await run(`
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
    `, []);

    // Check if we need to add the is_online column (for backward compatibility)
    const statsTableInfo = await all("PRAGMA table_info(tunnel_stats)", []) as unknown as TableColumn[];
    const hasOnlineColumn = statsTableInfo.some((col) => col.name === 'is_online');
    
    if (!hasOnlineColumn) {
      console.log('Adding is_online column to tunnel_stats table for backward compatibility');
      await run('ALTER TABLE tunnel_stats ADD COLUMN is_online INTEGER DEFAULT 0', []);
    }

    // Load existing current session data from database
    await this.loadCurrentSessionData();
    
    // Initialize stats tracking
    this.startStatsTracking();
  }

  async createUser(username: string, password: string): Promise<User> {
    const hashedPassword = await bcrypt.hash(password, 10);
    const { run } = promisifyDb(this.db);
    
    const result = await run(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username, hashedPassword]
    );
    
    const user = await this.getUserById(result.lastID);
    if (!user) throw new Error('Failed to create user');
    return user;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const { get } = promisifyDb(this.db);
    const row = await get('SELECT * FROM users WHERE username = ?', [username]);
    return row ? this.mapRowToUser(row) : null;
  }

  async getUserById(id: number): Promise<User | null> {
    const { get } = promisifyDb(this.db);
    const row = await get('SELECT * FROM users WHERE id = ?', [id]);
    return row ? this.mapRowToUser(row) : null;
  }

  private mapRowToUser(row: Row): User {
    return {
      id: Number(row.id),
      username: String(row.username),
      password: String(row.password),
      created_at: parseDatabaseDate(String(row.created_at)).toISOString()
    };
  }

  async validatePassword(username: string, password: string): Promise<User | null> {
    const user = await this.getUserByUsername(username);
    if (!user) return null;
    
    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  async createTunnel(userId: number, name: string, externalPort: number): Promise<Tunnel> {
    const { run } = promisifyDb(this.db);
    
    const result = await run(
      'INSERT INTO tunnels (user_id, name, external_port) VALUES (?, ?, ?)',
      [userId, name, externalPort]
    );
    
    const tunnel = await this.getTunnelById(result.lastID);
    if (!tunnel) throw new Error('Failed to create tunnel');
    
    // Create stats record for the new tunnel
    await this.createTunnelStats(tunnel.id);
    
    return tunnel;
  }

  async getTunnelsByUserId(userId: number): Promise<Tunnel[]> {
    const { all } = promisifyDb(this.db);
    const rows = await all('SELECT * FROM tunnels WHERE user_id = ?', [userId]);
    return rows.map(row => this.mapRowToTunnel(row));
  }

  async getTunnelById(id: number): Promise<Tunnel | null> {
    const { get } = promisifyDb(this.db);
    const row = await get('SELECT * FROM tunnels WHERE id = ?', [id]);
    return row ? this.mapRowToTunnel(row) : null;
  }

  async updateTunnel(id: number, name: string, externalPort: number): Promise<Tunnel | null> {
    const { run } = promisifyDb(this.db);
    
    await run(
      'UPDATE tunnels SET name = ?, external_port = ? WHERE id = ?',
      [name, externalPort, id]
    );
    
    return this.getTunnelById(id);
  }

  async deleteTunnel(id: number): Promise<boolean> {
    const { run } = promisifyDb(this.db);
    const result = await run('DELETE FROM tunnels WHERE id = ?', [id]);
    return result.changes > 0;
  }

  private mapRowToTunnel(row: Row): Tunnel {
    return {
      id: Number(row.id),
      user_id: Number(row.user_id),
      name: String(row.name),
      external_port: Number(row.external_port),
      created_at: parseDatabaseDate(String(row.created_at)).toISOString()
    };
  }

  async createSession(userId: number): Promise<string> {
    const token = jwt.sign({ userId }, this.jwtSecret, { expiresIn: '24h' });
    const expiresAt = createFutureTime(24);
    
    const { run } = promisifyDb(this.db);
    await run(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
      [userId, token, expiresAt]
    );
    
    return token;
  }

  async validateSession(token: string): Promise<User | null> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { userId: number };
      const user = await this.getUserById(decoded.userId);
      return user;
    } catch {
      return null;
    }
  }

  async deleteSession(token: string): Promise<boolean> {
    const { run } = promisifyDb(this.db);
    const result = await run('DELETE FROM sessions WHERE token = ?', [token]);
    return result.changes > 0;
  }

  // Statistics methods
  async createTunnelStats(tunnelId: number): Promise<TunnelStats> {
    const { run } = promisifyDb(this.db);
    
    await run(
      'INSERT INTO tunnel_stats (tunnel_id) VALUES (?)',
      [tunnelId]
    );
    
    // Initialize rate history for the new tunnel
    if (!this.rateHistory.has(tunnelId)) {
      this.rateHistory.set(tunnelId, []);
      // Add initial data point
      this.rateHistory.get(tunnelId)!.push({
        timestamp: new Date(),
        bytes_per_second_received: 0,
        bytes_per_second_sent: 0,
        current_bytes_received: 0,
        current_bytes_sent: 0
      });
    }
    
    const stats = await this.getTunnelStatsByTunnelId(tunnelId);
    if (!stats) throw new Error('Failed to create tunnel stats');
    return stats;
  }

  async getTunnelStatsByTunnelId(tunnelId: number): Promise<TunnelStats | null> {
    const { get } = promisifyDb(this.db);
    const row = await get('SELECT * FROM tunnel_stats WHERE tunnel_id = ?', [tunnelId]);
    return row ? this.mapRowToTunnelStats(row) : null;
  }

  async getTunnelStatsByUserId(userId: number): Promise<TunnelStatsWithInfo[]> {
    const { all } = promisifyDb(this.db);
    
    // First, ensure all tunnels have stats records
    const tunnels = await all('SELECT * FROM tunnels WHERE user_id = ?', [userId]) as unknown as Tunnel[];
    for (const tunnel of tunnels) {
      const existingStats = await this.getTunnelStatsByTunnelId(Number(tunnel.id));
      if (!existingStats) {
        await this.createTunnelStats(Number(tunnel.id));
      }
    }
    
    const rows = await all(`
      SELECT ts.*, t.name as tunnel_name, t.external_port, t.user_id
      FROM tunnel_stats ts
      JOIN tunnels t ON ts.tunnel_id = t.id
      WHERE t.user_id = ?
    `, [userId]) as (Row & { tunnel_name: string; external_port: number; user_id: number })[];
    const castRows = rows as (Row & { tunnel_name: string; external_port: number; user_id: number })[];
    return castRows.map(row => this.mapRowToTunnelStatsWithInfo(row));
  }

  async getAllTunnelStats(): Promise<TunnelStatsWithInfo[]> {
    const { all } = promisifyDb(this.db);
    
    // First, ensure all tunnels have stats records
    const tunnels = await all('SELECT * FROM tunnels', []) as unknown as Tunnel[];
    for (const tunnel of tunnels) {
      const existingStats = await this.getTunnelStatsByTunnelId(Number(tunnel.id));
      if (!existingStats) {
        await this.createTunnelStats(Number(tunnel.id));
      }
    }
    
    const rows = await all(`
      SELECT ts.*, t.name as tunnel_name, t.external_port, t.user_id
      FROM tunnel_stats ts
      JOIN tunnels t ON ts.tunnel_id = t.id
    `, []) as (Row & { tunnel_name: string; external_port: number; user_id: number })[];
    const castRows = rows as (Row & { tunnel_name: string; external_port: number; user_id: number })[];
    return castRows.map(row => this.mapRowToTunnelStatsWithInfo(row));
  }

  async updateTunnelStats(tunnelId: number, bytesReceived: number, bytesSent: number, activeConnections: number): Promise<void> {
    const { run } = promisifyDb(this.db);
    
    // Track current session data
    this.currentBytesReceived.set(tunnelId, (this.currentBytesReceived.get(tunnelId) || 0) + bytesReceived);
    this.currentBytesSent.set(tunnelId, (this.currentBytesSent.get(tunnelId) || 0) + bytesSent);
    
    // Ensure rate history exists for this tunnel
    if (!this.rateHistory.has(tunnelId)) {
      this.rateHistory.set(tunnelId, []);
    }
    
    await run(`
      UPDATE tunnel_stats 
      SET total_bytes_received = total_bytes_received + ?, 
          total_bytes_sent = total_bytes_sent + ?,
          current_bytes_received = ?,
          current_bytes_sent = ?,
          active_connections = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE tunnel_id = ?
    `, [bytesReceived, bytesSent, Number(this.currentBytesReceived.get(tunnelId)) || 0, Number(this.currentBytesSent.get(tunnelId)) || 0, activeConnections, tunnelId]);
  }

  private async loadCurrentSessionData(): Promise<void> {
    const { all } = promisifyDb(this.db);
    
    try {
      // Load all tunnel stats but don't restore current session data
      // Current session data should start fresh when server starts
      const stats = await all('SELECT tunnel_id FROM tunnel_stats', []) as unknown as { tunnel_id: number }[];
      
      for (const stat of stats) {
        // Initialize current session data to 0 for all tunnels
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
            current_bytes_sent: 0
          });
        }
      }
      
      console.log(`Initialized current session data for ${stats.length} tunnels`);
    } catch (error) {
      console.error('Failed to initialize current session data:', error);
    }
  }

  // New method to update just the active connections count without modifying byte counters
  async updateTunnelConnections(tunnelId: number, activeConnections: number): Promise<void> {
    const { run } = promisifyDb(this.db);
    
    await run(`
      UPDATE tunnel_stats 
      SET active_connections = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE tunnel_id = ?
    `, [activeConnections, tunnelId]);
  }

  // Method to update tunnel online status based on SSH connection
  async updateTunnelOnlineStatus(tunnelId: number, isOnline: boolean): Promise<void> {
    const { run } = promisifyDb(this.db);
    
    await run(`
      UPDATE tunnel_stats 
      SET is_online = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE tunnel_id = ?
    `, [Number(isOnline) ? 1 : 0, tunnelId]);
  }

  // Method to check if a tunnel is online
  async isTunnelOnline(tunnelId: number): Promise<boolean> {
    const { get } = promisifyDb(this.db);
    const row = await get('SELECT is_online FROM tunnel_stats WHERE tunnel_id = ?', [tunnelId]);
    return row ? row.is_online === 1 : false;
  }

  // Method to check if any tunnel with a specific external port is online
  async isTunnelWithPortOnline(port: number): Promise<boolean> {
    const { get } = promisifyDb(this.db);
    const row = await get(`
      SELECT ts.is_online 
      FROM tunnel_stats ts
      JOIN tunnels t ON ts.tunnel_id = t.id
      WHERE t.external_port = ?
    `, [port]);
    return row ? row.is_online === 1 : false;
  }

  async resetCurrentSessionStats(tunnelId: number): Promise<void> {
    const { run } = promisifyDb(this.db);
    
    this.currentBytesReceived.set(tunnelId, 0);
    this.currentBytesSent.set(tunnelId, 0);
    
    await run(`
      UPDATE tunnel_stats 
      SET current_bytes_received = 0,
          current_bytes_sent = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE tunnel_id = ?
    `, [tunnelId]);
  }

  // New method to clear all tunnels' session statistics, active connections, and online status
  async clearAllTunnelsSessionState(): Promise<void> {
    const { run } = promisifyDb(this.db);
    
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
            current_bytes_sent: 0
          });
        }
      }
      
      // Reset all tunnel statistics in database
      await run(`
        UPDATE tunnel_stats 
        SET current_bytes_received = 0,
            current_bytes_sent = 0,
            active_connections = 0,
            is_online = 0,
            updated_at = CURRENT_TIMESTAMP
      `, []);
      
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
      updated_at: parseDatabaseDate(String(row.updated_at)).toISOString()
    };
  }

  private mapRowToTunnelStatsWithInfo(row: Row & { tunnel_name: string; external_port: number; user_id: number }): TunnelStatsWithInfo {
    return {
      ...this.mapRowToTunnelStats(row),
      tunnel_name: String(row.tunnel_name),
      external_port: Number(row.external_port),
      user_id: Number(row.user_id)
    };
  }

  private startStatsTracking(): void {
    // Update rates every 5 seconds
    this.statsUpdateInterval = setInterval(() => {
      this.calculateAndStoreRates();
    }, 5000);
  }

  private calculateAndStoreRates(): void {
    const now = new Date();
    
    // Also include tunnels that might not have data yet but exist in the database
    // We need to fetch all tunnels to ensure we're calculating rates for all of them
    this.getAllTunnelIds().then(tunnelIds => {
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
            rateReceived = (currentReceived - (history[history.length - 1]?.current_bytes_received || 0)) / timeDiff;
            rateSent = (currentSent - (history[history.length - 1]?.current_bytes_sent || 0)) / timeDiff;
          }
        }
        
        history.push({
          timestamp: now,
          bytes_per_second_received: Math.max(0, Number(rateReceived) || 0),
          bytes_per_second_sent: Math.max(0, Number(rateSent) || 0),
          current_bytes_received: Number(currentReceived) || 0,
          current_bytes_sent: Number(currentSent) || 0
        });
        
        this.rateHistory.set(tunnelId, history);
      }
    }).catch(error => {
      console.error('Error calculating rates:', error);
    });
  }
  
  private async updateCurrentSessionData(): Promise<void> {
    const { run } = promisifyDb(this.db);
    
    try {
      // Update current session data for all tunnels in memory
      for (const [tunnelId, currentReceived] of this.currentBytesReceived.entries()) {
        const currentSent = this.currentBytesSent.get(tunnelId) || 0;
        
        await run(`
          UPDATE tunnel_stats 
          SET current_bytes_received = ?,
              current_bytes_sent = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE tunnel_id = ?
        `, [Number(currentReceived) || 0, Number(currentSent) || 0, tunnelId]);
      }
    } catch (error) {
      console.error('Error updating current session data:', error);
    }
  }
  
  async getAllTunnelIds(): Promise<number[]> {
    const { all } = promisifyDb(this.db);
    try {
      const tunnels = await all('SELECT id FROM tunnels', []) as unknown as TunnelRow[];
      return tunnels.map((t) => Number(t.id));
    } catch (error) {
      console.error('Error fetching tunnel IDs:', error);
      return [];
    }
  }

  getRealtimeStats(tunnelId: number): RealtimeStats | null {
    const history = this.rateHistory.get(tunnelId);
    if (!history || history.length === 0) {
      return null;
    }
    
    const latest = history[history.length - 1];
    return {
      timestamp: latest.timestamp,
      bytes_per_second_received: latest.bytes_per_second_received,
      bytes_per_second_sent: latest.bytes_per_second_sent
    };
  }

  getAverageRates(tunnelId: number, seconds: number = 30): RealtimeStats | null {
    const history = this.rateHistory.get(tunnelId);
    if (!history || history.length === 0) {
      return null;
    }
    
    // Calculate average over the specified time period
    const cutoffTime = new Date(Date.now() - seconds * 1000);
    const relevantData = history.filter(entry => entry.timestamp >= cutoffTime);
    
    if (relevantData.length === 0) {
      return null;
    }
    
    const avgReceiveRate = relevantData.reduce((sum, entry) => sum + entry.bytes_per_second_received, 0) / relevantData.length;
    const avgSendRate = relevantData.reduce((sum, entry) => sum + entry.bytes_per_second_sent, 0) / relevantData.length;
    
    return {
      timestamp: new Date(),
      bytes_per_second_received: avgReceiveRate,
      bytes_per_second_sent: avgSendRate
    };
  }

  cleanup(): void {
    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval);
      this.statsUpdateInterval = null;
    }
  }

  // User Settings Methods
  async getUserRefreshInterval(userId: number): Promise<number> {
    const { get } = promisifyDb(this.db);
    try {
      const setting = await get(
        'SELECT refresh_interval FROM user_settings WHERE user_id = ?',
        [userId]
      ) as { refresh_interval: number } | undefined;
      
      return setting ? setting.refresh_interval : 2000; // Default 2 seconds
    } catch (error) {
      console.error('Error getting user refresh interval:', error);
      return 2000; // Default on error
    }
  }

  async setUserRefreshInterval(userId: number, refreshInterval: number): Promise<boolean> {
    const { run } = promisifyDb(this.db);
    try {
      await run(`
        INSERT INTO user_settings (user_id, refresh_interval, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) 
        DO UPDATE SET refresh_interval = ?, updated_at = CURRENT_TIMESTAMP
      `, [userId, refreshInterval, refreshInterval]);
      
      return true;
    } catch (error) {
      console.error('Error setting user refresh interval:', error);
      return false;
    }
  }
}

// Export a function that returns the singleton instance
export default function getDatabaseInstance(dbPath?: string): Database {
  return Database.getInstance(dbPath);
}

// Also export the Database class for type checking
export { Database };