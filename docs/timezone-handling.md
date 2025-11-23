# 时区处理策略

SSHBridge项目使用统一的时间处理策略，确保前端、后端和SSH服务器之间时间显示的一致性。

## 核心原则

1. **数据库存储**：所有时间以UTC格式存储在SQLite数据库中
2. **时间传输**：使用ISO 8601字符串格式传输时间数据（包含'Z'后缀表示UTC）
3. **前端显示**：根据用户本地时区显示时间
4. **数据类型**：数据库接口和API中使用字符串类型存储ISO格式时间，避免Date对象的序列化问题

## 实现细节

### 时间工具

位于`src/utils/timeUtils.ts`：

```typescript
// 将数据库时间字符串（UTC）转换为Date对象
parseDatabaseDate(dateString: string): Date

// 将Date对象格式化为数据库存储格式
formatForDatabase(date?: Date): string

// 格式化时间为本地显示字符串（支持ISO字符串和数据库字符串）
formatForDisplay(dateString: string, locale?: string): string

// 计算两个时间点之间的持续时间（支持ISO字符串和数据库字符串）
formatDuration(startTime: string, endTime?: Date): string

// 创建未来时间点
createFutureTime(hoursFromNow: number): string

// 获取当前UTC时间戳
getCurrentTime(): string
```

这个文件同时被后端和前端使用，确保整个项目中的时间处理逻辑一致。

### 数据库接口

所有数据库接口返回的时间字段都是字符串类型（ISO格式），而不是Date对象，避免了JSON序列化时的时区问题。

### 使用示例

```typescript
// 数据库层
const user = {
  created_at: parseDatabaseDate(row.created_at)
};

// API层
const expiresAt = createFutureTime(24); // 24小时后过期

// 前端显示
<span>{formatForDisplay(tunnel.created_at)}</span>

// 持续时间计算
const uptime = formatDuration(tunnel.updated_at);
```

## 时区一致性保证

1. **服务器时间**：所有服务器内部时间计算使用UTC
2. **数据库存储**：统一使用UTC时间戳
3. **数据传输**：API返回ISO 8601格式的UTC时间
4. **本地显示**：前端根据用户浏览器时区显示本地时间

## 注意事项

1. 不要在数据库存储本地时区时间
2. 数据库接口返回ISO字符串，不要返回Date对象
3. 前端不应修改时间，只负责显示格式化
4. 时间比较和计算应在UTC时进行
5. 所有新增的时间处理代码都应使用统一的时间工具函数
6. API返回的时间数据必须是ISO格式字符串