/**
 * 统一时间处理工具
 * 所有时间相关操作都应使用UTC时间，避免时区混淆
 */

/**
 * 将数据库时间字符串（UTC）转换为Date对象
 * @param dateString 数据库中的时间字符串
 * @returns Date对象（UTC）
 */
export function parseDatabaseDate(dateString: string): Date {
  // 检查是否为有效日期字符串
  if (!dateString || dateString === 'Invalid Date') {
    // 返回当前时间作为默认值
    return new Date();
  }

  const trimmed = dateString.trim();

  // ISO (or ISO-like) strings parse directly.
  if (trimmed.includes('T')) {
    const iso = new Date(trimmed);
    if (!isNaN(iso.getTime())) {
      return iso;
    }
  }

  // SQLite的CURRENT_TIMESTAMP通常是 "YYYY-MM-DD HH:MM:SS"（UTC）
  const normalized = trimmed.replace(' ', 'T');
  const date = new Date(normalized.endsWith('Z') ? normalized : normalized + 'Z');

  // 检查日期是否有效
  if (isNaN(date.getTime())) {
    return new Date();
  }

  return date;
}

/**
 * 将Date对象格式化为数据库存储格式（ISO字符串）
 * @param date Date对象
 * @returns ISO字符串（UTC）
 */
export function formatForDatabase(date: Date = new Date()): string {
  return date.toISOString();
}

/**
 * 格式化时间为本地显示字符串
 * @param dateString 数据库中的时间字符串（ISO格式）
 * @param locale 本地化设置，默认为系统设置
 * @returns 本地化时间字符串
 */
export function formatForDisplay(dateString: string, locale?: string): string {
  // 如果已经是ISO字符串，直接使用
  if (dateString.includes('T') && dateString.includes('Z')) {
    return new Date(dateString).toLocaleString(locale);
  }
  // 如果不是，添加Z后缀表示UTC
  return new Date(dateString + 'Z').toLocaleString(locale);
}

/**
 * 计算两个时间点之间的持续时间
 * @param startTime 开始时间（数据库字符串或ISO字符串）
 * @param endTime 结束时间（默认为当前时间）
 * @returns 持续时间描述
 */
export function formatDuration(startTime: string, endTime: Date = new Date()): string {
  let startTimeMs: number;

  // 如果已经是ISO字符串，直接使用
  if (startTime.includes('T') && startTime.includes('Z')) {
    startTimeMs = new Date(startTime).getTime();
  } else {
    // 如果不是，使用parseDatabaseDate
    startTimeMs = parseDatabaseDate(startTime).getTime();
  }

  const diffMs = endTime.getTime() - startTimeMs;

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * 创建未来时间点
 * @param hoursFromNow 从现在开始的小时数
 * @returns 未来的时间（ISO字符串）
 */
export function createFutureTime(hoursFromNow: number): string {
  const futureTime = new Date();
  futureTime.setHours(futureTime.getHours() + hoursFromNow);
  return futureTime.toISOString();
}

/**
 * 获取当前UTC时间戳（ISO字符串）
 * @returns 当前时间的ISO字符串
 */
export function getCurrentTime(): string {
  return new Date().toISOString();
}
