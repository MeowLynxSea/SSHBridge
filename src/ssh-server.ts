import {
  SSH2Connection,
  SSH2Session,
  SSH2Channel,
  SSH2PtyInfo,
  SSH2Server,
  SSH2AuthContext,
  SSH2RequestData,
  SSH2ForwardData,
  UserData,
  RemoteForwardInfo,
  ActiveTunnelInfo,
} from './types/ssh2-types.js';
import { Database, Tunnel } from './database.js';
// Time utilities are used in components, not here
import { TcpServerManager } from './tcpServerManager.js';
import { CUIManager } from './cui/CUIManager.js';
import { CUII18n } from './cui/CUII18n.js';
import { CUIDataProvider } from './cui/types.js';
import { getDisplayWidth } from './cui/i18n.js';
import ssh2 from 'ssh2';

// Extend ssh2 types for our custom properties
declare module 'ssh2' {
  interface Connection {
    _sshbForwardError?: { message: string; details: string };
    _sshbTunnelReplaced?: { message: string; details: string };
    _pendingPortForwards?: number;
    _processedPortForwards?: number;
    _connectionStartTime?: string; // ISO string when connection was established
    _connectionId?: string; // Unique ID for this SSH connection
  }

  interface Session {
    _showForwardError?: boolean;
    _showTunnelReplaced?: boolean;
  }

  interface Channel {
    _conn?: Connection; // Reference to the parent connection
  }
}

// Timer declarations are available globally

import './types/ssh2.d.js';

export interface SSHServerConfig {
  host?: string;
  port: number;
  hostKey: string;
}

export class SSHBridgeServer implements CUIDataProvider {
  private sshServer: SSH2Server;
  private database: Database;
  private config: SSHServerConfig;
  private tunnels: Map<string, { connection: SSH2Connection; tunnel: Tunnel }> = new Map();
  private remoteForwards: Map<string, RemoteForwardInfo> = new Map();
  private ptyInfo: SSH2PtyInfo | null = null;
  // 移除全局 currentChannel，改为每个 CUI 自己跟踪连接
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

  /**
   * 生成ASCII艺术欢迎界面
   */
  private async generateWelcomeScreen(user: UserData): Promise<string> {
    // 初始化i18n实例
    const i18n = new CUII18n(user.id, this.database);
    await i18n.init();

    const welcome = i18n.t('welcome.welcome');
    const userLabel = `${i18n.t('welcome.user')}: ${user.username}`;
    const pressAnyKey = i18n.t('welcome.pressAnyKey');

    // ASCII标题
    const bridgeArt = [
      '\r\n',
      '███████╗███████╗██╗  ██╗██████╗ ██████╗ ██╗██████╗  ██████╗ ███████╗\r\n',
      '██╔════╝██╔════╝██║  ██║██╔══██╗██╔══██╗██║██╔══██╗██╔════╝ ██╔════╝\r\n',
      '███████╗███████╗███████║██████╔╝██████╔╝██║██║  ██║██║  ███╗█████╗  \r\n',
      '╚════██║╚════██║██╔══██║██╔══██╗██╔══██╗██║██║  ██║██║   ██║██╔══╝  \r\n',
      '███████║███████║██║  ██║██████╔╝██║  ██║██║██████╔╝╚██████╔╝███████╗\r\n',
      '╚══════╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝╚═╝╚═════╝  ╚═════╝ ╚══════╝\r\n',
      '\r\n',
    ].join('');

    // 构建欢迎界面
    const welcomeScreen = [
      `\x1b[2J\x1b[H`, // 清屏
      bridgeArt,
      ' '.repeat(Math.max(0, Math.floor((70 - getDisplayWidth(welcome)) / 2))) + welcome + '\r\n',
      '\r\n',
      ' '.repeat(Math.max(0, Math.floor((70 - getDisplayWidth(userLabel)) / 2))) +
        userLabel +
        '\r\n',
      '\r\n',
      ' '.repeat(Math.max(0, Math.floor((70 - getDisplayWidth(pressAnyKey)) / 2))) +
        pressAnyKey +
        '\r\n',
      '\r\n',
    ].join('');

    return welcomeScreen;
  }

  private sendErrorMessageToClient(
    conn: SSH2Connection,
    errorMsg: string,
    detailMsg: string
  ): void {
    // Store the error message for display when PTY is requested
    conn._sshbForwardError = {
      message: errorMsg,
      details: detailMsg,
    };
  }

  private handleAuthenticatedConnection(conn: SSH2Connection, user: UserData) {
    console.log(`User ${user.username} authenticated`);

    // Store connection start time
    conn._connectionStartTime = new Date().toISOString();

    // Generate unique connection ID
    conn._connectionId = `${user.username}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log(`Generated connection ID: ${conn._connectionId} for user ${user.username}`);

    // Initialize port forward request tracking
    conn._pendingPortForwards = 0;
    conn._processedPortForwards = 0;

    // Reset current session stats when SSH session starts
    this.database
      .getTunnelsByUserId(user.id)
      .then((tunnels: Tunnel[]) => {
        tunnels.forEach((tunnel: Tunnel) => {
          // Only reset current session, not total traffic
          this.database.updateTunnelStats(tunnel.id, 0, 0, 0);
        });
      })
      .catch((err: Error) => {
        console.error('Error resetting stats on SSH session start:', err);
      });

    // Handle remote port forwarding requests
    conn.on(
      'request',
      async (accept: () => void, reject: () => void, name: string, data: SSH2RequestData) => {
        if (name === 'tcpip-forward') {
          try {
            const { bindAddr, bindPort } = data;

            // Track pending port forward requests
            conn._pendingPortForwards = (conn._pendingPortForwards || 0) + 1;

            // Check if this remote forward matches any of the user's tunnel configurations
            const userTunnels = await this.database.getTunnelsByUserId(user.id);
            const matchingTunnel = userTunnels.find((tunnel) => tunnel.external_port === bindPort);

            if (!matchingTunnel) {
              const errorMsg = `远程端口转发 ${bindAddr}:${bindPort} 未被授权`;
              console.error(`${errorMsg} - User: ${user.username}`);

              // Get user's configured tunnels for error message
              const availablePorts = userTunnels.map((t: Tunnel) => t.external_port).join(', ');
              const detailMsg = `该端口不匹配您配置的任何隧道。您已配置的端口: ${availablePorts || '无'}`;

              // Store error info to display when a PTY request is made
              conn._sshbForwardError = {
                message: errorMsg,
                details: detailMsg,
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
            const isPortInUse =
              this.tcpServerManager.isPortInUse(bindPort) ||
              this.activeTunnels.has(matchingTunnel.id);

            if (isTunnelOnline || isPortInUse) {
              const errorMsg = `远程端口 ${bindAddr}:${bindPort} 启用失败`;
              console.log(
                `Tunnel port ${bindPort} is already online for user ${user.username}, rejecting new connection...`
              );

              // Store error message to display when a PTY request is made
              conn._sshbForwardError = {
                message: errorMsg,
                details: `隧道端口 ${bindPort} 已在线。此隧道端口已在此连接或另一个连接中在线。请勿重复连接同一端口。`,
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
            await this.disconnectTunnelIfActive(matchingTunnel.id, conn).catch((err) =>
              console.error('Error disconnecting tunnel:', err)
            );

            console.log(
              `Remote forward ${bindAddr}:${bindPort} validated for user ${user.username} - matches tunnel: ${matchingTunnel.name}`
            );
            console.log(
              `Bandwidth limit: ${matchingTunnel.max_bandwidth ? `${matchingTunnel.max_bandwidth} bytes/s` : 'unlimited'}`
            );

            // Create a TCP server to listen on the requested port
            try {
              const server = await this.tcpServerManager.createTcpServer(
                bindAddr,
                bindPort,
                matchingTunnel.id,
                user.id,
                user.username,
                conn,
                conn._connectionId!
              );

              // Start the TCP server
              await this.tcpServerManager.startTcpServer(server, bindAddr, bindPort);

              console.log(`Remote forward listening on ${bindAddr}:${bindPort}`);

              // Mark the tunnel as online
              this.database.updateTunnelOnlineStatus(matchingTunnel.id, true);

              // Store the request information
              const key = `${user.username}_${bindPort}`;
              this.remoteForwards.set(key, {
                server,
                bindAddr,
                bindPort,
                connection: conn,
                user,
              });
              this.activeTunnels.set(matchingTunnel.id, {
                tunnel: matchingTunnel,
                connection: conn,
                port: matchingTunnel.external_port,
                user,
              });

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
                details: `隧道端口 ${bindPort} 已在线。此隧道端口已在此连接或另一个连接中在线。请勿重复连接同一端口。`,
              };

              reject();

              // Disconnect the SSH connection after a short delay
              setTimeout(() => {
                conn.end();
              }, 500);

              console.log(
                `Port forwarding request rejected for ${bindAddr}:${bindPort}, SSH connection closed`
              );
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
              const matchingTunnel = userTunnels.find(
                (tunnel: Tunnel) => tunnel.external_port === (forwardInfo?.bindPort || 0)
              );
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
      }
    );

    conn.on('session', (accept: () => SSH2Session) => {
      const session: SSH2Session = accept();

      // Handle PTY requests
      session.on('pty', async (accept: () => void, reject: () => void, info: SSH2PtyInfo) => {
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
      session.on('shell', async (accept: () => SSH2Channel, _reject: () => void) => {
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

        // Store channel reference on itself for later use
        channel._conn = conn;

        // Check if there was a forward error (from either connection or session)
        const forwardError =
          conn._sshbForwardError || (session._showForwardError ? conn._sshbForwardError : null);
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
        const tunnelReplaced =
          conn._sshbTunnelReplaced ||
          (session._showTunnelReplaced ? conn._sshbTunnelReplaced : null);
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

        // 显示ASCII艺术欢迎信息，等待用户按键进入CUI
        const welcomeScreen = await this.generateWelcomeScreen(user);
        channel.write(welcomeScreen);

        // 等待用户按键
        let cuiStarted = false;
        channel.on('data', async (_data: Buffer) => {
          if (cuiStarted) return; // 防止重复启动

          cuiStarted = true;
          // 将当前连接引用传递给 CUI，而不是依赖全局状态
          const cuiManager = new CUIManager(channel, conn, this.database, user, this);
          await cuiManager.start();
          // CUIManager会处理所有后续交互，包括退出
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

      session.on(
        'channel',
        (accept: () => SSH2Channel, _reject: () => void, info: SSH2ForwardData) => {
          if (info.type === 'direct-tcpip') {
            this.handleDirectTcpip(conn, accept, _reject, info, user);
          } else {
            console.log(`Rejected channel type: ${info.type}`);
            _reject();
          }
        }
      );
    });

    conn.on('error', (err?: Error) => {
      if (err) {
        console.error(`Connection error for user ${user.username}:`, err);
      } else {
        console.error(`Connection error for user ${user.username} (unknown)`);
      }
      this.cleanupConnection(conn).catch((err) => console.error('Error in cleanup:', err));
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

      const tunnel = tunnels.find((t: Tunnel) => t.external_port === info.destPort);

      if (!tunnel) {
        console.log(`No tunnel found for ${info.destAddr}:${info.destPort}`);
        return;
      }

      await this.tcpServerManager.handleDirectTcpip(
        conn,
        tunnel,
        user,
        info,
        accept,
        conn._connectionId!
      );
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
        details: '您的隧道已从另一个位置连接。此连接将被关闭。',
      };

      // Close the old connection
      activeTunnel.connection.end();

      // Clean up the old tunnel
      const key = `${activeTunnel.user.username}_${activeTunnel.port || activeTunnel.tunnel.external_port}`;
      this.remoteForwards.delete(key);

      // Close the TCP server using TcpServerManager
      try {
        await this.tcpServerManager.closeTcpServer(
          activeTunnel.user.username,
          activeTunnel.tunnel.external_port
        );
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
    const serversToClose: Array<{ username: string; port: number }> = [];

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
            console.log(
              `Marking remote forward tunnel for cleanup: ${value.bindAddr}:${value.bindPort}`
            );

            // Collect servers to close
            serversToClose.push({
              username: value.user.username,
              port: value.bindPort,
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
    const closePromises = serversToClose.map(({ username, port }) =>
      this.tcpServerManager
        .closeTcpServer(username, port)
        .catch((err) => console.error(`Error closing TCP server for ${username}:${port}:`, err))
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

  // 实现CUIDataProvider接口
  async getActiveRemoteForwards(connection?: SSH2Connection): Promise<
    Map<
      string,
      {
        bindAddr: string;
        bindPort: number;
        connection: SSH2Connection;
        user: {
          id: number;
          username: string;
        };
      }
    >
  > {
    // 如果指定了连接，只返回属于该连接的转发
    if (connection) {
      const result = new Map();
      for (const [key, value] of this.remoteForwards.entries()) {
        if (value.connection === connection) {
          result.set(key, value);
        }
      }
      return result;
    }

    // 否则返回所有
    return this.remoteForwards;
  }

  async getActiveTunnels(connection?: SSH2Connection): Promise<
    Array<{
      id: number;
      name: string;
      port: number;
      external_port: number;
      activeConnections: number;
      sessionBytes: number;
    }>
  > {
    const result: Array<{
      id: number;
      name: string;
      port: number;
      external_port: number;
      activeConnections: number;
      sessionBytes: number;
    }> = [];

    for (const [tunnelId, activeTunnel] of this.activeTunnels.entries()) {
      // 如果指定了连接，只返回属于该连接的隧道
      if (connection && activeTunnel.connection !== connection) {
        continue;
      }

      const allStats = await this.database.getAllTunnelStats();
      const stats = allStats.find((stat) => stat.tunnel_id === tunnelId);

      result.push({
        id: tunnelId,
        name: activeTunnel.tunnel.name,
        port: activeTunnel.port,
        external_port: activeTunnel.tunnel.external_port,
        activeConnections: stats?.active_connections || 0,
        sessionBytes: (stats?.current_bytes_received || 0) + (stats?.current_bytes_sent || 0),
      });
    }

    return result;
  }

  async getAllTunnelStatuses(
    userId: number,
    currentConnection?: SSH2Connection
  ): Promise<
    Array<{
      id: number;
      name: string;
      external_port: number;
      status: string;
      statusColor: string;
      displayStatus: string;
    }>
  > {
    // 获取用户的所有隧道
    const userTunnels = await this.database.getTunnelsByUserId(userId);
    const result: Array<{
      id: number;
      name: string;
      external_port: number;
      status: string;
      statusColor: string;
      displayStatus: string;
    }> = [];

    for (const tunnel of userTunnels) {
      let status = 'INACTIVE';
      let statusColor = '\x1b[31m'; // 红色

      // 检查隧道是否被当前连接占用
      const isTunnelActiveForCurrentConnection = Array.from(this.activeTunnels.entries()).some(
        ([, activeTunnel]) =>
          activeTunnel.tunnel.id === tunnel.id && activeTunnel.connection === currentConnection
      );

      // 检查隧道是否被其他连接占用
      const isTunnelActiveForOtherConnection = Array.from(this.activeTunnels.entries()).some(
        ([, activeTunnel]) =>
          activeTunnel.tunnel.id === tunnel.id && activeTunnel.connection !== currentConnection
      );

      // 检查远程端口转发
      const hasRemoteForward = Array.from(this.remoteForwards.entries()).some(
        ([, value]) =>
          value.bindPort === tunnel.external_port && value.connection === currentConnection
      );

      if (isTunnelActiveForCurrentConnection || hasRemoteForward) {
        status = 'ACTIVE';
        statusColor = '\x1b[32m'; // 绿色
      } else if (isTunnelActiveForOtherConnection) {
        status = 'OCCUPIED';
        statusColor = '\x1b[34m'; // 蓝色
      }

      result.push({
        id: tunnel.id,
        name: tunnel.name,
        external_port: tunnel.external_port,
        status,
        statusColor,
        displayStatus: statusColor + status.padEnd(11) + '\x1b[0m',
      });
    }

    return result;
  }

  start(callback?: () => void) {
    // Clear all tunnels session state on server startup
    this.database
      .clearAllTunnelsSessionState()
      .then(() => {
        console.log('All tunnel session state cleared on server startup');

        this.sshServer.listen(
          {
            port: this.config.port,
            host: this.config.host || '0.0.0.0',
          },
          callback
        );
      })
      .catch((err) => {
        console.error('Error clearing tunnel session state on startup:', err);
        // Continue with server start even if clearing fails
        this.sshServer.listen(
          {
            port: this.config.port,
            host: this.config.host || '0.0.0.0',
          },
          callback
        );
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
