/* eslint-disable @typescript-eslint/no-explicit-any */
import ssh2 from 'ssh2';
import { Socket, createConnection } from 'net';
import * as net from 'net';
import { Database, Tunnel } from './database';
import { getCurrentTime, formatDuration } from './utils/timeUtils';
import './types/ssh2.d';

export interface SSHServerConfig {
  host?: string;
  port: number;
  hostKey: string;
}

export class SSHBridgeServer {
  private sshServer: any;
  private database: Database;
  private config: SSHServerConfig;
  private tunnels: Map<string, { connection: any; tunnel: Tunnel }> = new Map();
  private remoteForwards: Map<string, any> = new Map();
  private ptyInfo: any = null;
  private currentChannel: any = null;
  private tunnelConnections: Map<number, Set<string>> = new Map(); // Track active connections per tunnel
  private activeTunnels: Map<number, any> = new Map(); // Track active SSH tunnels by tunnel ID

  constructor(config: SSHServerConfig, database: Database) {
    this.config = config;
    this.database = database;
    this.sshServer = new ssh2.Server({
      hostKeys: [config.hostKey],
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.sshServer.on('connection', (conn: any) => {
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

  private sendErrorMessageToClient(conn: any, errorMsg: string, detailMsg: string): void {
    // Store the error message for display when PTY is requested
    conn._sshbForwardError = {
      message: errorMsg,
      details: detailMsg
    };
  }

  private handleAuthenticatedConnection(conn: any, user: any) {
    console.log(`User ${user.username} authenticated`);
    
    // Reset current session stats when SSH session starts
    this.database.getTunnelsByUserId(user.id).then((tunnels: Tunnel[]) => {
      tunnels.forEach((tunnel: Tunnel) => {
        this.database.resetCurrentSessionStats(tunnel.id);
      });
    }).catch((err: Error) => {
      console.error('Error resetting stats on SSH session start:', err);
    });
    
    // Handle remote port forwarding requests
    conn.on('request', async (accept: any, reject: any, name: string, data: any) => {
      if (name === 'tcpip-forward') {
        try {
          console.log(`Remote port forward request from ${user.username}: ${JSON.stringify(data)}`);
          const { bindAddr, bindPort } = data;
          
          // Check if this remote forward matches any of the user's tunnel configurations
          const userTunnels = await this.database.getTunnelsByUserId(user.id);
          const matchingTunnel = userTunnels.find(tunnel => 
            tunnel.external_port === bindPort
          );
          
          if (!matchingTunnel) {
            const errorMsg = `远程端口转发 ${bindAddr}:${bindPort} 未被授权`;
            console.error(`${errorMsg} - User: ${user.username}`);
            
            // Get user's configured tunnels for error message
            const availablePorts = userTunnels.map((t: Tunnel) => t.external_port).join(', ');
            const detailMsg = `该端口不匹配您配置的任何隧道。您已配置的端口: ${availablePorts || '无'}`;
            
            // Store error info to display when a PTY request is made
            conn._sshbForwardError = {
              message: errorMsg,
              details: detailMsg
            };
            
            // Reject the port forwarding request
            reject();
            
            // Disconnect the SSH connection after a short delay
            setTimeout(() => {
              conn.end();
            }, 500);
            return;
          }

          // Check if this tunnel is already online (being used by this same user)
          const isTunnelOnline = await this.database.isTunnelWithPortOnline(bindPort);
          // Also check our internal state to be sure
          const isPortInUse = this.activeTunnels.has(matchingTunnel.id);
          
          if (isTunnelOnline || isPortInUse) {
            const errorMsg = `远程端口 ${bindAddr}:${bindPort} 启用失败`;
            console.log(`Tunnel port ${bindPort} is already online for user ${user.username}, rejecting new connection...`);
            
            // Store error message to display when a PTY request is made
            conn._sshbForwardError = {
              message: errorMsg,
              details: `隧道端口 ${bindPort} 已在线。此隧道端口已在此连接或另一个连接中在线。请勿重复连接同一端口。`
            };
            
            // Reject the port forwarding request
            reject();
            
            // Disconnect the SSH connection after a short delay
            setTimeout(() => {
              conn.end();
            }, 500);
            return;
          }
          
          console.log(`Remote forward ${bindAddr}:${bindPort} validated for user ${user.username} - matches tunnel: ${matchingTunnel.name}`);
          
          // Create a TCP server to listen on the requested port
          const server = net.createServer((socket: any) => {
            console.log(`New connection to ${bindAddr}:${bindPort} from ${socket.remoteAddress}:${socket.remotePort}`);
            
            // Track this connection for statistics
            const connectionId = `${socket.remoteAddress}:${socket.remotePort}-${Date.now()}`;
            if (!this.tunnelConnections.has(matchingTunnel.id)) {
              this.tunnelConnections.set(matchingTunnel.id, new Set());
            }
            this.tunnelConnections.get(matchingTunnel.id)!.add(connectionId);
            
            // Update active connections count
            this.updateTunnelConnectionCount(matchingTunnel.id);
            
            // Don't reset current session stats for individual TCP connections
            // Only reset when the entire SSH session starts
            
            // Track data transfer for statistics
            let bytesReceived = 0;
            let bytesSent = 0;
            
            // Open a channel back to the SSH client for forwarded-tcpip
            conn.forwardOut(bindAddr, bindPort, socket.remoteAddress, socket.remotePort, (err: any, channel: any) => {
              if (err) {
                console.error(`Error opening channel: ${err.message}`);
                // Clean up connection tracking when channel creation fails
                this.tunnelConnections.get(matchingTunnel.id)?.delete(connectionId);
                this.updateTunnelConnectionCount(matchingTunnel.id);
                socket.end();
                return;
              }
              
              // Set socket timeout
              socket.setTimeout(30000); // 30 second timeout
              
              // Forward data between socket and channel with backpressure handling
              socket.on('data', (data: Buffer) => {
                bytesReceived += data.length;
                // Handle backpressure - pause socket if channel buffer is full
                if (!channel.write(data)) {
                  socket.pause();
                  channel.once('drain', () => socket.resume());
                }
              });
              
              channel.on('data', (data: Buffer) => {
                bytesSent += data.length;
                // Handle backpressure - pause channel if socket buffer is full
                if (!socket.write(data)) {
                  channel.pause();
                  socket.once('drain', () => channel.resume());
                }
              });
              
              socket.on('close', () => {
                try {
                  channel.close();
                } catch {
                  // Channel might already be closed, ignore error
                }
                
                // Update statistics and remove connection tracking
                this.updateTunnelStats(matchingTunnel.id, bytesReceived, bytesSent);
                this.tunnelConnections.get(matchingTunnel.id)?.delete(connectionId);
                this.updateTunnelConnectionCount(matchingTunnel.id);
              });
              
              socket.on('timeout', () => {
                console.log(`Socket timeout for ${bindAddr}:${bindPort}`);
                socket.destroy();
              });
              
              socket.on('error', (err: Error) => {
                console.error(`Socket error: ${err.message}`);
                // Clean up connection tracking when socket error occurs
                this.tunnelConnections.get(matchingTunnel.id)?.delete(connectionId);
                this.updateTunnelConnectionCount(matchingTunnel.id);
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
                // Clean up connection tracking when channel error occurs
                this.tunnelConnections.get(matchingTunnel.id)?.delete(connectionId);
                this.updateTunnelConnectionCount(matchingTunnel.id);
                // Close the socket but do NOT affect the SSH connection itself
                try {
                  socket.destroy(); // Use destroy instead of end for immediate closure
                } catch {
                  // Socket might already be closed, ignore error
                }
              });
            });
          });
          
          server.listen(bindPort, bindAddr, () => {
            console.log(`Remote forward listening on ${bindAddr}:${bindPort}`);
            
            // Mark the tunnel as online
            this.database.updateTunnelOnlineStatus(matchingTunnel.id, true);
            
            // Store the request information
            const key = `${user.username}_${bindPort}`;
            this.remoteForwards.set(key, { server, bindAddr, bindPort, connection: conn, user });
            this.activeTunnels.set(matchingTunnel.id, { tunnel: matchingTunnel, connection: conn, port: bindPort });
            
            // Accept the port forward request
            accept();
            console.log(`Remote port forwarding accepted: ${bindAddr}:${bindPort}`);
          });
          
          server.on('error', (err: Error) => {
            console.error(`Server error: ${err.message}`);
            // When server fails to listen, reject the port forward request
            const errorMsg = `远程端口 ${bindAddr}:${bindPort} 启用失败`;
            
            // Store error message to display when a PTY request is made
            conn._sshbForwardError = {
              message: errorMsg,
              details: `隧道端口 ${bindPort} 已在线。此隧道端口已在此连接或另一个连接中在线。请勿重复连接同一端口。`
            };
            
            reject();
            
            // Disconnect the SSH connection after a short delay
            setTimeout(() => {
              conn.end();
            }, 500);
            
            // Clean up any active connections that might have been created before the error
            if (this.tunnelConnections.has(matchingTunnel.id)) {
              this.tunnelConnections.delete(matchingTunnel.id);
              this.updateTunnelConnectionCount(matchingTunnel.id);
            }
            
            console.log(`Port forwarding request rejected for ${bindAddr}:${bindPort}, SSH connection closed`);
          });
        } catch (error) {
          console.error('Error setting up remote port forward:', error);
          reject();
        }
      } else if (name === 'cancel-tcpip-forward') {
        try {
          const { bindAddr, bindPort } = data;
          const key = `${user.username}_${bindPort}`;
          
          if (this.remoteForwards.has(key)) {
            const { server, port } = this.remoteForwards.get(key);
            
            // Find the tunnel associated with this port to mark it offline
            const userTunnels = await this.database.getTunnelsByUserId(user.id);
            const matchingTunnel = userTunnels.find((tunnel: Tunnel) => tunnel.external_port === port);
            if (matchingTunnel) {
              this.database.updateTunnelOnlineStatus(matchingTunnel.id, false);
              this.activeTunnels.delete(matchingTunnel.id);
            }
            
            server.close();
            this.remoteForwards.delete(key);
            console.log(`Remote port forwarding cancelled: ${bindAddr}:${bindPort}`);
            accept();
          } else {
            reject();
          }
        } catch (error) {
          console.error('Error cancelling remote port forward:', error);
          reject();
        }
      } else {
        reject();
      }
    });



    conn.on('session', (accept: any) => {
      const session = accept();

      // Handle PTY requests
      session.on('pty', (accept: any, reject: any, info: any) => {
        console.log(`PTY request: ${info.term} ${info.rows}x${info.cols}`);
        
        // Check if there was a forward error
        if (conn._sshbForwardError) {
          // Accept PTY but prepare to show error
          accept();
          
          // Set a flag to indicate we need to show error on shell
          session._showForwardError = true;
          this.ptyInfo = info; // Store PTY info for later use
          return;
        }
        
        // Check if tunnel was replaced
        if (conn._sshbTunnelReplaced) {
          // Accept PTY but prepare to show message
          accept();
          
          // Set a flag to indicate we need to show message on shell
          session._showTunnelReplaced = true;
          this.ptyInfo = info; // Store PTY info for later use
          return;
        }
        
        this.ptyInfo = info; // Store PTY info for later use
        accept();
      });

      // Handle shell requests
      session.on('shell', (accept: any, _reject: any) => {
        console.log(`Shell request from user ${user.username}`);
        const channel = accept();
        
        // Store reference to channel and connection
        this.currentChannel = channel;
        channel._conn = conn; // Store connection reference for later use
        
        // Check if there was a forward error (from either connection or session)
        const forwardError = conn._sshbForwardError || (session._showForwardError ? conn._sshbForwardError : null);
        if (forwardError) {
          channel.write(`ERROR: ${forwardError.message}\r\n`);
          channel.write(`${forwardError.details}\r\n`);
          channel.write(`连接将被断开。\r\n`);
          
          // Clear the error after displaying
          delete conn._sshbForwardError;
          delete session._showForwardError;
          
          // Disconnect after a short delay
          setTimeout(() => {
            channel.end();
            conn.end();
          }, 500); // Increased delay to ensure user can see the message
          return;
        }
        
        // Check if tunnel was replaced
        const tunnelReplaced = conn._sshbTunnelReplaced || (session._showTunnelReplaced ? conn._sshbTunnelReplaced : null);
        if (tunnelReplaced) {
          channel.write(`WARNING: ${tunnelReplaced.message}\r\n`);
          channel.write(`${tunnelReplaced.details}\r\n`);
          channel.write(`连接将在3秒后关闭...\r\n`);
          
          // Clear the message after displaying
          delete conn._sshbTunnelReplaced;
          delete session._showTunnelReplaced;
          
          // Disconnect after a delay
          setTimeout(() => {
            channel.write(`Goodbye!\r\n`);
            channel.end();
            conn.end();
          }, 3000);
          return;
        }
        
        // Set up a basic shell environment
        channel.write(`Welcome to SSHBridge Server!\r\n`);
        channel.write(`You are authenticated as ${user.username}\r\n`);
        channel.write(`Available commands:\r\n`);
        channel.write(`  help     - Show this help message\r\n`);
        channel.write(`  tunnels  - List your active tunnels\r\n`);
        channel.write(`  status   - Show real-time tunnel status (Press Ctrl+C to exit)\r\n`);
        channel.write(`  exit     - Disconnect from server\r\n`);
        channel.write(`\r\nSSHBridge> `);
        
        let inputBuffer = '';
        
        channel.on('data', async (data: Buffer) => {
          const str = data.toString();
          
          for (const char of str) {
            const charCode = char.charCodeAt(0);
            
            // Handle Enter key (CR/LF)
            if (charCode === 13 || charCode === 10) {
              channel.write('\r\n');
              const command = inputBuffer.trim();
              
              if (command === 'exit') {
                channel.write('Goodbye!\r\n');
                channel.end();
                conn.end();
                return;
              } else if (command === 'help') {
                channel.write(`Available commands:\r\n`);
                channel.write(`  help     - Show this help message\r\n`);
                channel.write(`  tunnels  - List your active tunnels\r\n`);
                channel.write(`  status   - Show real-time tunnel status (Press Ctrl+C to exit)\r\n`);
                channel.write(`  exit     - Disconnect from server\r\n`);
              } else if (command === 'tunnels') {
                // Get all configured tunnels for user
                const allTunnels = await this.database.getTunnelsByUserId(user.id);
                
                // Get active remote port forwards (ssh -R)
                const activeRemoteForwards = Array.from(this.remoteForwards.entries())
                  .filter(([, value]) => value.connection === conn)
                  .map(([, value]) => ({ bindAddr: value.bindAddr, bindPort: value.bindPort }));
                
                // Get active remote forward ports
                const activeRemotePorts = new Set(
                  activeRemoteForwards.map(rf => rf.bindPort.toString())
                );
                  
                  // Display tunnels with status
                  channel.write('Tunnels (external ports assigned to you):\r\n');
                  if (allTunnels.length === 0) {
                    channel.write('  No configured tunnels\r\n');
                  } else {
                    allTunnels.forEach((tunnel: Tunnel) => {
                      // A tunnel is active if SSH client has set up remote port forwarding (ssh -R)
                      const isActive = activeRemotePorts.has(tunnel.external_port.toString());
                      const status = isActive ? '[ACTIVE]' : '[INACTIVE]';
                      
                      channel.write(`  ${status} ${tunnel.name}: external:${tunnel.external_port}\r\n`);
                    });
                  }
                
                // Display remote port forwards that don't overlap with configured external tunnels
                const nonOverlappingForwards = activeRemoteForwards.filter((rf: any) => 
                  !allTunnels.some((tunnel: Tunnel) => tunnel.external_port === rf.bindPort)
                );
                
                if (nonOverlappingForwards.length > 0) {
                  channel.write('\r\nRemote port forwards (client -> server):\r\n');
                  nonOverlappingForwards.forEach((rf: any) => {
                    channel.write(`  [ACTIVE] client:${rf.bindPort} -> server:${rf.bindAddr}\r\n`);
                  });
                }
              } else if (command === 'status') {
                // Enter status mode
                this.showTunnelStatus(channel, conn, user);
                return; // Return early to avoid showing prompt
              } else if (command) {
                channel.write(`Unknown command: ${command}\r\n`);
                channel.write(`Type 'help' for available commands.\r\n`);
              }
              
              inputBuffer = '';
              channel.write(`\r\nSSHBridge> `);
            } 
            // Handle Backspace/Delete
            else if (charCode === 8 || charCode === 127) {
              if (inputBuffer.length > 0) {
                inputBuffer = inputBuffer.slice(0, -1);
                channel.write('\b \b');
              }
            }
            // Handle Ctrl+C (ETX)
            else if (charCode === 3) {
              channel.write('^C\r\n');
              inputBuffer = '';
              channel.write(`SSHBridge> `);
            }
            // Handle other printable characters
            else if (charCode >= 32 && charCode <= 126) {
              inputBuffer += char;
              channel.write(char);
            }
          }
        });

        channel.on('close', () => {
          console.log(`Shell session closed for user ${user.username}`);
        });

        channel.on('error', (err: Error) => {
          console.error(`Shell session error for user ${user.username}:`, err);
        });
      });

      session.on('channel', (accept: any, _reject: any, info: any) => {
        if (info.type === 'direct-tcpip') {
          this.handleDirectTcpip(conn, accept, () => {}, info, user);
        } else {
          console.log(`Rejected channel type: ${info.type}`);
          _reject();
        }
      });
    });

    conn.on('error', (err: Error) => {
      console.error(`Connection error for user ${user.username}:`, err);
      
      // Reset current session stats, online status, and connections when SSH session ends
      this.database.getTunnelsByUserId(user.id).then((tunnels: Tunnel[]) => {
        tunnels.forEach((tunnel: Tunnel) => {
          this.database.resetCurrentSessionStats(tunnel.id);
          this.database.updateTunnelOnlineStatus(tunnel.id, false);
          this.database.updateTunnelConnections(tunnel.id, 0);
        });
      }).catch((err: Error) => {
        console.error('Error resetting stats on SSH session error:', err);
      });
      
      this.cleanupConnection(conn);
    });

    conn.on('end', () => {
      console.log(`Connection ended for user ${user.username}`);
      
      // Reset current session stats, online status, and connections when SSH session ends
      this.database.getTunnelsByUserId(user.id).then((tunnels: Tunnel[]) => {
        tunnels.forEach((tunnel: Tunnel) => {
          this.database.resetCurrentSessionStats(tunnel.id);
          this.database.updateTunnelOnlineStatus(tunnel.id, false);
          this.database.updateTunnelConnections(tunnel.id, 0);
        });
      }).catch((err: Error) => {
        console.error('Error resetting stats on SSH session end:', err);
      });
      
      this.cleanupConnection(conn);
    });
  }

  private async handleDirectTcpip(
    conn: any,
    accept: any,
    _reject: any,
    info: any,
    user: any
  ) {
    try {
      const tunnels = await this.database.getTunnelsByUserId(user.id);
      
      const tunnel = tunnels.find((t: Tunnel) => 
        t.external_port === info.destPort
      );

      if (!tunnel) {
        console.log(`No tunnel found for ${info.destAddr}:${info.destPort}`);
        return;
      }

      console.log(`Creating tunnel for external port: ${tunnel.name} -> ${tunnel.external_port}`);
      
      const channel = accept();
      
      // For direct-tcpip connections, we forward to the address specified in the connection info
      const socket = createConnection({
        host: info.destAddr,
        port: info.destPort,
        timeout: 10000 // 10 second connect timeout
      }) as Socket;
      
      // Track this connection for statistics
      const connectionId = `${conn.remoteAddress}:${Date.now()}`;
      if (!this.tunnelConnections.has(tunnel.id)) {
        this.tunnelConnections.set(tunnel.id, new Set());
      }
      this.tunnelConnections.get(tunnel.id)!.add(connectionId);
      
      // Update active connections count
      this.updateTunnelConnectionCount(tunnel.id);
      
      // Don't reset current session stats for individual TCP connections
      // Only reset when the entire SSH session starts
      
      // Track data transfer for statistics
      let totalBytesReceived = 0;
      let totalBytesSent = 0;

      socket.on('connect', () => {
        console.log(`Connected to target ${info.destAddr}:${info.destPort}`);
      });
      
      socket.setTimeout(30000); // 30 second timeout

      socket.on('data', (data: Buffer) => {
        totalBytesReceived += data.length;
        // Handle backpressure - pause socket if channel buffer is full
        if (!channel.write(data)) {
          socket.pause();
          channel.once('drain', () => socket.resume());
        }
      });

      channel.on('data', (data: Buffer) => {
        totalBytesSent += data.length;
        // Handle backpressure - pause channel if socket buffer is full
        if (!socket.write(data)) {
          channel.pause();
          socket.once('drain', () => channel.resume());
        }
      });

      socket.on('timeout', () => {
        console.log(`Socket timeout for ${info.destAddr}:${info.destPort}`);
        socket.destroy();
      });

      socket.on('error', (err: Error) => {
        console.error(`Target connection error: ${err.message}`);
        // Clean up connection tracking when socket error occurs
        this.tunnelConnections.get(tunnel.id)?.delete(connectionId);
        this.updateTunnelConnectionCount(tunnel.id);
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
        // Clean up connection tracking when channel error occurs
        this.tunnelConnections.get(tunnel.id)?.delete(connectionId);
        this.updateTunnelConnectionCount(tunnel.id);
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
        this.tunnelConnections.get(tunnel.id)?.delete(connectionId);
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
    } catch (error) {
      console.error('Error handling direct-tcpip:', error);
    }
  }

  private updateTunnelStats(tunnelId: number, bytesReceived: number, bytesSent: number): void {
    this.database.updateTunnelStats(tunnelId, bytesReceived, bytesSent, 0); // 0 for active connections since we're just updating stats
  }

  private updateTunnelConnectionCount(tunnelId: number): void {
    const connections = this.tunnelConnections.get(tunnelId);
    const count = connections ? connections.size : 0;
    this.database.updateTunnelConnections(tunnelId, count);
  }

  // Method to disconnect a tunnel if it's being used by another connection
  disconnectTunnelIfActive(tunnelId: number, currentConn: any): void {
    const activeTunnel = this.activeTunnels.get(tunnelId);
    if (activeTunnel && activeTunnel.connection !== currentConn) {
      console.log(`Disconnecting tunnel ${tunnelId} from previous connection`);
      
      // Set up a flag on the old connection to show a message
      activeTunnel.connection._sshbTunnelReplaced = {
        message: `隧道 ${tunnelId} 已被新连接替换`,
        details: '您的隧道已从另一个位置连接。此连接将被关闭。'
      };
      
      // Close the old connection
      activeTunnel.connection.end();
      
      // Clean up the old tunnel
      const key = `${activeTunnel.user.username}_${activeTunnel.tunnel.port}`;
      this.remoteForwards.delete(key);
      activeTunnel.server.close();
      
      // Remove from active tunnels
      this.activeTunnels.delete(tunnelId);
    }
  }

  // Method to cleanup all connections and servers for a given connection
  private cleanupConnection(conn: any) {
    // Clean up regular tunnels
    for (const [key, value] of this.tunnels.entries()) {
      if (value.connection === conn) {
        console.log(`Cleaning up tunnel: ${value.tunnel.name}`);
        this.tunnels.delete(key);
      }
    }

    // Clean up remote port forwards
    for (const [key, value] of this.remoteForwards.entries()) {
      if (value.connection === conn) {
        console.log(`Cleaning up remote forward on ${value.bindAddr}:${value.bindPort}`);
        value.server.close();
        this.remoteForwards.delete(key);
        
        // Find and remove from active tunnels
        for (const [tunnelId, activeTunnel] of this.activeTunnels.entries()) {
          if (activeTunnel.connection === conn) {
            this.activeTunnels.delete(tunnelId);
            break;
          }
        }
      }
    }

    // Clear connection tracking for all tunnels associated with this connection
    for (const [tunnelId, connections] of this.tunnelConnections.entries()) {
      // We don't know which specific connections belong to this SSH connection,
      // so we'll clear all of them to avoid stale data
      connections.clear();
      this.updateTunnelConnectionCount(tunnelId);
    }
  }

  // Show real-time tunnel status in a table format
  private showTunnelStatus(channel: any, conn: any, user: any): void {
    let statusInterval: any = null;
    let isStatusMode = true;
    
    // Function to clear screen and move cursor to top-left
    const clearScreen = () => {
      // ANSI escape codes to clear screen and move cursor
      channel.write('\x1b[2J\x1b[H');
    };
    
    // Function to format bytes for human-readable display
    const formatBytes = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
    

    
    // Function to render the status table
    const renderStatusTable = async () => {
      if (!isStatusMode) return;
      
      clearScreen();
      channel.write(`\x1b[1mSSHBridge Tunnel Status Monitor\x1b[0m\r\n`);
      channel.write(`User: ${user.username} | Showing current session tunnels only | Press Ctrl+C to exit\r\n`);
      channel.write(`Last updated: ${getCurrentTime()}\r\n`);
      channel.write(`\r\n`);
      
      // Get active remote port forwards for this connection
      const activeRemoteForwards = Array.from(this.remoteForwards.entries())
        .filter(([, value]) => value.connection === conn)
        .map(([, value]) => ({ bindAddr: value.bindAddr, bindPort: value.bindPort }));
      
      // Get active remote forward ports
      const activeRemotePorts = new Set(
        activeRemoteForwards.map(rf => rf.bindPort.toString())
      );
      
      // Get all tunnels for user
      const allTunnels = await this.database.getTunnelsByUserId(user.id);
      const tunnelStats = await this.database.getTunnelStatsByUserId(user.id);
      
      // Create a map of tunnel stats for quick lookup
      const statsMap = new Map<number, any>();
      tunnelStats.forEach(stat => {
        statsMap.set(stat.tunnel_id, stat);
      });
      
      // Filter to only show tunnels that are currently active in this session
      const activeTunnels = allTunnels.filter(tunnel => 
        activeRemotePorts.has(tunnel.external_port.toString())
      );
      
      // Draw table header
      const header = `┌─────────────┬──────────────────────────┬───────────────┬──────────────┬────────────────────────────┐\r\n` +
                   `│ \x1b[1mSTATUS.   \x1b[0m  │ \x1b[1mTUNNEL NAME\x1b[0m              │ \x1b[1mDURATION\x1b[0m      │ \x1b[1mACTIVE CONNS \x1b[0m│ \x1b[1mSESSION TRAFFIC\x1b[0m            │\r\n` +
                   `├─────────────┼──────────────────────────┼───────────────┼──────────────┼────────────────────────────┤\r\n`;
      channel.write(header);
      
      // Display each active tunnel's status
      if (activeTunnels.length === 0) {
        const emptyRow = `│             │ No active tunnels in current session                                     │\r\n`;
        channel.write(emptyRow);
      } else {
        for (const tunnel of activeTunnels) {
          const stats = statsMap.get(tunnel.id);
          const duration = stats ? formatDuration(stats.updated_at) : 'N/A';
          const activeConnections = stats ? stats.active_connections.toString() : '0';
          
          // Calculate current session traffic
          let sessionTraffic = '0 B';
          if (stats) {
            const totalBytes = stats.current_bytes_received + stats.current_bytes_sent;
            sessionTraffic = formatBytes(totalBytes);
          }
          
          // Format table row with proper spacing
          // STATUS (11 chars with ANSI codes): "ACTIVE"
          const statusText = 'ACTIVE';
          const row = `│ \x1b[32m${statusText}\x1b[0m` + 
                     ' '.repeat(11 - statusText.length) + ' │ ' +
                     tunnel.name.padEnd(24) + ' │ ' +
                     duration.padEnd(13) + ' │ ' +
                     activeConnections.padEnd(12) + ' │ ' +
                     sessionTraffic.padEnd(26) + ' │\r\n';
          channel.write(row);
        }
      }
      
      // Draw table footer
      const footer = `└─────────────┴──────────────────────────┴───────────────┴──────────────┴────────────────────────────┘\r\n`;
      channel.write(footer);
      channel.write(`\r\nActive tunnels in current session: ${activeTunnels.length}\r\n`);
    };
    
    // Initial render
    renderStatusTable();
    
    // Set up interval to refresh the table every 2 seconds
    statusInterval = setInterval(() => {
      renderStatusTable();
    }, 2000);
    
    // Override the data handler to catch Ctrl+C
    const originalDataHandler = channel.listeners('data')[0];
    channel.removeAllListeners('data');
    
    channel.on('data', (data: Buffer) => {
      const str = data.toString();
      
      // Check for Ctrl+C (ETX character)
      if (str.includes('\x03')) {
        // Exit status mode
        isStatusMode = false;
        
        // Clear interval
        if (statusInterval) {
          clearInterval(statusInterval);
          statusInterval = null;
        }
        
        // Restore original data handler
        channel.removeAllListeners('data');
        channel.on('data', originalDataHandler);
        
        // Show exit message and prompt
        clearScreen();
        channel.write('Exited status monitor.\r\n');
        channel.write(`\r\nSSHBridge> `);
        return;
      }
      
      // In status mode, ignore all other input
    });
  }

  start(callback?: () => void) {
    this.sshServer.listen({
      port: this.config.port,
      host: this.config.host || '0.0.0.0'
    }, callback);
  }

  stop(callback?: () => void) {
    // Close all active connections and servers
    for (const [key, value] of this.remoteForwards.entries()) {
      value.server.close();
      this.remoteForwards.delete(key);
    }

    this.sshServer.close(callback);
  }
}
