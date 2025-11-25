import { SSH2Channel, SSH2Connection } from '../types/ssh2-types';
import { Database } from '../database';
import { getCurrentTime, formatDuration } from '../utils/timeUtils';
import { CUIDataProvider } from './types';

// CUI界面状态
export enum CUIScreen {
  MAIN = 'main',
  TUNNELS = 'tunnels',
  STATUS = 'status',
  HELP = 'help'
}

// CUI导航历史
interface CUIHistory {
  screen: CUIScreen;
  data?: unknown;
}

export class CUIManager {
  private channel: SSH2Channel;
  private connection: SSH2Connection;
  private database: Database;
  private user: {
    id: number;
    username: string;
  };
  private dataProvider: CUIDataProvider;
  private currentScreen: CUIScreen = CUIScreen.MAIN;
  private history: CUIHistory[] = [];
  private statusInterval: ReturnType<typeof setInterval> | null = null;
  private tunnelsInterval: ReturnType<typeof setInterval> | null = null;
  private isStatusMode = false;

  constructor(channel: SSH2Channel, connection: SSH2Connection, database: Database, user: {
    id: number;
    username: string;
  }, dataProvider: CUIDataProvider) {
    this.channel = channel;
    this.connection = connection;
    this.database = database;
    this.user = user;
    this.dataProvider = dataProvider;
  }

  // 启动CUI界面
  async start(): Promise<void> {
    await this.showScreen(CUIScreen.MAIN);
    this.setupInputHandler();
  }

  // 显示指定界面
  private async showScreen(screen: CUIScreen, data?: unknown): Promise<void> {
    // 保存当前状态到历史
    if (screen !== CUIScreen.MAIN) {
      this.history.push({ screen: this.currentScreen, data });
    }
    
    this.currentScreen = screen;
    
    // 清屏并显示新界面
    this.clearScreen();
    
    switch (screen) {
      case CUIScreen.MAIN:
        await this.showMainScreen();
        break;
      case CUIScreen.TUNNELS:
        await this.showTunnelsScreen();
        break;
      case CUIScreen.STATUS:
        await this.showStatusScreen();
        break;
      case CUIScreen.HELP:
        await this.showHelpScreen();
        break;
    }
  }

  // 返回上一级
  private goBack(): void {
    // 清理隧道刷新定时器（如果从隧道管理界面返回）
    if (this.currentScreen === CUIScreen.TUNNELS && this.tunnelsInterval) {
      clearInterval(this.tunnelsInterval);
      this.tunnelsInterval = null;
    }
    
    if (this.history.length > 0) {
      const previous = this.history.pop()!;
      this.currentScreen = previous.screen;
      this.showScreen(previous.screen, previous.data);
    } else {
      this.showScreen(CUIScreen.MAIN);
    }
  }

  // 清屏
  private clearScreen(): void {
    this.channel.write('\x1b[2J\x1b[H');
  }

  // 显示主界面
  private async showMainScreen(): Promise<void> {
    this.channel.write(`╔══════════════════════════════════════════════════════════════╗\r\n`);
    this.channel.write(`║                    SSHBridge 管理系统                        ║\r\n`);
    this.channel.write(`║                                                              ║\r\n`);
    this.channel.write(`║  用户: ${this.user.username.padEnd(20)}  时间: ${getCurrentTime().padEnd(20)}  ║\r\n`);
    this.channel.write(`╚══════════════════════════════════════════════════════════════╝\r\n`);
    this.channel.write(`\r\n`);
    this.channel.write(`请选择操作:\r\n`);
    this.channel.write(`  1. 隧道管理\r\n`);
    this.channel.write(`  2. 实时状态监控\r\n`);
    this.channel.write(`  3. 帮助信息\r\n`);
    this.channel.write(`  4. 退出连接\r\n`);
    this.channel.write(`\r\n`);
    this.channel.write(`────────────────────────────────────────────────────────────────\r\n`);
    this.channel.write(`请按数字键选择: `);
  }

  // 显示隧道列表界面
  private async showTunnelsScreen(): Promise<void> {
    // 获取用户刷新间隔
    const userRefreshInterval = await this.database.getUserRefreshInterval(this.user.id);
    
    // 渲染隧道管理界面
    const renderTunnelsScreen = async () => {
      if (this.currentScreen !== CUIScreen.TUNNELS) return;
      
      this.clearScreen();
      
      // 使用新的方法获取所有隧道的状态
      const tunnelStatuses = await this.dataProvider.getAllTunnelStatuses(this.user.id, this.connection);
    
    // 获取活动的远程端口转发（仅属于当前连接）
    const activeRemoteForwards = Array.from((await this.dataProvider.getActiveRemoteForwards(this.connection)).entries())
      .map(([, value]) => ({ bindAddr: value.bindAddr, bindPort: value.bindPort }));

    this.channel.write(`╔══════════════════════════════════════════════════════════════╗\r\n`);
    this.channel.write(`║                        隧道管理                              ║\r\n`);
    this.channel.write(`╚══════════════════════════════════════════════════════════════╝\r\n`);
    this.channel.write(`\r\n`);
    
    if (tunnelStatuses.length === 0) {
      this.channel.write(`  当前没有配置的隧道\r\n\r\n`);
    } else {
      this.channel.write(`  配置的隧道列表 :\r\n`);
      this.channel.write(`  ┌─────────────┬──────────────────────────┬─────────────┐\r\n`);
      this.channel.write(`  │ 状态        │ 隧道名称                 │ 外部端口    │\r\n`);
      this.channel.write(`  ├─────────────┼──────────────────────────┼─────────────┤\r\n`);
      
      tunnelStatuses.forEach((tunnelStatus: {
        id: number;
        name: string;
        external_port: number;
        status: string;
        statusColor: string;
        displayStatus: string;
      }) => {
        const row = `  │ ${tunnelStatus.displayStatus} │ ${tunnelStatus.name.padEnd(24)} │ ${tunnelStatus.external_port.toString().padEnd(11)} │\r\n`;
        this.channel.write(row);
      });
      
      this.channel.write(`  └─────────────┴──────────────────────────┴─────────────┘\r\n\r\n`);
    }
    // 显示其他活动的端口转发（不属于配置的隧道）
      if (activeRemoteForwards.length > 0) {
        const configTunnelPorts = new Set(tunnelStatuses.map(t => t.external_port));
        const otherForwards = activeRemoteForwards.filter(rf => !configTunnelPorts.has(rf.bindPort));
        
        if (otherForwards.length > 0) {
          this.channel.write(`  其他活动端口转发:\r\n`);
          otherForwards.forEach((rf: { bindAddr: string; bindPort: number }) => {
            this.channel.write(`  • 客户端:${rf.bindPort} -> 服务器:${rf.bindAddr}\r\n`);
          });
          this.channel.write(`\r\n`);
        }
      }
      
      this.channel.write(`\r\n`);
      this.channel.write(`──────────────────────────────────────────────────────────────\r\n`);
      this.channel.write(`按 Ctrl+C 返回主菜单\r\n`);
    };
    
    // 初始渲染
    await renderTunnelsScreen();
    
    // 设置自动刷新
    if (this.tunnelsInterval) {
      clearInterval(this.tunnelsInterval);
    }
    
    this.tunnelsInterval = setInterval(() => {
      if (this.currentScreen === CUIScreen.TUNNELS && !this.isStatusMode) {
        renderTunnelsScreen();
      }
    }, userRefreshInterval);
  }

  // 显示实时状态界面
  private async showStatusScreen(): Promise<void> {
    this.isStatusMode = true;
    
    // 获取用户刷新间隔
    const userRefreshInterval = await this.database.getUserRefreshInterval(this.user.id);
    
    // 格式化字节数
    const formatBytes = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // 渲染状态表格
    const renderStatusTable = async () => {
      if (!this.isStatusMode) return;
      
      this.clearScreen();
      this.channel.write(`\x1b[1mSSHBridge 隧道状态监控\x1b[0m\r\n`);
      this.channel.write(`用户: ${this.user.username} | 仅显示当前会话隧道 | 按 Ctrl+C 返回\r\n`);
      this.channel.write(`最后更新: ${getCurrentTime()}\r\n\r\n`);
      
      // 获取活动隧道（仅属于当前连接）
      const activeTunnels = await this.dataProvider.getActiveTunnels(this.connection);
      
      // 绘制表格
      this.channel.write(`┌─────────────┬──────────────────────────┬───────────────┬──────────────┬────────────────────────────┐\r\n`);
      this.channel.write(`│ \x1b[1m状态       \x1b[0m │ \x1b[1m隧道名称                \x1b[0m │ \x1b[1m持续时间     \x1b[0m │ \x1b[1m活动连接数  \x1b[0m │ \x1b[1m会话流量                  \x1b[0m │\r\n`);
      this.channel.write(`├─────────────┼──────────────────────────┼───────────────┼──────────────┼────────────────────────────┤\r\n`);
      
      if (activeTunnels.length === 0) {
        this.channel.write(`│             │ 当前会话无活动隧道                                     │\r\n`);
      } else {
        for (const tunnel of activeTunnels) {
          const duration = this.connection._connectionStartTime ? 
            formatDuration(this.connection._connectionStartTime) : 'N/A';
          const activeConnections = tunnel.activeConnections?.toString() || '0';
          const sessionTraffic = tunnel.sessionBytes ? 
            formatBytes(tunnel.sessionBytes) : '0 B';
          
          const row = `│ \x1b[32mACTIVE\x1b[0m` + 
                     ' '.repeat(11 - 6) + ' │ ' +
                     tunnel.name.padEnd(24) + ' │ ' +
                     duration.padEnd(13) + ' │ ' +
                     activeConnections.padEnd(12) + ' │ ' +
                     sessionTraffic.padEnd(26) + ' │\r\n';
          this.channel.write(row);
        }
      }
      
      this.channel.write(`└─────────────┴──────────────────────────┴───────────────┴──────────────┴────────────────────────────┘\r\n`);
      this.channel.write(`\r\n当前会话活动隧道数: ${activeTunnels.length}\r\n`);
    };
    
    // 初始渲染
    await renderStatusTable();
    
    // 设置刷新间隔
    this.statusInterval = setInterval(() => {
      renderStatusTable();
    }, userRefreshInterval);
  }

  // 显示帮助界面
  private async showHelpScreen(): Promise<void> {
    this.channel.write(`╔══════════════════════════════════════════════════════════════╗\r\n`);
    this.channel.write(`║                        帮助信息                              ║\r\n`);
    this.channel.write(`╚══════════════════════════════════════════════════════════════╝\r\n`);
    this.channel.write(`\r\n`);
    
    this.channel.write(`\x1b[1m基本操作:\x1b[0m\r\n`);
    this.channel.write(`  • 使用数字键 (1-9) 选择菜单项\r\n`);
    this.channel.write(`  • 按 Ctrl+C 返回上一级菜单\r\n`);
    this.channel.write(`  • 在实时监控界面中，Ctrl+C 可退出监控\r\n\r\n`);
    
    this.channel.write(`\x1b[1m界面说明:\x1b[0m\r\n`);
    this.channel.write(`  \x1b[32m1. 隧道管理\x1b[0m\r\n`);
    this.channel.write(`     查看您的所有隧道状态和活动端口转发\r\n\r\n`);
    
    this.channel.write(`  \x1b[32m2. 实时状态监控\x1b[0m\r\n`);
    this.channel.write(`     实时监控活动隧道的状态、流量和连接数\r\n\r\n`);
    
    this.channel.write(`  \x1b[32m3. 帮助信息\x1b[0m\r\n`);
    this.channel.write(`     显示此帮助信息\r\n\r\n`);
    
    this.channel.write(`  \x1b[32m4. 退出连接\x1b[0m\r\n`);
    this.channel.write(`     断开与SSHBridge服务器的连接\r\n\r\n`);
    
    this.channel.write(`\x1b[1m隧道状态说明:\x1b[0m\r\n`);
    this.channel.write(`  \x1b[32mACTIVE\x1b[0m    - 隧道当前活动且可以接受连接（您的连接）\r\n`);
    this.channel.write(`  \x1b[34mOCCUPIED\x1b[0m - 隧道被其他连接占用\r\n`);
    this.channel.write(`  \x1b[31mINACTIVE\x1b[0m  - 隧道当前不活动\r\n\r\n`);
    
    this.channel.write(`\x1b[1m故障排除:\x1b[0m\r\n`);
    this.channel.write(`  如果隧道显示为INACTIVE，请检查:\r\n`);
    this.channel.write(`  • SSH客户端是否正确设置了端口转发 (ssh -R)\r\n`);
    this.channel.write(`  • 端口是否被其他进程占用\r\n`);
    this.channel.write(`  • 防火墙设置是否允许端口转发\r\n\r\n`);
    
    this.channel.write(`\r\n`);
    this.channel.write(`──────────────────────────────────────────────────────────────\r\n`);
    this.channel.write(`按 Ctrl+C 返回主菜单\r\n`);
  }

  // 设置输入处理
  private setupInputHandler(): void {
    this.channel.on('data', async (data: Buffer) => {
      const str = data.toString();
      
      // 在状态监控模式下，只处理Ctrl+C
      if (this.isStatusMode) {
        if (str.includes('\x03')) {
          this.exitStatusMode();
        }
        return;
      }
      
      // 处理Ctrl+C - 返回上一级
      if (str.includes('\x03')) {
        this.goBack();
        return;
      }
      
      // 处理数字键输入
      const key = str.trim();
      if (/^[1-9]$/.test(key)) {
        await this.handleKeyPress(parseInt(key));
      }
    });
  }

  // 处理按键
  private async handleKeyPress(key: number): Promise<void> {
    switch (this.currentScreen) {
      case CUIScreen.MAIN:
        await this.handleMainScreenKeyPress(key);
        break;
      case CUIScreen.TUNNELS:
      case CUIScreen.HELP:
        // 在这些界面中，任何数字键都返回主菜单
        await this.showScreen(CUIScreen.MAIN);
        break;
    }
  }

  // 处理主界面按键
  private async handleMainScreenKeyPress(key: number): Promise<void> {
    switch (key) {
      case 1:
        await this.showScreen(CUIScreen.TUNNELS);
        break;
      case 2:
        await this.showScreen(CUIScreen.STATUS);
        break;
      case 3:
        await this.showScreen(CUIScreen.HELP);
        break;
      case 4:
        this.exitConnection();
        break;
      default:
        // 无效按键，重新显示主界面
        await this.showScreen(CUIScreen.MAIN);
        break;
    }
  }

  // 退出状态监控模式
  private exitStatusMode(): void {
    this.isStatusMode = false;
    
    // 清除定时器
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
    
    // 返回主界面
    this.showScreen(CUIScreen.MAIN);
  }

  // 退出连接
  private exitConnection(): void {
    // 清理状态监控和隧道刷新
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
    if (this.tunnelsInterval) {
      clearInterval(this.tunnelsInterval);
    }
    
    this.channel.write('\n再见!\n');
    this.channel.end();
    this.connection.end();
  }

  // 辅助方法已在构造函数中通过数据提供者实现
  // 这里移除原有的辅助方法，保持CUIManager的解耦
}