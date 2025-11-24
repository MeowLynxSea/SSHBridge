import { SSH2Connection, SSH2Session, SSH2Channel, SSH2PtyInfo, SSH2Server, SSH2AuthContext, SSH2RequestData, SSH2ForwardData, UserData, RemoteForwardInfo, ActiveTunnelInfo } from './types/ssh2-types';
import { Database, Tunnel } from './database';
import { getCurrentTime, formatDuration } from './utils/timeUtils';
import { TcpServerManager } from './tcpServerManager';
import ssh2 from 'ssh2';

// Timer type for compatibility
interface Timer {
  ref(): Timer;
  unref(): Timer;
}

declare function setInterval(callback: () => void, ms: number): Timer;
declare function clearInterval(intervalId: Timer): void;

import './types/ssh2.d';

export interface SSHServerConfig {
  host?: string;
  port: number;
  hostKey: string;
}

export class SSHBridgeServer {
  private sshServer: SSH2Server;
  private database: Database;
  private config: SSHServerConfig;
  private tunnels: Map<string, { connection: SSH2Connection; tunnel: Tunnel }> = new Map();
  private remoteForwards: Map<string, RemoteForwardInfo> = new Map();
  private ptyInfo: SSH2PtyInfo | null = null;
  private currentChannel: SSH2Channel | null = null;
  private activeTunnels: Map<number, ActiveTunnelInfo> = new Map();
  private tcpServerManager: TcpServerManager;


  constructor(config: SSHServerConfig, database: Database) {
    this.config = config;
    this.database = database;
    // Configure TcpServerManager with reasonable defaults
    this.tcpServerManager = new TcpServerManager(database, 1000, 30000);
    this.sshServer = new ssh2.Server({
      hostKeys: [config.hostKey],
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.sshServer.on('connection', (conn: SSH2Connection) => {
      console.log('New SSH connection');

      conn.on('authentication', async (ctx: SSH2AuthContext) => {
        if (ctx.method === 'password' && ctx.password) {
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

      conn.on('error', (err?: Error) => {
        if (err) {
          console.error('SSH connection error:', err);
        } else {
          console.error('SSH connection error (unknown)');
        }
      });
    });
  }

  private sendErrorMessageToClient(conn: SSH2Connection, errorMsg: string, detailMsg: string): void {
    // Store the error message for display when PTY is requested
    conn._sshbForwardError = {
      message: errorMsg,
      details: detailMsg
    };
  }

  private handleAuthenticatedConnection(conn: SSH2Connection, user: UserData) {
    console.log(`User ${user.username} authenticated`);
    
    // Initialize port forward request tracking
    conn._pendingPortForwards = 0;
    conn._processedPortForwards = 0;
    
    // Reset current session stats when SSH session starts
    this.database.getTunnelsByUserId(user.id).then((tunnels: Tunnel[]) => {
      tunnels.forEach((tunnel: Tunnel) => {
        // Only reset current session, not total traffic
        this.database.updateTunnelStats(tunnel.id, 0, 0, 0);
      });
    }).catch((err: Error) => {
      console.error('Error resetting stats on SSH session start:', err);
    });
    
    // Handle remote port forwarding requests
    conn.on('request', async (accept: () => void, reject: () => void, name: string, data: SSH2RequestData) => {
      if (name === 'tcpip-forward') {
        try {
          const { bindAddr, bindPort } = data;
          
          // Track pending port forward requests
          conn._pendingPortForwards = (conn._pendingPortForwards || 0) + 1;
          
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
            // Mark port forward as processed
            conn._processedPortForwards = (conn._processedPortForwards || 0) + 1;
            
            // Wait for PTY request to show error before disconnecting
            // Don't disconnect immediately - let PTY handler show the error
            return;
          }

          // Check if this tunnel is already online (being used by this same user)
          const isTunnelOnline = await this.database.isTunnelWithPortOnline(bindPort);
          // Also check our internal state to be sure
          const isPortInUse = this.tcpServerManager.isPortInUse(bindPort) || this.activeTunnels.has(matchingTunnel.id);
          
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
            
            // Mark port forward as processed
            conn._processedPortForwards = (conn._processedPortForwards || 0) + 1;
            
            // Wait for PTY request to show error before disconnecting
            // Don't disconnect immediately - let PTY handler show the error
            return;
          }
          
          // Disconnect any existing active tunnel
          await this.disconnectTunnelIfActive(matchingTunnel.id, conn).catch(err => console.error('Error disconnecting tunnel:', err));
          
          console.log(`Remote forward ${bindAddr}:${bindPort} validated for user ${user.username} - matches tunnel: ${matchingTunnel.name}`);
          console.log(`Bandwidth limit: ${matchingTunnel.max_bandwidth ? `${matchingTunnel.max_bandwidth} bytes/s` : 'unlimited'}`);
          
          // Create a TCP server to listen on the requested port
          try {
            const server = await this.tcpServerManager.createTcpServer(
              bindAddr, 
              bindPort, 
              matchingTunnel.id, 
              user.id, 
              user.username, 
              conn
            );
            
            // Start the TCP server
            await this.tcpServerManager.startTcpServer(server, bindAddr, bindPort);
            
            console.log(`Remote forward listening on ${bindAddr}:${bindPort}`);
            
            // Mark the tunnel as online
            this.database.updateTunnelOnlineStatus(matchingTunnel.id, true);
            
            // Store the request information
            const key = `${user.username}_${bindPort}`;
            this.remoteForwards.set(key, { server, bindAddr, bindPort, connection: conn, user });
            this.activeTunnels.set(matchingTunnel.id, { tunnel: matchingTunnel, connection: conn, port: matchingTunnel.external_port, user });
            
            // Accept the port forward request
            accept();
            
            // Mark port forward as processed
            conn._processedPortForwards = (conn._processedPortForwards || 0) + 1;
            
            console.log(`Remote port forwarding accepted: ${bindAddr}:${bindPort}`);
          } catch (error) {
            console.error(`Error setting up TCP server for ${bindAddr}:${bindPort}:`, error);
            
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
            
            console.log(`Port forwarding request rejected for ${bindAddr}:${bindPort}, SSH connection closed`);
          }
        } catch (error) {
          console.error('Error setting up remote port forward:', error);
          reject();
        }
      } else if (name === 'cancel-tcpip-forward') {
        try {
          const { bindAddr, bindPort } = data;
          const key = `${user.username}_${bindPort}`;
          
          if (this.remoteForwards.has(key)) {
            const forwardInfo = this.remoteForwards.get(key);
            
            // Find the tunnel associated with this port to mark it offline
            const userTunnels = await this.database.getTunnelsByUserId(user.id);
            const matchingTunnel = userTunnels.find((tunnel: Tunnel) => tunnel.external_port === (forwardInfo?.bindPort || 0));
            if (matchingTunnel) {
              this.database.updateTunnelOnlineStatus(matchingTunnel.id, false);
              this.activeTunnels.delete(matchingTunnel.id);
            }
            
            // Close the TCP server
            try {
              await this.tcpServerManager.closeTcpServer(user.username, bindPort);
            } catch (error) {
              console.error(`Error closing TCP server for ${bindAddr}:${bindPort}:`, error);
            }
            
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



    conn.on('session', (accept: () => SSH2Session) => {
      const session: SSH2Session = accept();

      // Handle PTY requests
      session.on('pty', (accept: () => void, reject: () => void, info: SSH2PtyInfo) => {
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
      session.on('shell', (accept: () => SSH2Channel, _reject: () => void) => {
        // Wait for all port forward requests to be processed
        const pending = conn._pendingPortForwards || 0;
        const processed = conn._processedPortForwards || 0;
        
        if (processed < pending) {
          setTimeout(() => {
            session.emit('shell', accept, _reject);
          }, 500);
          return;
        }
        
        const channel: SSH2Channel = accept();
        
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
                const nonOverlappingForwards = activeRemoteForwards.filter((rf: { bindAddr: string; bindPort: number }) => 
                  !allTunnels.some((tunnel: Tunnel) => tunnel.external_port === rf.bindPort)
                );
                
                if (nonOverlappingForwards.length > 0) {
                  channel.write('\r\nRemote port forwards (client -> server):\r\n');
                  nonOverlappingForwards.forEach((rf: { bindAddr: string; bindPort: number }) => {
                    channel.write(`  [ACTIVE] client:${rf.bindPort} -> server:${rf.bindAddr}\r\n`);
                  });
                }
              } else if (command === 'status') {
                // Enter status mode
                await this.showTunnelStatus(channel, conn, user);
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

        channel.on('error', (err?: Error) => {
          if (err) {
            console.error(`Shell session error for user ${user.username}:`, err);
          } else {
            console.error(`Shell session error for user ${user.username} (unknown)`);
          }
        });
      });

      session.on('channel', (accept: () => SSH2Channel, _reject: () => void, info: SSH2ForwardData) => {
        if (info.type === 'direct-tcpip') {
          this.handleDirectTcpip(conn, accept, _reject, info, user);
        } else {
          console.log(`Rejected channel type: ${info.type}`);
          _reject();
        }
      });
    });

    conn.on('error', (err?: Error) => {
      if (err) {
        console.error(`Connection error for user ${user.username}:`, err);
      } else {
        console.error(`Connection error for user ${user.username} (unknown)`);
      }
      this.cleanupConnection(conn).catch(err => console.error('Error in cleanup:', err));
    });

    conn.on('end', async () => {
      console.log(`Connection ended for user ${user.username}`);
      await this.cleanupConnection(conn);
    });
  }

  private async handleDirectTcpip(
    conn: SSH2Connection,
    accept: () => SSH2Channel,
    _reject: () => void,
    info: SSH2ForwardData,
    user: UserData
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

      await this.tcpServerManager.handleDirectTcpip(conn, tunnel, user, info, accept);
    } catch (error) {
      console.error('Error handling direct-tcpip:', error);
    }
  }

  private updateTunnelStats(tunnelId: number, bytesReceived: number, bytesSent: number): void {
    this.database.updateTunnelStats(tunnelId, bytesReceived, bytesSent, 0); // 0 for active connections since we're just updating stats
  }

  // Method to disconnect a tunnel if it's being used by another connection
  async disconnectTunnelIfActive(tunnelId: number, currentConn: SSH2Connection): Promise<void> {
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
      const key = `${activeTunnel.user.username}_${activeTunnel.port || activeTunnel.tunnel.external_port}`;
      this.remoteForwards.delete(key);
      
      // Close the TCP server using TcpServerManager
      try {
        await this.tcpServerManager.closeTcpServer(activeTunnel.user.username, activeTunnel.tunnel.external_port);
      } catch (error) {
        console.error(`Error closing TCP server for tunnel ${tunnelId}:`, error);
      }
      
      // Remove from active tunnels
      this.activeTunnels.delete(tunnelId);
    }
  }

  // Method to cleanup all connections and servers for a given connection
  private async cleanupConnection(conn: SSH2Connection): Promise<void> {
    // Identify which tunnel IDs belong to this connection
    const tunnelIdsForThisConnection: number[] = [];
    const serversToClose: Array<{username: string, port: number}> = [];
    
    // Check regular tunnels
    this.tunnels.forEach((value, _key) => {
      if (value.connection === conn) {
        tunnelIdsForThisConnection.push(value.tunnel.id);
        console.log(`Marking tunnel for cleanup: ${value.tunnel.name}`);
      }
    });
    
    // Check remote port forwards
    this.remoteForwards.forEach((value, _key) => {
      if (value.connection === conn) {
        // Find the corresponding tunnel ID
        this.activeTunnels.forEach((activeTunnel, tunnelId) => {
          if (activeTunnel.connection === conn) {
            tunnelIdsForThisConnection.push(tunnelId);
            console.log(`Marking remote forward tunnel for cleanup: ${value.bindAddr}:${value.bindPort}`);
            
            // Collect servers to close
            serversToClose.push({
              username: value.user.username,
              port: value.bindPort
            });
            return;
          }
        });
      }
    });

    // Clean up regular tunnels
    this.tunnels.forEach((value) => {
      if (value.connection === conn) {
        console.log(`Cleaning up tunnel: ${value.tunnel.name}`);
        // Find the key for this value
        for (const [key, val] of this.tunnels.entries()) {
          if (val === value) {
            this.tunnels.delete(key);
            break;
          }
        }
      }
    });

    // Clean up remote port forwards
    this.remoteForwards.forEach((value) => {
      if (value.connection === conn) {
        console.log(`Cleaning up remote forward on ${value.bindAddr}:${value.bindPort}`);
        // Find the key for this value
        for (const [key, val] of this.remoteForwards.entries()) {
          if (val === value) {
            this.remoteForwards.delete(key);
            break;
          }
        }
      }
    });
    
    // Remove from active tunnels
    this.activeTunnels.forEach((activeTunnel, tunnelId) => {
      if (activeTunnel.connection === conn) {
        this.activeTunnels.delete(tunnelId);
      }
    });
    
    // Close all TCP servers using TcpServerManager
    const closePromises = serversToClose.map(({username, port}) => 
      this.tcpServerManager.closeTcpServer(username, port).catch(err => 
        console.error(`Error closing TCP server for ${username}:${port}:`, err)
      )
    );
    
    await Promise.all(closePromises);

    // Reset stats, online status, and connection tracking only for tunnels that belonged to this specific connection
    for (const tunnelId of tunnelIdsForThisConnection) {
      // Reset session stats
      this.database.resetCurrentSessionStats(tunnelId);
      
      // Mark tunnel as offline
      this.database.updateTunnelOnlineStatus(tunnelId, false);
    }
  }

  // Show real-time tunnel status in a table format
  private async showTunnelStatus(channel: SSH2Channel, conn: SSH2Connection, user: UserData): Promise<void> {
    let statusInterval: Timer | null = null;
    let isStatusMode = true;
    
    // Get user's specific refresh interval
    const userRefreshInterval = await this.database.getUserRefreshInterval(user.id);
    
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
      interface TunnelStat {
        tunnel_id: number;
        updated_at: string;
        active_connections: number;
        current_bytes_received: number;
        current_bytes_sent: number;
      }
      const statsMap = new Map<number, TunnelStat>();
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
    
    // Set up interval to refresh the table using the user's specific interval
    statusInterval = setInterval(() => {
      renderStatusTable();
    }, userRefreshInterval);
    
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
    // Clear all tunnels session state on server startup
    this.database.clearAllTunnelsSessionState().then(() => {
      console.log('All tunnel session state cleared on server startup');
      
      this.sshServer.listen({
        port: this.config.port,
        host: this.config.host || '0.0.0.0'
      }, callback);
    }).catch(err => {
      console.error('Error clearing tunnel session state on startup:', err);
      // Continue with server start even if clearing fails
      this.sshServer.listen({
        port: this.config.port,
        host: this.config.host || '0.0.0.0'
      }, callback);
    });
  }

  async stop(callback?: () => void): Promise<void> {
    console.log('Shutting down all TCP servers and SSH server...');
    
    // Close all TCP servers using TcpServerManager
    try {
      await this.tcpServerManager.closeAllServers();
      console.log('All TCP servers closed');
    } catch (error) {
      console.error('Error while closing TCP servers:', error);
    }
    
    // Clear remote forwards and active tunnels
    this.remoteForwards.clear();
    this.activeTunnels.clear();
    
    // Clear all tunnels session state
    try {
      await this.database.clearAllTunnelsSessionState();
      console.log('All tunnel session state cleared on server shutdown');
    } catch (error) {
      console.error('Error clearing session state on shutdown:', error);
    }
    
    // Now close the main SSH server
    this.sshServer.close(() => {
      console.log('SSH server closed');
      if (callback) callback();
    });
  }
}
