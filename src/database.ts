import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// SQLite types
interface RunResult {
  lastID: number;
  changes: number;
}

interface Row {
  [key: string]: any;
}

// Helper function to promisify database methods
const promisifyDb = (db: sqlite3.Database) => ({
  run: promisify((sql: string, params: any[], callback: (err: Error | null, result: RunResult) => void) => {
    db.run(sql, params, function(err) {
      callback(err, { lastID: this.lastID, changes: this.changes });
    });
  }),
  get: promisify((sql: string, params: any[], callback: (err: Error | null, row: Row) => void) => {
    db.get(sql, params, callback);
  }),
  all: promisify((sql: string, params: any[], callback: (err: Error | null, rows: Row[]) => void) => {
    db.all(sql, params, callback);
  })
});

export interface User {
  id: number;
  username: string;
  password: string;
  created_at: Date;
}

export interface Tunnel {
  id: number;
  user_id: number;
  name: string;
  target_host: string;
  target_port: number;
  local_port: number;
  created_at: Date;
}

export interface Session {
  id: number;
  user_id: number;
  token: string;
  expires_at: Date;
  created_at: Date;
}

class Database {
  private db: sqlite3.Database;
  private jwtSecret: string;

  constructor(dbPath: string = './sshbridge.db') {
    this.db = new sqlite3.Database(dbPath);
    this.jwtSecret = process.env.JWT_SECRET || 'default-secret-key-change-in-production';
    this.init();
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
      CREATE TABLE IF NOT EXISTS tunnels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        target_host TEXT NOT NULL,
        target_port INTEGER NOT NULL,
        local_port INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
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

  private mapRowToUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      password: row.password,
      created_at: new Date(row.created_at)
    };
  }

  async validatePassword(username: string, password: string): Promise<User | null> {
    const user = await this.getUserByUsername(username);
    if (!user) return null;
    
    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  async createTunnel(userId: number, name: string, targetHost: string, targetPort: number, localPort: number): Promise<Tunnel> {
    const { run } = promisifyDb(this.db);
    
    const result = await run(
      'INSERT INTO tunnels (user_id, name, target_host, target_port, local_port) VALUES (?, ?, ?, ?, ?)',
      [userId, name, targetHost, targetPort, localPort]
    );
    
    const tunnel = await this.getTunnelById(result.lastID);
    if (!tunnel) throw new Error('Failed to create tunnel');
    return tunnel;
  }

  async getTunnelsByUserId(userId: number): Promise<Tunnel[]> {
    const { all } = promisifyDb(this.db);
    const rows = await all('SELECT * FROM tunnels WHERE user_id = ?', [userId]);
    return rows.map(this.mapRowToTunnel);
  }

  async getTunnelById(id: number): Promise<Tunnel | null> {
    const { get } = promisifyDb(this.db);
    const row = await get('SELECT * FROM tunnels WHERE id = ?', [id]);
    return row ? this.mapRowToTunnel(row) : null;
  }

  async updateTunnel(id: number, name: string, targetHost: string, targetPort: number, localPort: number): Promise<Tunnel | null> {
    const { run } = promisifyDb(this.db);
    
    await run(
      'UPDATE tunnels SET name = ?, target_host = ?, target_port = ?, local_port = ? WHERE id = ?',
      [name, targetHost, targetPort, localPort, id]
    );
    
    return this.getTunnelById(id);
  }

  async deleteTunnel(id: number): Promise<boolean> {
    const { run } = promisifyDb(this.db);
    const result = await run('DELETE FROM tunnels WHERE id = ?', [id]);
    return result.changes > 0;
  }

  private mapRowToTunnel(row: any): Tunnel {
    return {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      target_host: row.target_host,
      target_port: row.target_port,
      local_port: row.local_port,
      created_at: new Date(row.created_at)
    };
  }

  async createSession(userId: number): Promise<string> {
    const token = jwt.sign({ userId }, this.jwtSecret, { expiresIn: '24h' });
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    
    const { run } = promisifyDb(this.db);
    await run(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
      [userId, token, expiresAt.toISOString()]
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
}

export default Database;