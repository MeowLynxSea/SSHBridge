import { Server } from 'ssh2';
import { Socket, createConnection } from 'net';
import { Connection } from 'ssh2';
import Database from './database';
import { Tunnel } from './database';
import './types/ssh2.d';

export interface SSHServerConfig {
  host?: string;
  port: number;
  hostKey: string;
}

export class SSHBridgeServer {
  private sshServer: Server;
  private database: Database;
  private config: SSHServerConfig;
  private tunnels: Map<string, { connection: Connection; tunnel: Tunnel }> = new Map();

  constructor(config: SSHServerConfig, database: Database) {
    this.config = config;
    this.database = database;
    this.sshServer = new Server({
      hostKeys: [config.hostKey],
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.sshServer.on('connection', (conn: Connection) => {
      console.log('New SSH connection');

      conn.on('authentication', async (ctx: any) => {
        if (ctx.method === 'password') {
          const user = await this.database.validatePassword(ctx.username, ctx.password);
          if (user) {
            ctx.accept();
            this.handleAuthenticatedConnection(conn, user);
          } else {
            ctx.reject();
          }
        } else {
          ctx.reject();
        }
      });

      conn.on('error', (err: Error) => {
        console.error('SSH connection error:', err);
      });
    });
  }

  private handleAuthenticatedConnection(conn: Connection, user: any) {
    console.log(`User ${user.username} authenticated`);

    conn.on('session', (accept) => {
      const session = accept();

      session.on('channel', (accept: any, reject: any, info: any) => {
        if (info.type === 'direct-tcpip') {
          this.handleDirectTcpip(conn, accept, reject, info, user);
        } else {
          reject();
        }
      });
    });

    conn.on('error', (err: Error) => {
      console.error(`Connection error for user ${user.username}:`, err);
      this.cleanupConnection(conn);
    });

    conn.on('end', () => {
      console.log(`Connection ended for user ${user.username}`);
      this.cleanupConnection(conn);
    });
  }

  private async handleDirectTcpip(
    conn: Connection,
    accept: any,
    reject: any,
    info: any,
    user: any
  ) {
    try {
      const tunnels = await this.database.getTunnelsByUserId(user.id);
      
      const tunnel = tunnels.find(t => 
        t.local_port === info.destPort && 
        t.target_host === info.destAddr
      );

      if (!tunnel) {
        reject();
        console.log(`No tunnel found for ${info.destAddr}:${info.destPort}`);
        return;
      }

      console.log(`Creating tunnel: ${tunnel.name} -> ${tunnel.target_host}:${tunnel.target_port}`);

      const channel = accept();
      
      const socket = createConnection({
        host: tunnel.target_host,
        port: tunnel.target_port
      }) as Socket;

      socket.on('connect', () => {
        console.log(`Connected to target ${tunnel.target_host}:${tunnel.target_port}`);
      });

      socket.on('data', (data: Buffer) => {
        channel.write(data);
      });

      channel.on('data', (data: Buffer) => {
        socket.write(data);
      });

      socket.on('error', (err: Error) => {
        console.error(`Target connection error: ${err.message}`);
        channel.close();
      });

      channel.on('close', () => {
        socket.end();
      });

      socket.on('close', () => {
        channel.close();
      });

      this.tunnels.set(`${conn.id}_${info.destPort}`, { connection: conn, tunnel });
      
    } catch (error) {
      console.error('Error handling direct-tcpip:', error);
      reject();
    }
  }

  private cleanupConnection(conn: Connection) {
    for (const [key, value] of this.tunnels.entries()) {
      if (value.connection === conn) {
        console.log(`Cleaning up tunnel: ${value.tunnel.name}`);
        this.tunnels.delete(key);
      }
    }
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sshServer.listen(this.config.port, this.config.host || '0.0.0.0', () => {
        console.log(`SSH server listening on ${this.config.host || '0.0.0.0'}:${this.config.port}`);
        resolve();
      }).on('error', reject);
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const [key, value] of this.tunnels.entries()) {
        value.connection.end();
        this.tunnels.delete(key);
      }
      
      this.sshServer.close(() => {
        console.log('SSH server stopped');
        resolve();
      });
    });
  }

  getActiveTunnels(): Array<{ tunnel: Tunnel; user: string }> {
    return Array.from(this.tunnels.values()).map(value => ({
      tunnel: value.tunnel,
      user: 'unknown' // We would need to track users separately
    }));
  }
}