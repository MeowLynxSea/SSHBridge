import { Database } from '../database';
import {
  cuiTranslations,
  getFixedWidthText,
  tableColumnWidths,
  TableColumnWidths,
  addStringExtensions,
} from './i18n';

export type Language = 'en' | 'zh' | 'es' | 'de' | 'ja' | 'ru' | 'ar' | 'fr';

export class CUII18n {
  private currentLanguage: Language = 'en';
  private userId: number;
  private database: Database;
  private columnWidths: TableColumnWidths;

  constructor(userId: number, database: Database) {
    this.userId = userId;
    this.database = database;
    this.columnWidths = tableColumnWidths[this.currentLanguage];

    // 初始化String扩展方法
    addStringExtensions();
  }

  /**
   * 初始化语言设置
   * 从数据库获取用户的语言偏好，如果未设置则使用默认值
   */
  async init(): Promise<void> {
    try {
      const userSettings = await this.database.getUserSettings(this.userId);
      const userLanguage = userSettings?.language as Language;

      if (userLanguage && cuiTranslations[userLanguage]) {
        this.currentLanguage = userLanguage;
      } else {
        // 如果用户没有设置语言，尝试检测系统语言
        const systemLanguage = this.detectSystemLanguage();
        this.currentLanguage = systemLanguage;
      }

      this.columnWidths = tableColumnWidths[this.currentLanguage];
    } catch (error) {
      console.error('Failed to initialize CUI i18n:', error);
      // 使用默认语言
      this.currentLanguage = 'en';
      this.columnWidths = tableColumnWidths[this.currentLanguage];
    }
  }

  /**
   * 检测系统语言
   */
  private detectSystemLanguage(): Language {
    // 尝试从环境变量获取语言设置
    const envLang = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || '';
    const langCode = envLang.split('.')[0].split('_')[0].toLowerCase();

    // 映射常见的语言代码
    const langMap: Record<string, Language> = {
      en: 'en',
      zh: 'zh',
      es: 'es',
      de: 'de',
      ja: 'ja',
      ru: 'ru',
      ar: 'ar',
      fr: 'fr',
    };

    return langMap[langCode] || 'en';
  }

  /**
   * 获取当前语言
   */
  getCurrentLanguage(): Language {
    return this.currentLanguage;
  }

  /**
   * 设置语言
   */
  setLanguage(language: Language): void {
    if (cuiTranslations[language]) {
      this.currentLanguage = language;
      this.columnWidths = tableColumnWidths[this.currentLanguage];
    }
  }

  /**
   * 获取翻译文本
   */
  t(path: string, params?: Record<string, string | number>): string {
    const keys = path.split('.');
    let translation: unknown = cuiTranslations[this.currentLanguage];

    for (const key of keys) {
      if (translation && typeof translation === 'object' && key in translation) {
        translation = (translation as Record<string, unknown>)[key];
      } else {
        // 如果当前语言没有该翻译，尝试使用英文作为后备
        translation = cuiTranslations.en;
        for (const fallbackKey of keys) {
          if (translation && typeof translation === 'object' && fallbackKey in translation) {
            translation = (translation as Record<string, unknown>)[fallbackKey];
          } else {
            return path; // 如果英文也没有，返回原始路径
          }
        }
        break;
      }
    }

    if (typeof translation !== 'string') {
      return path;
    }

    // 替换参数
    if (params) {
      let result = translation;
      for (const [key, value] of Object.entries(params)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }
      return result;
    }

    return translation;
  }

  /**
   * 获取固定宽度的表格文本，确保布局一致性
   */
  getFixedWidthText(
    section: keyof TableColumnWidths,
    text: string,
    align: 'left' | 'center' | 'right' = 'left'
  ): string {
    const width = this.columnWidths[section];
    return getFixedWidthText(text, width, align);
  }

  /**
   * 获取左对齐的表格文本
   */
  getLeftAlignedText(section: keyof TableColumnWidths, text: string): string {
    return this.getFixedWidthText(section, text, 'left');
  }

  /**
   * 获取居中对齐的表格文本
   */
  getCenterAlignedText(section: keyof TableColumnWidths, text: string): string {
    return this.getFixedWidthText(section, text, 'center');
  }

  /**
   * 获取右对齐的表格文本
   */
  getRightAlignedText(section: keyof TableColumnWidths, text: string): string {
    return this.getFixedWidthText(section, text, 'right');
  }

  /**
   * 获取状态文本，带有颜色和固定宽度
   */
  getStatusDisplay(status: string): string {
    const statusText = this.t(status) || status;
    return this.getFixedWidthText('status', statusText);
  }

  /**
   * 获取表格边框和分隔符
   */
  getTableBorders(): {
    top: string;
    header: string;
    middle: string;
    bottom: string;
  } {
    const { status, tunnelName, externalPort, duration, activeConnections, sessionTraffic } =
      this.columnWidths;

    const top = `┌─${'─'.repeat(status)}─┬─${'─'.repeat(tunnelName)}─┬─${'─'.repeat(externalPort)}─┬─${'─'.repeat(duration)}─┬─${'─'.repeat(activeConnections)}─┬─${'─'.repeat(sessionTraffic)}─┐`;
    const header = `│ ${this.getFixedWidthText('status', this.t('status.status'), 'center')} │ ${this.getFixedWidthText('tunnelName', this.t('status.tunnelName'), 'center')} │ ${this.getFixedWidthText('externalPort', this.t('status.externalPort'), 'center')} │ ${this.getFixedWidthText('duration', this.t('status.duration'), 'center')} │ ${this.getFixedWidthText('activeConnections', this.t('status.activeConnections'), 'center')} │ ${this.getFixedWidthText('sessionTraffic', this.t('status.sessionTraffic'), 'center')} │`;
    const middle = `├─${'─'.repeat(status)}─┼─${'─'.repeat(tunnelName)}─┼─${'─'.repeat(externalPort)}─┼─${'─'.repeat(duration)}─┼─${'─'.repeat(activeConnections)}─┼─${'─'.repeat(sessionTraffic)}─┤`;
    const bottom = `└─${'─'.repeat(status)}─┴─${'─'.repeat(tunnelName)}─┴─${'─'.repeat(externalPort)}─┴─${'─'.repeat(duration)}─┴─${'─'.repeat(activeConnections)}─┴─${'─'.repeat(sessionTraffic)}─┘`;

    return { top, header, middle, bottom };
  }

  /**
   * 获取隧道列表表格的边框和分隔符
   */
  getTunnelsTableBorders(): {
    top: string;
    header: string;
    middle: string;
    bottom: string;
  } {
    const { status, tunnelName, externalPort } = this.columnWidths;

    const top = `┌─${'─'.repeat(status)}─┬─${'─'.repeat(tunnelName)}─┬─${'─'.repeat(externalPort)}─┐`;
    const header = `│ ${this.getFixedWidthText('status', this.t('tunnels.status'), 'center')} │ ${this.getFixedWidthText('tunnelName', this.t('tunnels.tunnelName'), 'center')} │ ${this.getFixedWidthText('externalPort', this.t('tunnels.externalPort'), 'center')} │`;
    const middle = `├─${'─'.repeat(status)}─┼─${'─'.repeat(tunnelName)}─┼─${'─'.repeat(externalPort)}─┤`;
    const bottom = `└─${'─'.repeat(status)}─┴─${'─'.repeat(tunnelName)}─┴─${'─'.repeat(externalPort)}─┘`;

    return { top, header, middle, bottom };
  }
}
