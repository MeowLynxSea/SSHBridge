// CUI国际化翻译资源
// 确保表格中文本的宽度保持一致，避免布局错误

// 导出获取文本显示宽度的函数，用于正确计算文本居中
export function getDisplayWidth(str: string): number {
  let width = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // 处理代理对（4字节Unicode字符，如emoji）
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const code2 = str.charCodeAt(i + 1);
      if (code2 >= 0xdc00 && code2 <= 0xdfff) {
        // 代理对（如emoji），多数占用2个字符宽度
        width += 2;
        i++; // 跳过下一个代理对字符
        continue;
      }
    }

    // CJK统一表意文字及扩展（中文、日文、韩文等）
    // CJK统一表意文字
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      // CJK扩展A-F区
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df) ||
      (code >= 0x2a700 && code <= 0x2b73f) ||
      (code >= 0x2b740 && code <= 0x2b81f) ||
      (code >= 0x2b820 && code <= 0x2ceaf) ||
      // CJK兼容表意文字
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0x2f800 && code <= 0x2fa1f) ||
      // 日文假名（平假名和片假名）
      (code >= 0x3040 && code <= 0x309f) ||
      (code >= 0x30a0 && code <= 0x30ff) ||
      // 韩文音节
      (code >= 0xac00 && code <= 0xd7af) ||
      // 韩文兼容字母
      (code >= 0x3130 && code <= 0x318f) ||
      (code >= 0xffa0 && code <= 0xffdc) ||
      // 全角符号和字母
      (code >= 0xff00 && code <= 0xffef) ||
      // 中文标点符号
      (code >= 0x3000 && code <= 0x303f) ||
      // 其他亚洲语言符号
      (code >= 0x3200 && code <= 0x32ff) ||
      (code >= 0x3300 && code <= 0x33ff) ||
      // 数学符号（部分为全角）
      (code >= 0x2200 && code <= 0x22ff) ||
      // 盒子绘制字符
      (code >= 0x2500 && code <= 0x257f) ||
      (code >= 0x2580 && code <= 0x259f) ||
      // 几何图形
      (code >= 0x25a0 && code <= 0x25ff) ||
      // 装饰符号
      (code >= 0x2600 && code <= 0x26ff) ||
      // 杂项符号
      (code >= 0x2700 && code <= 0x27bf) ||
      // 箭头符号
      (code >= 0x2190 && code <= 0x21ff) ||
      // 其他技术符号
      (code >= 0x2300 && code <= 0x23ff) ||
      // 光学字符识别
      (code >= 0x2440 && code <= 0x245f)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

// 获取表格中文本的固定宽度版本，确保布局一致性
export function getFixedWidthText(
  text: string,
  width: number,
  align: 'left' | 'center' | 'right' = 'left'
): string {
  // 使用已导出的getDisplayWidth函数计算显示宽度
  const displayWidth = getDisplayWidth(text);

  if (displayWidth >= width) {
    return text;
  }

  const padding = width - displayWidth;

  switch (align) {
    case 'center': {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    }
    case 'right':
      return ' '.repeat(padding) + text;
    case 'left':
    default:
      return text + ' '.repeat(padding);
  }
}

// 扩展String原型，添加便捷的对齐方法（可选）
export interface StringExtensions {
  padStart(width: number, fillString?: string): string;
  padEnd(width: number, fillString?: string): string;
  padCenter(width: number, fillString?: string): string;
}

// 为String添加居中对齐方法（声明合并）
declare global {
  interface String {
    padCenter(width: number, fillString?: string): string;
  }
}

// 为String添加居中对齐方法
export function addStringExtensions(): void {
  if (!String.prototype.padCenter) {
    String.prototype.padCenter = function (
      this: string,
      width: number,
      fillString: string = ' '
    ): string {
      const displayWidth = getDisplayWidth(this.toString());
      if (displayWidth >= width) {
        return this.toString();
      }

      const padding = width - displayWidth;
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;

      const fillLength = fillString.length;
      const leftFillString = fillString.repeat(Math.ceil(leftPad / fillLength)).slice(0, leftPad);
      const rightFillString = fillString
        .repeat(Math.ceil(rightPad / fillLength))
        .slice(0, rightPad);

      return leftFillString + this.toString() + rightFillString;
    };
  }
}

// 便捷的文本对齐函数
export class TextAlign {
  static left(text: string, width: number, fillChar: string = ' '): string {
    const displayWidth = getDisplayWidth(text);
    if (displayWidth >= width) return text;
    return text + fillChar.repeat(width - displayWidth);
  }

  static right(text: string, width: number, fillChar: string = ' '): string {
    const displayWidth = getDisplayWidth(text);
    if (displayWidth >= width) return text;
    return fillChar.repeat(width - displayWidth) + text;
  }

  static center(text: string, width: number, fillChar: string = ' '): string {
    const displayWidth = getDisplayWidth(text);
    if (displayWidth >= width) return text;

    const padding = width - displayWidth;
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;

    return fillChar.repeat(leftPad) + text + fillChar.repeat(rightPad);
  }
}

// 为特定语言的表格列定义固定宽度
export interface TableColumnWidths {
  status: number;
  tunnelName: number;
  externalPort: number;
  duration: number;
  activeConnections: number;
  sessionTraffic: number;
}

// 为不同语言定义的表格列宽度
export const tableColumnWidths: Record<string, TableColumnWidths> = {
  en: {
    status: 11,
    tunnelName: 24,
    externalPort: 13,
    duration: 13,
    activeConnections: 18,
    sessionTraffic: 22,
  },
  zh: {
    status: 11,
    tunnelName: 24,
    externalPort: 11,
    duration: 13,
    activeConnections: 12,
    sessionTraffic: 26,
  },
  es: {
    status: 11,
    tunnelName: 24,
    externalPort: 14,
    duration: 13,
    activeConnections: 18,
    sessionTraffic: 24,
  },
  de: {
    status: 11,
    tunnelName: 24,
    externalPort: 14,
    duration: 13,
    activeConnections: 19,
    sessionTraffic: 23,
  },
  ja: {
    status: 11,
    tunnelName: 24,
    externalPort: 11,
    duration: 13,
    activeConnections: 18,
    sessionTraffic: 26,
  },
  ru: {
    status: 11,
    tunnelName: 24,
    externalPort: 12,
    duration: 17,
    activeConnections: 19,
    sessionTraffic: 18,
  },
  ar: {
    status: 11,
    tunnelName: 24,
    externalPort: 11,
    duration: 13,
    activeConnections: 12,
    sessionTraffic: 26,
  },
  fr: {
    status: 11,
    tunnelName: 24,
    externalPort: 12,
    duration: 13,
    activeConnections: 18,
    sessionTraffic: 24,
  },
};

// CUI国际化翻译数据
export const cuiTranslations = {
  en: {
    welcome: {
      title: 'SSHBridge Management System',
      welcome: 'Welcome to SSHBridge!',
      user: 'User',
      pressAnyKey: 'Press any key to continue...',
    },
    main: {
      title: 'SSHBridge Management System',
      user: 'User',
      time: 'Time',
      selectAction: 'Please select an action:',
      tunnelManagement: '1. Tunnel Management',
      realtimeStatus: '2. Real-time Status Monitoring',
      helpInfo: '3. Help Information',
      exitConnection: '4. Exit Connection',
      pressKeyToSelect: 'Press number key to select: ',
    },
    tunnels: {
      title: 'Tunnel Management',
      noTunnels: 'No configured tunnels',
      tunnelList: 'Configured tunnel list:',
      status: 'Status',
      tunnelName: 'Tunnel Name',
      externalPort: 'External Port',
      otherActiveForwards: 'Other active port forwards:',
      clientToServer: '• Client:{{port}} -> Server:{{addr}}',
      pressCtrlCToReturn: 'Press Ctrl+C to return to main menu',
    },
    status: {
      title: 'SSHBridge Tunnel Status Monitor',
      user: 'User',
      currentSessionOnly: 'Current session tunnels only',
      pressCtrlCToReturnAction: 'Press Ctrl+C to return',
      lastUpdate: 'Last update',
      status: 'Status',
      tunnelName: 'Tunnel Name',
      externalPort: 'External Port',
      duration: 'Duration',
      activeConnections: 'Active Connections',
      sessionTraffic: 'Session Traffic',
      noActiveTunnels: 'No active tunnels in current session',
      currentActiveTunnels: 'Current active tunnels: ',
    },
    help: {
      title: 'Help Information',
      basicOperations: 'Basic Operations:',
      useNumberKeys: '• Use number keys (1-9) to select menu items',
      pressCtrlCToReturnMenu: '• Press Ctrl+C to return to previous menu',
      pressCtrlCToExitMonitor: '• In real-time monitoring, Ctrl+C exits monitoring',
      interfaceDescription: 'Interface Description:',
      tunnelManagementDesc: 'View all your tunnel status and active port forwards',
      realtimeStatusDesc: 'Real-time monitor active tunnel status, traffic and connections',
      helpInfoDesc: 'Display this help information',
      exitConnectionDesc: 'Disconnect from SSHBridge server',
      tunnelStatusDescription: 'Tunnel Status Description:',
      activeDesc: '- Tunnel is currently active and can accept connections (your connection)',
      occupiedDesc: '- Tunnel is occupied by other connections',
      inactiveDesc: '- Tunnel is currently inactive',
      troubleshooting: 'Troubleshooting:',
      ifTunnelInactive: 'If tunnel shows as INACTIVE, please check:',
      sshClientSetup: '• SSH client is correctly configured for port forwarding (ssh -R)',
      portInUse: '• Port is not occupied by other processes',
      firewallSettings: '• Firewall settings allow port forwarding',
      pressCtrlCToReturn: 'Press Ctrl+C to return to main menu',
    },
    general: {
      goodbye: 'Goodbye!',
      active: 'ACTIVE',
      occupied: 'OCCUPIED',
      inactive: 'INACTIVE',
    },
    connection: {
      disconnected: 'Connection will be disconnected.',
      closingIn: 'Connection will close in 3 seconds...',
      tunnelReplaced: 'Tunnel {{tunnelId}} has been replaced by a new connection',
      tunnelReplacedDetails:
        'Your tunnel has been connected from another location. This connection will be closed.',
      remotePortUnauthorized: 'Remote port forwarding {{bindAddr}}:{{bindPort}} is not authorized',
      remotePortUnauthorizedDetails:
        'This port does not match any of your configured tunnels. Configured ports: {{availablePorts}}',
      remotePortFailed: 'Remote port {{bindAddr}}:{{bindPort}} failed to activate',
      remotePortFailedDetails:
        'Tunnel port {{bindPort}} is already online. This tunnel port is already online in this or another connection. Please do not connect the same port repeatedly.',
      remotePortServerError: 'Remote port {{bindAddr}}:{{bindPort}} failed to activate',
      remotePortServerErrorDetails:
        'Tunnel port {{bindPort}} is already online. This tunnel port is already online in this or another connection. Please do not connect the same port repeatedly.',
    },
  },
  zh: {
    welcome: {
      title: 'SSHBridge 管理系统',
      welcome: '欢迎使用 SSHBridge！',
      user: '用户',
      pressAnyKey: '按任意键进入管理界面...',
    },
    main: {
      title: 'SSHBridge 管理系统',
      user: '用户',
      time: '时间',
      selectAction: '请选择操作:',
      tunnelManagement: '1. 隧道管理',
      realtimeStatus: '2. 实时状态监控',
      helpInfo: '3. 帮助信息',
      exitConnection: '4. 退出连接',
      pressKeyToSelect: '请按数字键选择: ',
    },
    tunnels: {
      title: '隧道管理',
      noTunnels: '当前没有配置的隧道',
      tunnelList: '配置的隧道列表 :',
      status: '状态',
      tunnelName: '隧道名称',
      externalPort: '外部端口',
      otherActiveForwards: '其他活动端口转发:',
      clientToServer: '• 客户端:{{port}} -> 服务器:{{addr}}',
      pressCtrlCToReturn: '按 Ctrl+C 返回主菜单',
    },
    status: {
      title: 'SSHBridge 隧道状态监控',
      user: '用户',
      currentSessionOnly: '仅显示当前会话隧道',
      pressCtrlCToReturnAction: '按 Ctrl+C 返回',
      lastUpdate: '最后更新',
      status: '状态',
      tunnelName: '隧道名称',
      externalPort: '外部端口',
      duration: '持续时间',
      activeConnections: '活动连接数',
      sessionTraffic: '会话流量',
      noActiveTunnels: '当前会话无活动隧道',
      currentActiveTunnels: '当前会话活动隧道数: ',
    },
    help: {
      title: '帮助信息',
      basicOperations: '基本操作:',
      useNumberKeys: '• 使用数字键 (1-9) 选择菜单项',
      pressCtrlCToReturnMenu: '• 按 Ctrl+C 返回上一级菜单',
      pressCtrlCToExitMonitor: '• 在实时监控界面中，Ctrl+C 可退出监控',
      interfaceDescription: '界面说明:',
      tunnelManagementDesc: '查看您的所有隧道状态和活动端口转发',
      realtimeStatusDesc: '实时监控活动隧道的状态、流量和连接数',
      helpInfoDesc: '显示此帮助信息',
      exitConnectionDesc: '断开与SSHBridge服务器的连接',
      tunnelStatusDescription: '隧道状态说明:',
      activeDesc: '- 隧道当前活动且可以接受连接（您的连接）',
      occupiedDesc: '- 隧道被其他连接占用',
      inactiveDesc: '- 隧道当前不活动',
      troubleshooting: '故障排除:',
      ifTunnelInactive: '如果隧道显示为INACTIVE，请检查:',
      sshClientSetup: '• SSH客户端是否正确设置了端口转发 (ssh -R)',
      portInUse: '• 端口是否被其他进程占用',
      firewallSettings: '• 防火墙设置是否允许端口转发',
      pressCtrlCToReturn: '按 Ctrl+C 返回主菜单',
    },
    general: {
      goodbye: '再见!',
      active: 'ACTIVE',
      occupied: 'OCCUPIED',
      inactive: 'INACTIVE',
    },
    connection: {
      disconnected: '连接将被断开。',
      closingIn: '连接将在3秒后关闭...',
      tunnelReplaced: '隧道 {{tunnelId}} 已被新连接替换',
      tunnelReplacedDetails: '您的隧道已从另一个位置连接。此连接将被关闭。',
      remotePortUnauthorized: '远程端口转发 {{bindAddr}}:{{bindPort}} 未被授权',
      remotePortUnauthorizedDetails:
        '该端口不匹配您配置的任何隧道。您已配置的端口: {{availablePorts}}',
      remotePortFailed: '远程端口 {{bindAddr}}:{{bindPort}} 启用失败',
      remotePortFailedDetails:
        '隧道端口 {{bindPort}} 已在线。此隧道端口已在此连接或另一个连接中在线。请勿重复连接同一端口。',
      remotePortServerError: '远程端口 {{bindAddr}}:{{bindPort}} 启用失败',
      remotePortServerErrorDetails:
        '隧道端口 {{bindPort}} 已在线。此隧道端口已在此连接或另一个连接中在线。请勿重复连接同一端口。',
    },
  },
  es: {
    welcome: {
      title: 'Sistema de Gestión SSHBridge',
      welcome: '¡Bienvenido a SSHBridge!',
      user: 'Usuario',
      pressAnyKey: 'Presione cualquier tecla para continuar...',
    },
    main: {
      title: 'Sistema de Gestión SSHBridge',
      user: 'Usuario',
      time: 'Hora',
      selectAction: 'Por favor seleccione una acción:',
      tunnelManagement: '1. Gestión de Túneles',
      realtimeStatus: '2. Monitoreo de Estado en Tiempo Real',
      helpInfo: '3. Información de Ayuda',
      exitConnection: '4. Salir de la Conexión',
      pressKeyToSelect: 'Presione la tecla numérica para seleccionar: ',
    },
    tunnels: {
      title: 'Gestión de Túneles',
      noTunnels: 'No hay túneles configurados',
      tunnelList: 'Lista de túneles configurados:',
      status: 'Estado',
      tunnelName: 'Nombre del Túnel',
      externalPort: 'Puerto Externo',
      otherActiveForwards: 'Otros reenvíos de puerto activos:',
      clientToServer: '• Cliente:{{port}} -> Servidor:{{addr}}',
      pressCtrlCToReturn: 'Presione Ctrl+C para volver al menú principal',
    },
    status: {
      title: 'Monitor de Estado de Túneles SSHBridge',
      user: 'Usuario',
      currentSessionOnly: 'Solo túneles de sesión actual',
      pressCtrlCToReturnAction: 'Presione Ctrl+C para volver',
      lastUpdate: 'Última actualización',
      status: 'Estado',
      tunnelName: 'Nombre del Túnel',
      duration: 'Duración',
      activeConnections: 'Conexiones Activas',
      sessionTraffic: 'Tráfico de Sesión',
      noActiveTunnels: 'Sin túneles activos en sesión actual',
      currentActiveTunnels: 'Túneles activos de sesión actual: ',
    },
    help: {
      title: 'Información de Ayuda',
      basicOperations: 'Operaciones Básicas:',
      useNumberKeys: '• Use teclas numéricas (1-9) para seleccionar elementos del menú',
      pressCtrlCToReturnMenu: '• Presione Ctrl+C para volver al menú anterior',
      pressCtrlCToExitMonitor: '• En monitoreo en tiempo real, Ctrl+C sale del monitoreo',
      interfaceDescription: 'Descripción de Interfaz:',
      tunnelManagementDesc: 'Ver estado de todos sus túneles y reenvíos de puerto activos',
      realtimeStatusDesc:
        'Monitorear en tiempo real estado, tráfico y conexiones de túneles activos',
      helpInfoDesc: 'Mostrar esta información de ayuda',
      exitConnectionDesc: 'Desconectarse del servidor SSHBridge',
      tunnelStatusDescription: 'Descripción de Estado del Túnel:',
      activeDesc: '- El túnel está activo y puede aceptar conexiones (su conexión)',
      occupiedDesc: '- El túnel está ocupado por otras conexiones',
      inactiveDesc: '- El túnel está inactivo actualmente',
      troubleshooting: 'Solución de Problemas:',
      ifTunnelInactive: 'Si el túnel muestra INACTIVE, por favor verifique:',
      sshClientSetup:
        '• El cliente SSH está configurado correctamente para reenvío de puerto (ssh -R)',
      portInUse: '• El puerto no está ocupado por otros procesos',
      firewallSettings: '• La configuración del firewall permite reenvío de puerto',
      pressCtrlCToReturn: 'Presione Ctrl+C para volver al menú principal',
    },
    general: {
      goodbye: '¡Adiós!',
      active: 'ACTIVE',
      occupied: 'OCCUPIED',
      inactive: 'INACTIVE',
    },
    connection: {
      disconnected: 'La conexión será desconectada.',
      closingIn: 'La conexión se cerrará en 3 segundos...',
      tunnelReplaced: 'El túnel {{tunnelId}} ha sido reemplazado por una nueva conexión',
      tunnelReplacedDetails:
        'Su túnel ha sido conectado desde otra ubicación. Esta conexión será cerrada.',
      remotePortUnauthorized:
        'El reenvío de puerto remoto {{bindAddr}}:{{bindPort}} no está autorizado',
      remotePortUnauthorizedDetails:
        'Este puerto no coincide con ninguno de sus túneles configurados. Puertos configurados: {{availablePorts}}',
      remotePortFailed: 'El puerto remoto {{bindAddr}}:{{bindPort}} falló al activarse',
      remotePortFailedDetails:
        'El puerto del túnel {{bindPort}} ya está en línea. Este puerto del túnel ya está en línea en esta conexión u otra conexión. Por favor, no conecte el mismo puerto repetidamente.',
      remotePortServerError: 'El puerto remoto {{bindAddr}}:{{bindPort}} falló al activarse',
      remotePortServerErrorDetails:
        'El puerto del túnel {{bindPort}} ya está en línea. Este puerto del túnel ya está en línea en esta conexión u otra conexión. Por favor, no conecte el mismo puerto repetidamente.',
    },
  },
  de: {
    welcome: {
      title: 'SSHBridge Management-System',
      welcome: 'Willkommen bei SSHBridge!',
      user: 'Benutzer',
      pressAnyKey: 'Drücken Sie eine beliebige Taste zum Fortfahren...',
    },
    main: {
      title: 'SSHBridge Management-System',
      user: 'Benutzer',
      time: 'Zeit',
      selectAction: 'Bitte wählen Sie eine Aktion:',
      tunnelManagement: '1. Tunnel-Verwaltung',
      realtimeStatus: '2. Echtzeit-Statusüberwachung',
      helpInfo: '3. Hilfe-Informationen',
      exitConnection: '4. Verbindung beenden',
      pressKeyToSelect: 'Drücken Sie die Nummerntaste zur Auswahl: ',
    },
    tunnels: {
      title: 'Tunnel-Verwaltung',
      noTunnels: 'Keine konfigurierten Tunnel',
      tunnelList: 'Liste der konfigurierten Tunnel:',
      status: 'Status',
      tunnelName: 'Tunnel-Name',
      externalPort: 'Puerto Externo',
      otherActiveForwards: 'Andere aktive Port-Forwards:',
      clientToServer: '• Client:{{port}} -> Server:{{addr}}',
      pressCtrlCToReturn: 'Drücken Sie Strg+C zur Rückkehr zum Hauptmenü',
    },
    status: {
      title: 'SSHBridge Tunnel-Status-Monitor',
      user: 'Benutzer',
      currentSessionOnly: 'Nur aktuelle Sitzungs-Tunnel',
      pressCtrlCToReturnAction: 'Drücken Sie Strg+C zum Zurückkehren',
      lastUpdate: 'Letzte Aktualisierung',
      status: 'Status',
      tunnelName: 'Tunnel-Name',
      duration: 'Dauer',
      activeConnections: 'Aktive Verbindungen',
      sessionTraffic: 'Sitzungs-Traffic',
      noActiveTunnels: 'Keine aktiven Tunnel in aktueller Sitzung',
      currentActiveTunnels: 'Aktive Tunnel der aktuellen Sitzung: ',
    },
    help: {
      title: 'Hilfe-Informationen',
      basicOperations: 'Grundlegende Operationen:',
      useNumberKeys: '• Nummerntasten (1-9) verwenden, um Menüelemente auszuwählen',
      pressCtrlCToReturnMenu: '• Strg+C drücken, um zum vorherigen Menü zurückzukehren',
      pressCtrlCToExitMonitor: '• In Echtzeitüberwachung beendet Strg+C die Überwachung',
      interfaceDescription: 'Interface-Beschreibung:',
      tunnelManagementDesc: 'Status aller Tunnel und aktiven Port-Forwards anzeigen',
      realtimeStatusDesc: 'Echtzeitüberwachung von Status, Traffic und Verbindungen aktiver Tunnel',
      helpInfoDesc: 'Diese Hilfe-Informationen anzeigen',
      exitConnectionDesc: 'Vom SSHBridge-Server trennen',
      tunnelStatusDescription: 'Tunnel-Status-Beschreibung:',
      activeDesc: '- Tunnel ist aktiv und kann Verbindungen annehmen (Ihre Verbindung)',
      occupiedDesc: '- Tunnel wird von anderen Verbindungen belegt',
      inactiveDesc: '- Tunnel ist derzeit inaktiv',
      troubleshooting: 'Fehlerbehebung:',
      ifTunnelInactive: 'Wenn Tunnel INACTIVE anzeigt, überprüfen Sie bitte:',
      sshClientSetup: '• SSH-Client korrekt für Port-Forwarding konfiguriert (ssh -R)',
      portInUse: '• Port nicht von anderen Prozessen belegt',
      firewallSettings: '• Firewall-Einstellungen erlauben Port-Forwarding',
      pressCtrlCToReturn: 'Drücken Sie Strg+C zur Rückkehr zum Hauptmenü',
    },
    general: {
      goodbye: 'Auf Wiedersehen!',
      active: 'ACTIVE',
      occupied: 'OCCUPIED',
      inactive: 'INACTIVE',
    },
    connection: {
      disconnected: 'Verbindung wird getrennt.',
      closingIn: 'Verbindung wird in 3 Sekunden geschlossen...',
      tunnelReplaced: 'Tunnel {{tunnelId}} wurde durch eine neue Verbindung ersetzt',
      tunnelReplacedDetails:
        'Ihr Tunnel wurde von einem anderen Ort aus verbunden. Diese Verbindung wird geschlossen.',
      remotePortUnauthorized:
        'Remote-Port-Forwarding {{bindAddr}}:{{bindPort}} ist nicht autorisiert',
      remotePortUnauthorizedDetails:
        'Dieser Port stimmt mit keinem Ihrer konfigurierten Tunnel überein. Konfigurierte Ports: {{availablePorts}}',
      remotePortFailed: 'Remote-Port {{bindAddr}}:{{bindPort}} konnte nicht aktiviert werden',
      remotePortFailedDetails:
        'Tunnel-Port {{bindPort}} ist bereits online. Dieser Tunnel-Port ist bereits in dieser oder einer anderen Verbindung online. Bitte verbinden Sie nicht mehrfach denselben Port.',
      remotePortServerError: 'Remote-Port {{bindAddr}}:{{bindPort}} konnte nicht aktiviert werden',
      remotePortServerErrorDetails:
        'Tunnel-Port {{bindPort}} ist bereits online. Dieser Tunnel-Port ist bereits in dieser oder einer anderen Verbindung online. Bitte verbinden Sie nicht mehrfach denselben Port.',
    },
  },
  ja: {
    welcome: {
      title: 'SSHBridge管理システム',
      welcome: 'SSHBridgeへようこそ！',
      user: 'ユーザー',
      pressAnyKey: '何かキーを押して続行...',
    },
    main: {
      title: 'SSHBridge管理システム',
      user: 'ユーザー',
      time: '時間',
      selectAction: '操作を選択してください:',
      tunnelManagement: '1. トンネル管理',
      realtimeStatus: '2. リアルタイム状態監視',
      helpInfo: '3. ヘルプ情報',
      exitConnection: '4. 接続終了',
      pressKeyToSelect: '数字キーで選択: ',
    },
    tunnels: {
      title: 'トンネル管理',
      noTunnels: '設定されたトンネルがありません',
      tunnelList: '設定されたトンネルリスト:',
      status: '状態',
      tunnelName: 'トンネル名',
      externalPort: '外部ポート',
      otherActiveForwards: 'その他のアクティブなポート転送:',
      clientToServer: '• クライアント:{{port}} -> サーバー:{{addr}}',
      pressCtrlCToReturn: 'Ctrl+Cでメインメニューに戻る',
    },
    status: {
      title: 'SSHBridgeトンネル状態モニター',
      user: 'ユーザー',
      currentSessionOnly: '現在のセッショントンネルのみ',
      pressCtrlCToReturnAction: 'Ctrl+Cで戻る',
      lastUpdate: '最終更新',
      status: '状態',
      tunnelName: 'トンネル名',
      externalPort: '外部ポート',
      duration: '継続時間',
      activeConnections: 'アクティブ接続数',
      sessionTraffic: 'セッショントラフィック',
      noActiveTunnels: '現在のセッションにアクティブなトンネルがありません',
      currentActiveTunnels: '現在のセッションアクティブトンネル数: ',
    },
    help: {
      title: 'ヘルプ情報',
      basicOperations: '基本操作:',
      useNumberKeys: '• 数字キー(1-9)でメニュー項目を選択',
      pressCtrlCToReturnMenu: '• Ctrl+Cで前のメニューに戻る',
      pressCtrlCToExitMonitor: '• リアルタイム監視でCtrl+Cは監視を終了',
      interfaceDescription: 'インターフェース説明:',
      tunnelManagementDesc: 'すべてのトンネル状態とアクティブなポート転送を表示',
      realtimeStatusDesc: 'アクティブなトンネルの状態、トラフィック、接続をリアルタイム監視',
      helpInfoDesc: 'このヘルプ情報を表示',
      exitConnectionDesc: 'SSHBridgeサーバーから切断',
      tunnelStatusDescription: 'トンネル状態説明:',
      activeDesc: '- トンネルがアクティブで接続を受け入れ可能（あなたの接続）',
      occupiedDesc: '- トンネルが他の接続に占有されています',
      inactiveDesc: '- トンネルが現在非アクティブ',
      troubleshooting: 'トラブルシューティング:',
      ifTunnelInactive: 'トンネルがINACTIVEの場合、確認してください:',
      sshClientSetup: '• SSHクライアントがポート転送用に正しく設定されている (ssh -R)',
      portInUse: '• ポートが他のプロセスに占有されていない',
      firewallSettings: '• ファイアウォール設定がポート転送を許可している',
      pressCtrlCToReturn: 'Ctrl+Cでメインメニューに戻る',
    },
    general: {
      goodbye: 'さようなら!',
      active: 'ACTIVE',
      occupied: 'OCCUPIED',
      inactive: 'INACTIVE',
    },
    connection: {
      disconnected: '接続が切断されます。',
      closingIn: '3秒後に接続が閉じられます...',
      tunnelReplaced: 'トンネル {{tunnelId}} が新しい接続に置き換えられました',
      tunnelReplacedDetails:
        'あなたのトンネルが別の場所から接続されました。この接続は閉じられます。',
      remotePortUnauthorized: 'リモートポート転送 {{bindAddr}}:{{bindPort}} は認可されていません',
      remotePortUnauthorizedDetails:
        'このポートは設定されたトンネルのいずれとも一致しません。設定されたポート: {{availablePorts}}',
      remotePortFailed: 'リモートポート {{bindAddr}}:{{bindPort}} の有効化に失敗しました',
      remotePortFailedDetails:
        'トンネルポート {{bindPort}} は既にオンラインです。このトンネルポートは既にこの接続または別の接続でオンラインです。同じポートを繰り返し接続しないでください。',
      remotePortServerError: 'リモートポート {{bindAddr}}:{{bindPort}} の有効化に失敗しました',
      remotePortServerErrorDetails:
        'トンネルポート {{bindPort}} は既にオンラインです。このトンネルポートは既にこの接続または別の接続でオンラインです。同じポートを繰り返し接続しないでください。',
    },
  },
  ru: {
    welcome: {
      title: 'Система Управления SSHBridge',
      welcome: 'Добро пожаловать в SSHBridge!',
      user: 'Пользователь',
      pressAnyKey: 'Нажмите любую клавишу для продолжения...',
    },
    main: {
      title: 'Система Управления SSHBridge',
      user: 'Пользователь',
      time: 'Время',
      selectAction: 'Пожалуйста, выберите действие:',
      tunnelManagement: '1. Управление Туннелями',
      realtimeStatus: '2. Мониторинг Статуса в Реальном Времени',
      helpInfo: '3. Информация Помощи',
      exitConnection: '4. Выйти из Соединения',
      pressKeyToSelect: 'Нажмите цифровую клавишу для выбора: ',
    },
    tunnels: {
      title: 'Управление Туннелями',
      noTunnels: 'Нет настроенных туннелей',
      tunnelList: 'Список настроенных туннелей:',
      status: 'Статус',
      tunnelName: 'Имя Туннеля',
      externalPort: 'Внешний Порт',
      otherActiveForwards: 'Другие активные переадресации портов:',
      clientToServer: '• Клиент:{{port}} -> Сервер:{{addr}}',
      pressCtrlCToReturn: 'Нажмите Ctrl+C для возврата в главное меню',
    },
    status: {
      title: 'Монитор Статуса Туннелей SSHBridge',
      user: 'Пользователь',
      currentSessionOnly: 'Только туннели текущей сессии',
      pressCtrlCToReturnAction: 'Нажмите Ctrl+C для возврата',
      lastUpdate: 'Последнее обновление',
      status: 'Статус',
      tunnelName: 'Имя Туннеля',
      externalPort: 'Внешний Порт',
      duration: 'Продолжительность',
      activeConnections: 'Активные Соединения',
      sessionTraffic: 'Трафик Сессии',
      noActiveTunnels: 'Нет активных туннелей в текущей сессии',
      currentActiveTunnels: 'Активные туннели текущей сессии: ',
    },
    help: {
      title: 'Информация Помощи',
      basicOperations: 'Основные Операции:',
      useNumberKeys: '• Используйте цифровые клавиши (1-9) для выбора пунктов меню',
      pressCtrlCToReturnMenu: '• Нажмите Ctrl+C для возврата в предыдущее меню',
      pressCtrlCToExitMonitor: '• В мониторинге в реальном времени Ctrl+C выходит из мониторинга',
      interfaceDescription: 'Описание Интерфейса:',
      tunnelManagementDesc: 'Просмотр статуса всех ваших туннелей и активных переадресаций портов',
      realtimeStatusDesc:
        'Мониторинг в реальном времени статуса, трафика и соединений активных туннелей',
      helpInfoDesc: 'Отобразить эту информацию помощи',
      exitConnectionDesc: 'Отключиться от сервера SSHBridge',
      tunnelStatusDescription: 'Описание Статуса Туннеля:',
      activeDesc: '- Туннель активен и может принимать соединения (ваше соединение)',
      occupiedDesc: '- Туннель занят другими соединениями',
      inactiveDesc: '- Туннель в настоящее время неактивен',
      troubleshooting: 'Устранение Неполадок:',
      ifTunnelInactive: 'Если туннель показывает INACTIVE, пожалуйста, проверьте:',
      sshClientSetup: '• SSH-клиент правильно настроен для переадресации портов (ssh -R)',
      portInUse: '• Порт не занят другими процессами',
      firewallSettings: '• Настройки брандмауэра разрешают переадресацию портов',
      pressCtrlCToReturn: 'Нажмите Ctrl+C для возврата в главное меню',
    },
    general: {
      goodbye: 'До свидания!',
      active: 'ACTIVE',
      occupied: 'OCCUPIED',
      inactive: 'INACTIVE',
    },
    connection: {
      disconnected: 'Соединение будет разорвано.',
      closingIn: 'Соединение будет закрыто через 3 секунды...',
      tunnelReplaced: 'Туннель {{tunnelId}} был заменен новым соединением',
      tunnelReplacedDetails:
        'Ваш туннель был подключен из другого места. Это соединение будет закрыто.',
      remotePortUnauthorized:
        'Удаленное перенаправление порта {{bindAddr}}:{{bindPort}} не авторизовано',
      remotePortUnauthorizedDetails:
        'Этот порт не соответствует ни одному из ваших настроенных туннелей. Настроенные порты: {{availablePorts}}',
      remotePortFailed: 'Удаленный порт {{bindAddr}}:{{bindPort}} не удалось активировать',
      remotePortFailedDetails:
        'Порт туннеля {{bindPort}} уже онлайн. Этот порт туннеля уже онлайн в этом или другом соединении. Пожалуйста, не подключайте один и тот же порт многократно.',
      remotePortServerError: 'Удаленный порт {{bindAddr}}:{{bindPort}} не удалось активировать',
      remotePortServerErrorDetails:
        'Порт туннеля {{bindPort}} уже онлайн. Этот порт туннеля уже онлайн в этом или другом соединении. Пожалуйста, не подключайте один и тот же порт многократно.',
    },
  },
  ar: {
    welcome: {
      title: 'نظام إدارة SSHBridge',
      welcome: 'مرحباً بك في SSHBridge!',
      user: 'المستخدم',
      pressAnyKey: 'اضغط على أي مفتاح للمتابعة...',
    },
    main: {
      title: 'نظام إدارة SSHBridge',
      user: 'المستخدم',
      time: 'الوقت',
      selectAction: 'يرجى اختيار إجراء:',
      tunnelManagement: '1. إدارة الأنفاق',
      realtimeStatus: '2. مراقبة الحالة في الوقت الفعلي',
      helpInfo: '3. معلومات المساعدة',
      exitConnection: '4. خروج الاتصال',
      pressKeyToSelect: 'اضغط على المفتاح الرقمي للاختيار: ',
    },
    tunnels: {
      title: 'إدارة الأنفاق',
      noTunnels: 'لا توجد أنفاق مكونة',
      tunnelList: 'قائمة الأنفاق المكونة:',
      status: 'الحالة',
      tunnelName: 'اسم النفق',
      externalPort: 'المنفذ الخارجي',
      otherActiveForwards: 'عمليات إعادة توجيه المنافذ النشطة الأخرى:',
      clientToServer: '• العميل:{{port}} -> الخادم:{{addr}}',
      pressCtrlCToReturn: 'اضغط Ctrl+C للعودة إلى القائمة الرئيسية',
    },
    status: {
      title: 'شاشة مراقبة حالة أنفاق SSHBridge',
      user: 'المستخدم',
      currentSessionOnly: 'أنفاق الجلسة الحالية فقط',
      pressCtrlCToReturnAction: 'اضغط Ctrl+C للعودة',
      lastUpdate: 'آخر تحديث',
      status: 'الحالة',
      tunnelName: 'اسم النفق',
      externalPort: 'المنفذ الخارجي',
      duration: 'المدة',
      activeConnections: 'الاتصالات النشطة',
      sessionTraffic: 'حركة الجلسة',
      noActiveTunnels: 'لا توجد أنفاق نشطة في الجلسة الحالية',
      currentActiveTunnels: 'عدد الأنفاق النشطة في الجلسة الحالية: ',
    },
    help: {
      title: 'معلومات المساعدة',
      basicOperations: 'العمليات الأساسية:',
      useNumberKeys: '• استخدم المفاتيح الرقمية (1-9) لاختيار عناصر القائمة',
      pressCtrlCToReturnMenu: '• اضغط Ctrl+C للعودة إلى القائمة السابقة',
      pressCtrlCToExitMonitor: '• في مراقبة الوقت الفعلي، Ctrl+C يخرج من المراقبة',
      interfaceDescription: 'وصف الواجهة:',
      tunnelManagementDesc: 'عرض حالة جميع الأنفاق وإعادة توجيه المنافذ النشطة',
      realtimeStatusDesc: 'مراقبة حالة الأنفاق النشطة وحركة المرور والاتصالات في الوقت الفعلي',
      helpInfoDesc: 'عرض معلومات المساعدة هذه',
      exitConnectionDesc: 'قطع الاتصال من خادم SSHBridge',
      tunnelStatusDescription: 'وصف حالة النفق:',
      activeDesc: '- النفق نشط حالياً ويمكنه قبول الاتصالات (اتصالك)',
      occupiedDesc: '- النفق مشغول باتصالات أخرى',
      inactiveDesc: '- النفق غير نشط حالياً',
      troubleshooting: 'استكشاف الأخطاء وإصلاحها:',
      ifTunnelInactive: 'إذا كان النفق يظهر INACTIVE، يرجى التحقق:',
      sshClientSetup: '• العميل SSH مكون بشكل صحيح لإعادة توجيه المنفذ (ssh -R)',
      portInUse: '• المنفذ غير مشغول بعمليات أخرى',
      firewallSettings: '• إعدادات جدار الحماية تسمح بإعادة توجيه المنفذ',
      pressCtrlCToReturn: 'اضغط Ctrl+C للعودة إلى القائمة الرئيسية',
    },
    general: {
      goodbye: 'وداعا!',
      active: 'ACTIVE',
      occupied: 'OCCUPIED',
      inactive: 'INACTIVE',
    },
    connection: {
      disconnected: 'سيتم قطع الاتصال.',
      closingIn: 'سيتم إغلاق الاتصال خلال 3 ثوانٍ...',
      tunnelReplaced: 'تم استبدال النفق {{tunnelId}} باتصال جديد',
      tunnelReplacedDetails: 'تم توصيل نفقك من موقع آخر. سيتم إغلاق هذا الاتصال.',
      remotePortUnauthorized: 'إعادة توجيه المنفذ البعيد {{bindAddr}}:{{bindPort}} غير مصرح بها',
      remotePortUnauthorizedDetails:
        'هذا المنفذ لا يطابق أي من الأنفاق المكونة الخاصة بك. المنافذ المكونة: {{availablePorts}}',
      remotePortFailed: 'فشل تنشيط المنفذ البعيد {{bindAddr}}:{{bindPort}}',
      remotePortFailedDetails:
        'منفذ النفق {{bindPort}} متصل بالفعل. منفذ النفق هذا متصل بالفعل في هذا الاتصال أو اتصال آخر. يرجى عدم توصيل نفس المنفذ بشكل متكرر.',
      remotePortServerError: 'فشل تنشيط المنفذ البعيد {{bindAddr}}:{{bindPort}}',
      remotePortServerErrorDetails:
        'منفذ النفق {{bindPort}} متصل بالفعل. منفذ النفق هذا متصل بالفعل في هذا الاتصال أو اتصال آخر. يرجى عدم توصيل نفس المنفذ بشكل متكرر.',
    },
  },
  fr: {
    welcome: {
      title: 'Système de Gestion SSHBridge',
      welcome: 'Bienvenue dans SSHBridge!',
      user: 'Utilisateur',
      pressAnyKey: 'Appuyez sur une touche pour continuer...',
    },
    main: {
      title: 'Système de Gestion SSHBridge',
      user: 'Utilisateur',
      time: 'Heure',
      selectAction: 'Veuillez sélectionner une action:',
      tunnelManagement: '1. Gestion des Tunnels',
      realtimeStatus: '2. Surveillance de Statut en Temps Réel',
      helpInfo: "3. Informations d'Aide",
      exitConnection: '4. Quitter la Connexion',
      pressKeyToSelect: 'Appuyez sur la touche numérique pour sélectionner: ',
    },
    tunnels: {
      title: 'Gestion des Tunnels',
      noTunnels: 'Aucun tunnel configuré',
      tunnelList: 'Liste des tunnels configurés:',
      status: 'Statut',
      tunnelName: 'Nom du Tunnel',
      externalPort: 'Port Externe',
      otherActiveForwards: 'Autres transferts de port actifs:',
      clientToServer: '• Client:{{port}} -> Serveur:{{addr}}',
      pressCtrlCToReturn: 'Appuyez sur Ctrl+C pour revenir au menu principal',
    },
    status: {
      title: 'Moniteur de Statut des Tunnels SSHBridge',
      user: 'Utilisateur',
      currentSessionOnly: 'Tunnels de session actuelle uniquement',
      pressCtrlCToReturnAction: 'Appuyez sur Ctrl+C pour revenir',
      lastUpdate: 'Dernière mise à jour',
      status: 'Statut',
      tunnelName: 'Nom du Tunnel',
      externalPort: 'Port Externe',
      duration: 'Durée',
      activeConnections: 'Connexions Actives',
      sessionTraffic: 'Traffic de Session',
      noActiveTunnels: 'Aucun tunnel actif dans la session actuelle',
      currentActiveTunnels: 'Tunnels actifs de la session actuelle: ',
    },
    help: {
      title: "Informations d'Aide",
      basicOperations: 'Opérations de Base:',
      useNumberKeys:
        '• Utilisez les touches numériques (1-9) pour sélectionner les éléments de menu',
      pressCtrlCToReturnMenu: '• Appuyez sur Ctrl+C pour revenir au menu précédent',
      pressCtrlCToExitMonitor:
        '• Dans la surveillance en temps réel, Ctrl+C quitte la surveillance',
      interfaceDescription: "Description de l'Interface:",
      tunnelManagementDesc: 'Voir tous vos statuts de tunnel et transferts de port actifs',
      realtimeStatusDesc:
        'Surveiller en temps réel le statut, le trafic et les connexions des tunnels actifs',
      helpInfoDesc: "Afficher ces informations d'aide",
      exitConnectionDesc: 'Se déconnecter du serveur SSHBridge',
      tunnelStatusDescription: 'Description du Statut du Tunnel:',
      activeDesc:
        '- Le tunnel est actuellement actif et peut accepter des connexions (votre connexion)',
      occupiedDesc: "- Le tunnel est occupé par d'autres connexions",
      inactiveDesc: '- Le tunnel est actuellement inactif',
      troubleshooting: 'Dépannage:',
      ifTunnelInactive: 'Si le tunnel affiche INACTIVE, veuillez vérifier:',
      sshClientSetup:
        '• Le client SSH est correctement configuré pour le transfert de port (ssh -R)',
      portInUse: "• Le port n'est pas occupé par d'autres processus",
      firewallSettings: '• Les paramètres du pare-feu autorisent le transfert de port',
      pressCtrlCToReturn: 'Appuyez sur Ctrl+C pour revenir au menu principal',
    },
    general: {
      goodbye: 'Au revoir!',
      active: 'ACTIVE',
      occupied: 'OCCUPIED',
      inactive: 'INACTIVE',
    },
    connection: {
      disconnected: 'La connexion sera déconnectée.',
      closingIn: 'La connexion se fermera dans 3 secondes...',
      tunnelReplaced: 'Le tunnel {{tunnelId}} a été remplacé par une nouvelle connexion',
      tunnelReplacedDetails:
        'Votre tunnel a été connecté à partir d un autre emplacement. Cette connexion sera fermée.',
      remotePortUnauthorized:
        'Le transfert de port distant {{bindAddr}}:{{bindPort}} n est pas autorisé',
      remotePortUnauthorizedDetails:
        'Ce port ne correspond à aucun de vos tunnels configurés. Ports configurés: {{availablePorts}}',
      remotePortFailed: 'Le port distant {{bindAddr}}:{{bindPort}} a échoué à s activer',
      remotePortFailedDetails:
        'Le port du tunnel {{bindPort}} est déjà en ligne. Ce port du tunnel est déjà en ligne dans cette connexion ou une autre connexion. Veuillez ne pas connecter plusieurs fois le même port.',
      remotePortServerError: 'Le port distant {{bindAddr}}:{{bindPort}} a échoué à s activer',
      remotePortServerErrorDetails:
        'Le port du tunnel {{bindPort}} est déjà en ligne. Ce port du tunnel est déjà en ligne dans cette connexion ou une autre connexion. Veuillez ne pas connecter plusieurs fois le même port.',
    },
  },
};
