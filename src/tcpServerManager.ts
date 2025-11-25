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
  updateSessionStats(tunnelId: number, bytesReceived: number, bytesSent: number, activeConnections?: number): void;
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
  isActive: boolean; // Track if connection is still active
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
  private connectionCounters: Map<number, number> = new Map(); // Track active connections per tunnel
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
    const currentCount = this.connectionCounters.get(tunnelId) || 0;
    if (currentCount >= this.maxConnections) {
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
    
    // Use atomic operation to increment connection counter
    this.atomicIncrementConnection(tunnelId);
    
    // Update active connections count
    await this.updateTunnelConnectionCount(tunnelId);
    
    // Track data transfer for statistics
    let bytesReceived = 0;
    let bytesSent = 0;
    let connectionClosed = false; // Prevent multiple close operations
    
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
          await this.cleanupConnection(connectionId, tunnelId, bytesReceived, bytesSent);
          socket.end();
          return;
        }
      
        // Create serial data queues to maintain packet order for this connection
        const uploadQueue: Buffer[] = [];
        const downloadQueue: Buffer[] = [];
        let uploadProcessing = false;
        let downloadProcessing = false;
        
        // Track if channel is still writable to prevent backpressure issues
        let isChannelWritable = true;
        let isSocketWritable = true;
        
        // Serial upload processor (socket → channel)
        const processUploadQueue = async () => {
          if (uploadProcessing || uploadQueue.length === 0) return;
          uploadProcessing = true;
          
          while (uploadQueue.length > 0) {
            const data = uploadQueue.shift()!;
            bytesReceived += data.length;
            
            // Update session stats in real-time for rate calculation
            const currentConnections = this.connectionCounters.get(tunnelId) || 0;
            this.database.updateSessionStats(tunnelId, data.length, 0, currentConnections);
            
            // Apply bandwidth limit BEFORE sending data
            if (tunnel?.max_bandwidth) {
              await this.rateLimiter.writeWithRateLimit(tunnelId, data, 'upload');
            }
            
            // Only write if channel is still writable and track write status
            if (isChannelWritable) {
              channel.write(data);
            }
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
            
            // Only write if socket is still writable
            if (isSocketWritable) {
              isSocketWritable = socket.write(data);
            }
          }
          
          downloadProcessing = false;
        };
      
        // Track write status to prevent writing to closed connections
        socket.on('drain', () => {
          isSocketWritable = true;
        });
        
        channel.on('drain', () => {
          isChannelWritable = true;
        });
        
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
      
      socket.on('close', async () => {
        if (connectionClosed) return; // Prevent multiple close operations
        connectionClosed = true;
        
        try {
          // Send EOF signal to notify the SSH client that this specific connection is closed
          // This prevents the internal server from continuing to send data for this connection
          channel.eof();
          // Then close the channel
          channel.close();
        } catch {
          // Channel might already be closed, ignore error
        }
        
        await this.cleanupConnection(connectionId, tunnelId, bytesReceived, bytesSent);
      });
      
      socket.on('timeout', async () => {
        if (connectionClosed) return; // Prevent multiple close operations
        connectionClosed = true;
        
        console.log(`Socket timeout for ${bindAddr}:${bindPort}`);
        try {
          // Send EOF signal before closing
          channel.eof();
          channel.close();
        } catch {
          // Channel might already be closed, ignore error
        }
        
        // CRITICAL: Use cleanupConnection to ensure counters are updated
        await this.cleanupConnection(connectionId, tunnelId, bytesReceived, bytesSent);
        socket.destroy();
      });
      
      socket.on('error', async (err?: Error) => {
        if (connectionClosed) return; // Prevent multiple close operations
        connectionClosed = true;
        
        console.error(`Socket error: ${err?.message || 'unknown'}`);
        await this.cleanupConnection(connectionId, tunnelId, bytesReceived, bytesSent);
        
        // Close the channel but do NOT affect the SSH connection itself
        try {
          // Send EOF signal to notify the SSH client that this specific connection is closed
          channel.eof();
          channel.close();
        } catch {
          // Channel might already be closed, ignore error
        }
      });
      
      channel.on('close', async () => {
        if (connectionClosed) return; // Prevent multiple close operations
        connectionClosed = true;
        
        try {
          // Ensure socket is closed to prevent sending data to disconnected client
          socket.destroy(); // Use destroy instead of end for immediate closure
        } catch {
          // Socket might already be closed, ignore error
        }
        
        // CRITICAL: Use cleanupConnection to ensure counters are updated
        await this.cleanupConnection(connectionId, tunnelId, bytesReceived, bytesSent);
      });
      
      channel.on('error', async (err: Error) => {
        if (connectionClosed) return; // Prevent multiple close operations
        connectionClosed = true;
        
        console.error(`Channel error: ${err.message}`);
        await this.cleanupConnection(connectionId, tunnelId, bytesReceived, bytesSent);
        
        // Close the socket but do NOT affect the SSH connection itself
        try {
          // Ensure socket is closed to prevent sending data to disconnected client
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
    
    // Use atomic operation to increment connection counter
    this.atomicIncrementConnection(tunnel.id);
    
    // Update active connections count
    await this.updateTunnelConnectionCount(tunnel.id);
    
    // Track data transfer for statistics
    let totalBytesReceived = 0;
    let totalBytesSent = 0;
    let connectionClosed = false; // Prevent multiple close operations

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
      if (connectionClosed) return; // Prevent multiple close operations
      connectionClosed = true;
      
      try {
        socket.end();
      } catch {
        // Socket might already be closed, ignore error
      }
      
      // CRITICAL: Use cleanupConnection to ensure counters are updated
      this.cleanupConnection(connectionId, tunnel.id, totalBytesReceived, totalBytesSent);
    });
    
    channel.on('error', (err: Error) => {
      if (connectionClosed) return; // Prevent multiple close operations
      connectionClosed = true;
      
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
      if (connectionClosed) return; // Prevent multiple close operations
      connectionClosed = true;
      
      try {
        // Send EOF signal to notify the SSH client that this specific connection is closed
        // This prevents the internal server from continuing to send data for this connection
        channel.eof();
        channel.close();
      } catch {
        // Channel might already be closed, ignore error
      }
      
      // Use standard cleanup method to ensure consistency
      this.cleanupConnection(connectionId, tunnel.id, totalBytesReceived, totalBytesSent);
    });

    socket.on('end', () => {
      if (connectionClosed) return; // Prevent multiple close operations
      connectionClosed = true;
      
      try {
        // Send EOF signal to notify the SSH client that this specific connection is closed
        channel.eof();
        channel.close();
      } catch {
        // Channel might already be closed, ignore error
      }
      
      // CRITICAL: Use cleanupConnection to ensure counters are updated
      this.cleanupConnection(connectionId, tunnel.id, totalBytesReceived, totalBytesSent);
    });

    channel.on('end', () => {
      if (connectionClosed) return; // Prevent multiple close operations
      connectionClosed = true;
      
      try {
        // Ensure socket is closed to prevent sending data to disconnected client
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
      console.log(`Closing ${connections.size} active connections for tunnel ${serverInfo.tunnelId}`);
      connections.forEach(connectionId => {
        // Note: Individual connection cleanup is handled by socket close handlers
        // but we force close here to ensure clean shutdown
        // Note: We don't have direct access to the socket here, so we rely
        // on the socket close handlers to clean up properly
      });
      
      // Clear all connections for this tunnel to force immediate cleanup
      connections.clear();
      this.connections.delete(serverInfo.tunnelId);
      
      // Reset connection counter to 0
      this.connectionCounters.set(serverInfo.tunnelId, 0);
      
      // Update database to reflect 0 connections
      this.updateTunnelConnectionCount(serverInfo.tunnelId);
    }
    
    // Reset connection counter for this tunnel
    this.connectionCounters.delete(serverInfo.tunnelId);
    
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
    
    // Clear all connection counters
    this.connectionCounters.clear();
    
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
  private async cleanupConnection(connectionId: string, tunnelId: number, bytesReceived: number, bytesSent: number): Promise<void> {
    try {
      // Update statistics first
      this.updateTunnelStats(tunnelId, bytesReceived, bytesSent);
      
      // Remove connection from tracking set
      const connections = this.connections.get(tunnelId);
      if (connections) {
        connections.delete(connectionId);
      }
      
      // Use atomic operation to decrement connection counter
      this.atomicDecrementConnection(tunnelId);
      
      // Update database
      await this.updateTunnelConnectionCount(tunnelId);
    } catch (error) {
      console.error(`Error in cleanupConnection for ${connectionId}:`, error);
      // Ensure connection count is still updated even if stats update fails
      try {
        this.atomicDecrementConnection(tunnelId);
      } catch (decrementError) {
        console.error(`Critical: Failed to decrement connection count:`, decrementError);
      }
    }
  }

  /**
   * Update tunnel statistics
   */
  private updateTunnelStats(tunnelId: number, bytesReceived: number, bytesSent: number): void {
    const currentConnections = this.connectionCounters.get(tunnelId) || 0;
    this.database.updateTunnelStats(tunnelId, bytesReceived, bytesSent, currentConnections);
  }

  /**
   * Atomic operations for connection management
   */
  private atomicIncrementConnection(tunnelId: number): number {
    const current = this.connectionCounters.get(tunnelId) || 0;
    const newCount = current + 1;
    this.connectionCounters.set(tunnelId, newCount);
    
    // Log connection count changes for debugging
    console.log(`[Tunnel ${tunnelId}] Connection count: ${current} -> ${newCount} (+1)`);
    
    // Ensure connections set exists
    if (!this.connections.has(tunnelId)) {
      this.connections.set(tunnelId, new Set());
    }
    
    return newCount;
  }
  
  private atomicDecrementConnection(tunnelId: number): number {
    const current = this.connectionCounters.get(tunnelId) || 0;
    const newCount = Math.max(0, current - 1);
    this.connectionCounters.set(tunnelId, newCount);
    
    // Log connection count changes for debugging
    console.log(`[Tunnel ${tunnelId}] Connection count: ${current} -> ${newCount} (-1)`);
    
    // Clean up empty connection sets
    const connections = this.connections.get(tunnelId);
    if (connections && connections.size === 0) {
      this.connections.delete(tunnelId);
    }
    
    return newCount;
  }

  /**
   * Update tunnel connection count
   */
  private async updateTunnelConnectionCount(tunnelId: number): Promise<void> {
    // Use the connection counter instead of the connections set size
    // This ensures consistency with the getConnectionCount method
    const count = this.connectionCounters.get(tunnelId) || 0;
    await this.database.updateTunnelConnections(tunnelId, count);
  }

  /**
   * Get connection count for a tunnel
   */
  getConnectionCount(tunnelId: number): number {
    // Use the connection counter for efficiency and accuracy
    return this.connectionCounters.get(tunnelId) || 0;
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

  /**
   * Get connection statistics for monitoring
   */
  getConnectionStats(): {
    totalConnections: number;
    tunnelConnections: Map<number, number>;
    connectionDetails: Map<number, Set<string>>;
  } {
    const totalConnections = Array.from(this.connectionCounters.values()).reduce((sum, count) => sum + count, 0);
    
    return {
      totalConnections,
      tunnelConnections: new Map(this.connectionCounters),
      connectionDetails: new Map(this.connections)
    };
  }
}