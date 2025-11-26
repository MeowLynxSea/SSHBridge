import { SSH2Channel, SSH2Connection } from '../types/ssh2-types';
import { Database } from '../database';
import { getCurrentTime, formatDuration } from '../utils/timeUtils';
import { CUIDataProvider } from './types';
import { CUII18n } from './CUII18n';

// CUI界面状态
export enum CUIScreen {
  MAIN = 'main',
  TUNNELS = 'tunnels',
  STATUS = 'status',
  HELP = 'help',
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
  private i18n: CUII18n;

  constructor(
    channel: SSH2Channel,
    connection: SSH2Connection,
    database: Database,
    user: {
      id: number;
      username: string;
    },
    dataProvider: CUIDataProvider
  ) {
    this.channel = channel;
    this.connection = connection;
    this.database = database;
    this.user = user;
    this.dataProvider = dataProvider;
    this.i18n = new CUII18n(user.id, database);
  }

  // 启动CUI界面
  async start(): Promise<void> {
    // 初始化国际化
    await this.i18n.init();
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
    const title = this.i18n.t('main.title');
    const user = this.i18n.t('main.user');
    const time = this.i18n.t('main.time');
    const selectAction = this.i18n.t('main.selectAction');
    const tunnelManagement = this.i18n.t('main.tunnelManagement');
    const realtimeStatus = this.i18n.t('main.realtimeStatus');
    const helpInfo = this.i18n.t('main.helpInfo');
    const exitConnection = this.i18n.t('main.exitConnection');
    const pressKeyToSelect = this.i18n.t('main.pressKeyToSelect');

    // 计算边框长度，确保能容纳标题
    const borderLength = Math.max(title.length + 2, 64);
    const horizontalBorder = '═'.repeat(borderLength);

    // 计算用户信息的填充
    const userInfo = `${user}: ${this.user.username}  ${time}: ${getCurrentTime()}`;
    const paddedUserInfo = userInfo.padCenter(borderLength);

    this.channel.write(`╔${horizontalBorder}╗\r\n`);
    this.channel.write(`║${title.padCenter(borderLength)}║\r\n`);
    this.channel.write(`║${' '.repeat(borderLength)}║\r\n`);
    this.channel.write(`║${paddedUserInfo}║\r\n`);
    this.channel.write(`╚${horizontalBorder}╝\r\n`);
    this.channel.write(`\r\n`);
    this.channel.write(`${selectAction}\r\n`);
    this.channel.write(`  ${tunnelManagement}\r\n`);
    this.channel.write(`  ${realtimeStatus}\r\n`);
    this.channel.write(`  ${helpInfo}\r\n`);
    this.channel.write(`  ${exitConnection}\r\n`);
    this.channel.write(`\r\n`);
    this.channel.write(`────────────────────────────────────────────────────────────────\r\n`);
    this.channel.write(`${pressKeyToSelect}`);
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
      const tunnelStatuses = await this.dataProvider.getAllTunnelStatuses(
        this.user.id,
        this.connection
      );

      // 获取活动的远程端口转发（仅属于当前连接）
      const activeRemoteForwards = Array.from(
        (await this.dataProvider.getActiveRemoteForwards(this.connection)).entries()
      ).map(([, value]) => ({ bindAddr: value.bindAddr, bindPort: value.bindPort }));

      // 获取本地化文本
      const title = this.i18n.t('tunnels.title');
      const noTunnels = this.i18n.t('tunnels.noTunnels');
      const tunnelList = this.i18n.t('tunnels.tunnelList');
      const otherActiveForwards = this.i18n.t('tunnels.otherActiveForwards');
      const pressCtrlCToReturn = this.i18n.t('tunnels.pressCtrlCToReturn');

      // 计算边框长度，确保能容纳标题
      const borderLength = Math.max(title.length + 2, 64);
      const horizontalBorder = '═'.repeat(borderLength);

      this.channel.write(`╔${horizontalBorder}╗\r\n`);
      this.channel.write(`║${title.padCenter(borderLength)}║\r\n`);
      this.channel.write(`╚${horizontalBorder}╝\r\n`);
      this.channel.write(`\r\n`);

      if (tunnelStatuses.length === 0) {
        this.channel.write(`  ${noTunnels}\r\n\r\n`);
      } else {
        this.channel.write(`  ${tunnelList}\r\n`);

        // 获取表格边框和本地化表头
        const borders = this.i18n.getTunnelsTableBorders();
        this.channel.write(`  ${borders.top}\r\n`);
        this.channel.write(`  ${borders.header}\r\n`);
        this.channel.write(`  ${borders.middle}\r\n`);

        tunnelStatuses.forEach(
          (tunnelStatus: {
            id: number;
            name: string;
            external_port: number;
            status: string;
            statusColor: string;
            displayStatus: string;
          }) => {
            // 直接使用带颜色的displayStatus，确保固定宽度
            const statusText = this.i18n.getFixedWidthText('status', tunnelStatus.displayStatus);
            const row = `  │ ${statusText} │ ${this.i18n.getFixedWidthText('tunnelName', tunnelStatus.name)} │ ${this.i18n.getFixedWidthText('externalPort', tunnelStatus.external_port.toString())} │\r\n`;
            this.channel.write(row);
          }
        );

        this.channel.write(`  ${borders.bottom}\r\n\r\n`);
      }
      // 显示其他活动的端口转发（不属于配置的隧道）
      if (activeRemoteForwards.length > 0) {
        const configTunnelPorts = new Set(tunnelStatuses.map((t) => t.external_port));
        const otherForwards = activeRemoteForwards.filter(
          (rf) => !configTunnelPorts.has(rf.bindPort)
        );

        if (otherForwards.length > 0) {
          this.channel.write(`  ${otherActiveForwards}\r\n`);
          otherForwards.forEach((rf: { bindAddr: string; bindPort: number }) => {
            const clientToServerText = this.i18n.t('tunnels.clientToServer', {
              port: rf.bindPort,
              addr: rf.bindAddr,
            });
            this.channel.write(`  ${clientToServerText}\r\n`);
          });
          this.channel.write(`\r\n`);
        }
      }

      this.channel.write(`\r\n`);
      this.channel.write(`──────────────────────────────────────────────────────────────\r\n`);
      this.channel.write(`${pressCtrlCToReturn}\r\n`);
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

    // 获取本地化文本
    const title = this.i18n.t('status.title');
    const user = this.i18n.t('status.user');
    const currentSessionOnly = this.i18n.t('status.currentSessionOnly');
    const pressCtrlCToReturn = this.i18n.t('status.pressCtrlCToReturnAction');
    const lastUpdate = this.i18n.t('status.lastUpdate');
    const noActiveTunnels = this.i18n.t('status.noActiveTunnels');
    const currentActiveTunnels = this.i18n.t('status.currentActiveTunnels');

    // 渲染状态表格
    const renderStatusTable = async () => {
      if (!this.isStatusMode) return;

      this.clearScreen();
      this.channel.write(`\x1b[1m${title}\x1b[0m\r\n`);
      this.channel.write(
        `${user}: ${this.user.username} | ${currentSessionOnly} | ${pressCtrlCToReturn}\r\n`
      );
      this.channel.write(`${lastUpdate}: ${getCurrentTime()}\r\n\r\n`);

      // 获取活动隧道（仅属于当前连接）
      const activeTunnels = await this.dataProvider.getActiveTunnels(this.connection);

      // 绘制表格
      const borders = this.i18n.getTableBorders();
      this.channel.write(`${borders.top}\r\n`);
      this.channel.write(`${borders.header}\r\n`);
      this.channel.write(`${borders.middle}\r\n`);

      if (activeTunnels.length === 0) {
        this.channel.write(`│             │ ${noActiveTunnels.padEnd(57)} │\r\n`);
      } else {
        for (const tunnel of activeTunnels) {
          const duration = this.connection._connectionStartTime
            ? formatDuration(this.connection._connectionStartTime)
            : 'N/A';
          const activeConnections = tunnel.activeConnections?.toString() || '0';
          const sessionTraffic = tunnel.sessionBytes ? formatBytes(tunnel.sessionBytes) : '0 B';
          const externalPort = tunnel.external_port?.toString() || 'N/A';

          // 使用固定宽度确保表格对齐
          const statusText = this.i18n.getFixedWidthText('status', '\x1b[32mACTIVE.    \x1b[0m');
          const nameText = this.i18n.getFixedWidthText('tunnelName', tunnel.name);
          const externalPortText = this.i18n.getFixedWidthText('externalPort', externalPort);
          const durationText = this.i18n.getFixedWidthText('duration', duration);
          const connectionsText = this.i18n.getFixedWidthText(
            'activeConnections',
            activeConnections
          );
          const trafficText = this.i18n.getFixedWidthText('sessionTraffic', sessionTraffic);

          const row = `│ ${statusText} │ ${nameText} │ ${externalPortText} │ ${durationText} │ ${connectionsText} │ ${trafficText} │\r\n`;
          this.channel.write(row);
        }
      }

      this.channel.write(`${borders.bottom}\r\n`);
      this.channel.write(`\r\n${currentActiveTunnels}${activeTunnels.length}\r\n`);
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
    // 获取本地化文本
    const title = this.i18n.t('help.title');
    const basicOperations = this.i18n.t('help.basicOperations');
    const useNumberKeys = this.i18n.t('help.useNumberKeys');
    const pressCtrlCToReturn = this.i18n.t('help.pressCtrlCToReturnMenu');
    const pressCtrlCToExitMonitor = this.i18n.t('help.pressCtrlCToExitMonitor');
    const interfaceDescription = this.i18n.t('help.interfaceDescription');
    const tunnelManagementDesc = this.i18n.t('help.tunnelManagementDesc');
    const realtimeStatusDesc = this.i18n.t('help.realtimeStatusDesc');
    const helpInfoDesc = this.i18n.t('help.helpInfoDesc');
    const exitConnectionDesc = this.i18n.t('help.exitConnectionDesc');
    const tunnelStatusDescription = this.i18n.t('help.tunnelStatusDescription');
    const activeDesc = this.i18n.t('help.activeDesc');
    const occupiedDesc = this.i18n.t('help.occupiedDesc');
    const inactiveDesc = this.i18n.t('help.inactiveDesc');
    const troubleshooting = this.i18n.t('help.troubleshooting');
    const ifTunnelInactive = this.i18n.t('help.ifTunnelInactive');
    const sshClientSetup = this.i18n.t('help.sshClientSetup');
    const portInUse = this.i18n.t('help.portInUse');
    const firewallSettings = this.i18n.t('help.firewallSettings');
    const pressCtrlCToReturnMain = this.i18n.t('help.pressCtrlCToReturn');

    // 计算边框长度，确保能容纳标题
    const borderLength = Math.max(title.length + 2, 64);
    const horizontalBorder = '═'.repeat(borderLength);

    this.channel.write(`╔${horizontalBorder}╗\r\n`);
    this.channel.write(`║${title.padCenter(borderLength)}║\r\n`);
    this.channel.write(`╚${horizontalBorder}╝\r\n`);
    this.channel.write(`\r\n`);

    this.channel.write(`\x1b[1m${basicOperations}\x1b[0m\r\n`);
    this.channel.write(`  ${useNumberKeys}\r\n`);
    this.channel.write(`  ${pressCtrlCToReturn}\r\n`);
    this.channel.write(`  ${pressCtrlCToExitMonitor}\r\n\r\n`);

    this.channel.write(`\x1b[1m${interfaceDescription}\x1b[0m\r\n`);
    this.channel.write(`  \x1b[32m${this.i18n.t('main.tunnelManagement')}\x1b[0m\r\n`);
    this.channel.write(`     ${tunnelManagementDesc}\r\n\r\n`);

    this.channel.write(`  \x1b[32m${this.i18n.t('main.realtimeStatus')}\x1b[0m\r\n`);
    this.channel.write(`     ${realtimeStatusDesc}\r\n\r\n`);

    this.channel.write(`  \x1b[32m${this.i18n.t('main.helpInfo')}\x1b[0m\r\n`);
    this.channel.write(`     ${helpInfoDesc}\r\n\r\n`);

    this.channel.write(`  \x1b[32m${this.i18n.t('main.exitConnection')}\x1b[0m\r\n`);
    this.channel.write(`     ${exitConnectionDesc}\r\n\r\n`);

    this.channel.write(`\x1b[1m${tunnelStatusDescription}\x1b[0m\r\n`);
    this.channel.write(`  \x1b[32m${this.i18n.t('general.active')}\x1b[0m    ${activeDesc}\r\n`);
    this.channel.write(`  \x1b[34m${this.i18n.t('general.occupied')}\x1b[0m  ${occupiedDesc}\r\n`);
    this.channel.write(
      `  \x1b[31m${this.i18n.t('general.inactive')}\x1b[0m  ${inactiveDesc}\r\n\r\n`
    );

    this.channel.write(`\x1b[1m${troubleshooting}\x1b[0m\r\n`);
    this.channel.write(`  ${ifTunnelInactive}\r\n`);
    this.channel.write(`  ${sshClientSetup}\r\n`);
    this.channel.write(`  ${portInUse}\r\n`);
    this.channel.write(`  ${firewallSettings}\r\n\r\n`);

    this.channel.write(`\r\n`);
    this.channel.write(`──────────────────────────────────────────────────────────────\r\n`);
    this.channel.write(`${pressCtrlCToReturnMain}\r\n`);
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

    const goodbye = this.i18n.t('general.goodbye');
    this.channel.write(`\n${goodbye}\n`);
    this.channel.end();
    this.connection.end();
  }

  // 辅助方法已在构造函数中通过数据提供者实现
  // 这里移除原有的辅助方法，保持CUIManager的解耦
}
