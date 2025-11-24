import { Socket, createConnection } from 'net';
import * as net from 'net';
import { SSH2Connection, SSH2Channel, SSH2ForwardData, UserData } from './types/ssh2-types';
import { IntegratedRateLimiter } from './integratedRateLimiter';

// Forward declarations to avoid circular dependency
interface Tunnel {
  id: number;
  user_id: number;
  name: string;
  external_port: number;
  max_bandwidth?: number;
  created_at: string;
}

interface Database {
  updateSessionStats(tunnelId: number, bytesReceived: number, bytesSent: number): void;
  updateTunnelStats(tunnelId: number, bytesReceived: number, bytesSent: number, activeConnections: number): void;
  updateTunnelConnections(tunnelId: number, connections: number): void;
  getTunnelById(id: number): Promise<Tunnel | null>;
}

export interface TcpConnectionInfo {
  connectionId: string;
  socket: Socket;
  channel: SSH2Channel;
  bytesReceived: number;
  bytesSent: number;
  tunnelId: number;
}

export interface TcpServerInfo {
  server: net.Server;
  bindAddr: string;
  bindPort: number;
  tunnelId: number;
  userId: number;
  username: string;
  connection: SSH2Connection; // SSH connection
}

export class TcpServerManager {
  private servers: Map<string, TcpServerInfo> = new Map();
  private connections: Map<number, Set<string>> = new Map();
  private database: Database;
  private readonly maxConnections: number = 1000; // Maximum connections per tunnel
  private readonly connectionTimeout: number = 30000; // 30 seconds default timeout
  private rateLimiter: IntegratedRateLimiter;

  constructor(database: Database, maxConnections?: number, connectionTimeout?: number) {
    this.database = database;
    if (maxConnections !== undefined) this.maxConnections = maxConnections;
    if (connectionTimeout !== undefined) this.connectionTimeout = connectionTimeout;
    this.rateLimiter = new IntegratedRateLimiter();
  }

  /**
   * Create a TCP server for a tunnel
   */
  async createTcpServer(
    bindAddr: string,
    bindPort: number,
    tunnelId: number,
    userId: number,
    username: string,
    sshConnection: SSH2Connection
  ): Promise<net.Server> {
    const key = `${username}_${bindPort}`;
    
    // Check if server already exists
    if (this.servers.has(key)) {
      throw new Error(`TCP server for ${bindAddr}:${bindPort} already exists`);
    }

    // Create TCP server
    const server = net.createServer((socket: Socket) => {
      this.handleNewConnection(socket, bindAddr, bindPort, tunnelId, sshConnection);
    });

    // Store server info
    this.servers.set(key, {
      server,
      bindAddr,
      bindPort,
      tunnelId,
      userId,
      username,
      connection: sshConnection
    });

    return server;
  }

  /**
   * Start listening on a TCP server
   */
  async startTcpServer(server: net.Server, bindAddr: string, bindPort: number): Promise<void> {
    return new Promise((resolve, reject) => {
      server.listen(bindPort, bindAddr, () => {
        console.log(`TCP server listening on ${bindAddr}:${bindPort}`);
        resolve();
      });

      server.on('error', (err: Error) => {
        console.error(`TCP server error: ${err.message}`);
        reject(err);
      });
    });
  }

  /**
   * Handle new connection to TCP server
   */
  private async handleNewConnection(
    socket: Socket,
    bindAddr: string,
    bindPort: number,
    tunnelId: number,
    sshConnection: SSH2Connection
  ): Promise<void> {
    // Check if we've reached the maximum connections for this tunnel
    const tunnelConnections = this.connections.get(tunnelId);
    if (tunnelConnections && tunnelConnections.size >= this.maxConnections) {
      console.log(`Refusing new connection to ${bindAddr}:${bindPort} - maximum connections (${this.maxConnections}) reached`);
      socket.end();
      return;
    }
    
    // Get tunnel configuration for bandwidth limiting
    const tunnel = await this.database.getTunnelById(tunnelId);
    if (tunnel?.max_bandwidth) {
      // Initialize bandwidth limiting for this tunnel if not already done
      this.rateLimiter.initBucket(tunnelId, {
        maxBandwidth: tunnel.max_bandwidth,
        burstFactor: 1.5, // Allow 50% burst capacity
        enableShaping: true
      }, 'upload');
      
      this.rateLimiter.initBucket(tunnelId, {
        maxBandwidth: tunnel.max_bandwidth,
        burstFactor: 1.5,
        enableShaping: true
      }, 'download');
    }
    
    console.log(`New connection to ${bindAddr}:${bindPort} from ${socket.remoteAddress || 'unknown'}:${socket.remotePort || 'unknown'}`);
    
    // Track this connection for statistics
    const connectionId = `${socket.remoteAddress || 'unknown'}:${socket.remotePort || 'unknown'}-${Date.now()}`;
    if (!this.connections.has(tunnelId)) {
      this.connections.set(tunnelId, new Set());
    }
    this.connections.get(tunnelId)!.add(connectionId);
    
    // Update active connections count
    this.updateTunnelConnectionCount(tunnelId);
    
    // Track data transfer for statistics
    let bytesReceived = 0;
    let bytesSent = 0;
    
    // Set socket timeout with configurable value
    socket.setTimeout(this.connectionTimeout);
    
    // Open a channel back to the SSH client for forwarded-tcpip
    sshConnection.forwardOut(
      bindAddr, 
      bindPort, 
      socket.remoteAddress || '', 
      socket.remotePort || 0, 
      async (err: Error | null, channel: SSH2Channel) => {
        if (err) {
          console.error(`Error opening channel: ${err.message}`);
          this.cleanupConnection(connectionId, tunnelId, bytesReceived, bytesSent);
          socket.end();
          return;
        }
      
        // Create serial data queues to maintain packet order
        const uploadQueue: Buffer[] = [];
        const downloadQueue: Buffer[] = [];
        let uploadProcessing = false;
        let downloadProcessing = false;
        
        // Serial upload processor (socket → channel)
        const processUploadQueue = async () => {
          if (uploadProcessing || uploadQueue.length === 0) return;
          uploadProcessing = true;
          
          while (uploadQueue.length > 0) {
            const data = uploadQueue.shift()!;
            bytesReceived += data.length;
            
            // Update session stats in real-time for rate calculation
            this.database.updateSessionStats(tunnelId, data.length, 0);
            
            // Apply bandwidth limit BEFORE sending data
            if (tunnel?.max_bandwidth) {
              await this.rateLimiter.writeWithRateLimit(tunnelId, data, 'upload');
            }
            
            // Write data to channel (only after bandwidth control is complete)
            channel.write(data);
          }
          
          uploadProcessing = false;
        };
        
        // Serial download processor (channel → socket)
        const processDownloadQueue = async () => {
          if (downloadProcessing || downloadQueue.length === 0) return;
          downloadProcessing = true;
          
          while (downloadQueue.length > 0) {
            const data = downloadQueue.shift()!;
            bytesSent += data.length;
            
            // Update session stats in real-time for rate calculation
            this.database.updateSessionStats(tunnelId, 0, data.length);
            
            // Apply bandwidth limit BEFORE sending data
            if (tunnel?.max_bandwidth) {
              await this.rateLimiter.writeWithRateLimit(tunnelId, data, 'download');
            }
            
            // Write data to socket (only after bandwidth control is complete)
            socket.write(data);
          }
          
          downloadProcessing = false;
        };
      
        // Forward data between socket and channel with bandwidth limiting
        socket.on('data', (data: Buffer) => {
          // Queue data for serial processing (socket → channel)
          uploadQueue.push(data);
          // Process queue in next tick to maintain order
          setImmediate(processUploadQueue);
        });
      
        channel.on('data', (data: Buffer) => {
          // Queue data for serial processing (channel → socket)
          downloadQueue.push(data);
          // Process queue in next tick to maintain order
          setImmediate(processDownloadQueue);
        });
      
      socket.on('close', () => {
        try {
          channel.close();
        } catch {
          // Channel might already be closed, ignore error
        }
        
        this.cleanupConnection(connectionId, tunnelId, bytesReceived, bytesSent);
      });
      
      socket.on('timeout', () => {
        console.log(`Socket timeout for ${bindAddr}:${bindPort}`);
        socket.destroy();
      });
      
      socket.on('error', (err?: Error) => {
        console.error(`Socket error: ${err?.message || 'unknown'}`);
        this.cleanupConnection(connectionId, tunnelId, bytesReceived, bytesSent);
        
        // Close the channel but do NOT affect the SSH connection itself
        try {
          channel.close();
        } catch {
          // Channel might already be closed, ignore error
        }
      });
      
      channel.on('close', () => {
        try {
          socket.destroy(); // Use destroy instead of end for immediate closure
        } catch {
          // Socket might already be closed, ignore error
        }
      });
      
      channel.on('error', (err: Error) => {
        console.error(`Channel error: ${err.message}`);
        this.cleanupConnection(connectionId, tunnelId, bytesReceived, bytesSent);
        
        // Close the socket but do NOT affect the SSH connection itself
        try {
          socket.destroy(); // Use destroy instead of end for immediate closure
        } catch {
          // Socket might already be closed, ignore error
        }
      });
    });
  }

  /**
   * Handle direct-tcpip connections (for local forwarding)
   */
  async handleDirectTcpip(
    sshConnection: SSH2Connection,
    tunnel: Tunnel,
    user: UserData,
    info: SSH2ForwardData,
    accept: () => SSH2Channel
  ): Promise<void> {
    console.log(`Creating tunnel for external port: ${tunnel.name} -> ${tunnel.external_port}`);
    
    // Initialize bandwidth limiting for this tunnel if needed
    if (tunnel.max_bandwidth) {
      this.rateLimiter.initBucket(tunnel.id, {
        maxBandwidth: tunnel.max_bandwidth,
        burstFactor: 1.5, // Allow 50% burst capacity
        enableShaping: true
      }, 'upload');
      
      this.rateLimiter.initBucket(tunnel.id, {
        maxBandwidth: tunnel.max_bandwidth,
        burstFactor: 1.5,
        enableShaping: true
      }, 'download');
    }
    
    const channel: SSH2Channel = accept();
    
    // For direct-tcpip connections, we forward to the address specified in the connection info
    const socket = createConnection({
      host: info.destAddr,
      port: info.destPort,
      timeout: 10000 // 10 second connect timeout
    }) as Socket;
    
    // Track this connection for statistics
    const connectionId = `${sshConnection.remoteAddress}:${Date.now()}`;
    if (!this.connections.has(tunnel.id)) {
      this.connections.set(tunnel.id, new Set());
    }
    this.connections.get(tunnel.id)!.add(connectionId);
    
    // Update active connections count
    this.updateTunnelConnectionCount(tunnel.id);
    
    // Track data transfer for statistics
    let totalBytesReceived = 0;
    let totalBytesSent = 0;

    socket.on('connect', () => {
      console.log(`Connected to target ${info.destAddr}:${info.destPort}`);
    });
    
    socket.setTimeout(30000); // 30 second timeout

    socket.on('data', async (data: Buffer) => {
      totalBytesReceived += data.length;
      
      // Update session stats in real-time for rate calculation
      this.database.updateSessionStats(tunnel.id, data.length, 0);
      
      // Check bandwidth limit (download direction: socket -> channel)
      if (tunnel.max_bandwidth) {
        await this.rateLimiter.writeWithRateLimit(tunnel.id, data, 'download');
      }
      
      // Write data to channel (after bandwidth control if needed)
      channel.write(data);
    });

    channel.on('data', async (data: Buffer) => {
      totalBytesSent += data.length;
      
      // Update session stats in real-time for rate calculation
      this.database.updateSessionStats(tunnel.id, 0, data.length);
      
      // Check bandwidth limit (upload direction: channel -> socket)
      if (tunnel.max_bandwidth) {
        await this.rateLimiter.writeWithRateLimit(tunnel.id, data, 'upload');
      }
      
      // Write data to socket (after bandwidth control if needed)
      socket.write(data);
    });

    socket.on('timeout', () => {
      console.log(`Socket timeout for ${info.destAddr}:${info.destPort}`);
      socket.destroy();
    });

    socket.on('error', (err: Error) => {
      console.error(`Target connection error: ${err.message}`);
      this.cleanupConnection(connectionId, tunnel.id, totalBytesReceived, totalBytesSent);
      
      // Close the channel but do NOT affect the SSH connection itself
      try {
        channel.close();
      } catch {
        // Channel might already be closed, ignore error
      }
    });

    channel.on('close', () => {
      try {
        socket.end();
      } catch {
        // Socket might already be closed, ignore error
      }
    });
    
    channel.on('error', (err: Error) => {
      console.error(`Channel error in direct-tcpip: ${err.message}`);
      this.cleanupConnection(connectionId, tunnel.id, totalBytesReceived, totalBytesSent);
      
      // Close the socket but do NOT affect the SSH connection itself
      try {
        socket.end();
      } catch {
        // Socket might already be closed, ignore error
      }
    });

    socket.on('close', () => {
      try {
        channel.close();
      } catch {
        // Channel might already be closed, ignore error
      }
      
      // Update statistics and remove connection tracking
      this.updateTunnelStats(tunnel.id, totalBytesReceived, totalBytesSent);
      this.connections.get(tunnel.id)?.delete(connectionId);
      this.updateTunnelConnectionCount(tunnel.id);
    });

    socket.on('end', () => {
      try {
        channel.close();
      } catch {
        // Channel might already be closed, ignore error
      }
    });

    channel.on('end', () => {
      try {
        socket.end();
      } catch {
        // Socket might already be closed, ignore error
      }
    });
  }

  /**
   * Get server info for a specific port and user
   */
  getServerInfo(username: string, bindPort: number): TcpServerInfo | undefined {
    const key = `${username}_${bindPort}`;
    return this.servers.get(key);
  }

  /**
   * Get all servers for a specific user
   */
  getUserServers(username: string): TcpServerInfo[] {
    const result: TcpServerInfo[] = [];
    this.servers.forEach(server => {
      if (server.username === username) {
        result.push(server);
      }
    });
    return result;
  }

  /**
   * Check if a port is in use by any server
   */
  isPortInUse(bindPort: number): boolean {
    let inUse = false;
    this.servers.forEach(server => {
      if (server.bindPort === bindPort) {
        inUse = true;
      }
    });
    return inUse;
  }

  /**
   * Close a TCP server
   */
  async closeTcpServer(username: string, bindPort: number): Promise<void> {
    const key = `${username}_${bindPort}`;
    const serverInfo = this.servers.get(key);
    
    if (!serverInfo) {
      console.log(`No TCP server found for ${username}:${bindPort}, might already be closed`);
      return;
    }

    // Remove bandwidth limiters for this tunnel
    this.rateLimiter.removeBucket(serverInfo.tunnelId);

    // Remove all event listeners to prevent new connections
    serverInfo.server.removeAllListeners('connection');
    serverInfo.server.removeAllListeners('error');
    
    // Force close all existing connections for this server
    const connections = this.connections.get(serverInfo.tunnelId);
    if (connections) {
      connections.forEach(_connectionId => {
        // Connection cleanup will be handled by individual socket close handlers
      });
    }
    
    // Close the server
    if (serverInfo.server.listening) {
      return new Promise<void>((resolve, reject) => {
        serverInfo.server.close((err?: Error) => {
          if (err) {
            console.error(`Error closing TCP server ${key}:`, err);
            reject(err);
          } else {
            console.log(`TCP server for ${key} closed successfully`);
            // Remove from servers map after successful close
            this.servers.delete(key);
            resolve();
          }
        });
      });
    } else {
      // Server wasn't listening, just remove from map
      this.servers.delete(key);
    }
  }

  /**
   * Close all TCP servers for a user
   */
  async closeAllUserServers(username: string): Promise<void> {
    const userServers = this.getUserServers(username);
    const closePromises = userServers.map(server => 
      this.closeTcpServer(server.username, server.bindPort)
    );
    
    await Promise.all(closePromises);
  }

  /**
   * Close all TCP servers
   */
  async closeAllServers(): Promise<void> {
    // Clean up all bandwidth limiters
    this.rateLimiter.destroy();
    
    const closePromises: Promise<void>[] = [];
    this.servers.forEach((serverInfo, key) => {
      const [username, portStr] = key.split('_');
      closePromises.push(this.closeTcpServer(username, parseInt(portStr, 10)));
    });
    
    await Promise.all(closePromises);
    this.servers.clear();
  }

  /**
   * Clean up a connection and update statistics
   */
  private cleanupConnection(connectionId: string, tunnelId: number, bytesReceived: number, bytesSent: number): void {
    try {
      // Update statistics and remove connection tracking
      this.updateTunnelStats(tunnelId, bytesReceived, bytesSent);
      
      const connections = this.connections.get(tunnelId);
      if (connections) {
        connections.delete(connectionId);
        
        // Clean up empty connection sets to prevent memory leaks
        if (connections.size === 0) {
          this.connections.delete(tunnelId);
        }
      }
      
      this.updateTunnelConnectionCount(tunnelId);
    } catch (error) {
      console.error(`Error in cleanupConnection for ${connectionId}:`, error);
    }
  }

  /**
   * Update tunnel statistics
   */
  private updateTunnelStats(tunnelId: number, bytesReceived: number, bytesSent: number): void {
    this.database.updateTunnelStats(tunnelId, bytesReceived, bytesSent, 0);
  }

  /**
   * Update tunnel connection count
   */
  private updateTunnelConnectionCount(tunnelId: number): void {
    const connections = this.connections.get(tunnelId);
    const count = connections ? connections.size : 0;
    this.database.updateTunnelConnections(tunnelId, count);
  }

  /**
   * Get connection count for a tunnel
   */
  getConnectionCount(tunnelId: number): number {
    const connections = this.connections.get(tunnelId);
    return connections ? connections.size : 0;
  }

  /**
   * Get active servers for monitoring
   */
  getActiveServers(): TcpServerInfo[] {
    const result: TcpServerInfo[] = [];
    this.servers.forEach(server => {
      result.push(server);
    });
    return result;
  }

  /**
   * Get bandwidth statistics for a tunnel
   */
  getBandwidthStats(tunnelId: number): {
    upload: { tokens: number; capacity: number; refillRate: number; utilization: number } | null;
    download: { tokens: number; capacity: number; refillRate: number; utilization: number } | null;
  } {
    return {
      upload: this.rateLimiter.getBucketStats(tunnelId, 'upload'),
      download: this.rateLimiter.getBucketStats(tunnelId, 'download')
    };
  }

  /**
   * Update bandwidth configuration for a tunnel
   */
  async updateBandwidthConfig(tunnelId: number): Promise<void> {
    const tunnel = await this.database.getTunnelById(tunnelId);
    
    if (tunnel?.max_bandwidth) {
      // Update existing bandwidth limiter
      this.rateLimiter.initBucket(tunnelId, {
        maxBandwidth: tunnel.max_bandwidth,
        burstFactor: 1.5,
        enableShaping: true
      }, 'upload');
      
      this.rateLimiter.initBucket(tunnelId, {
        maxBandwidth: tunnel.max_bandwidth,
        burstFactor: 1.5,
        enableShaping: true
      }, 'download');
    } else {
      // Remove bandwidth limiters
      this.rateLimiter.removeBucket(tunnelId);
    }
  }
}