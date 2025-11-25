# PTY错误处理逻辑

## 概述

当SSH客户端的远程端口转发请求失败时，我们需要在SSH会话的PTY（伪终端）中显示错误信息，而不是简单地断开连接。

## 问题背景

### 事件处理时序问题

SSH连接的建立涉及多个异步事件：

1. **认证事件** (`conn.on('authentication')`)
2. **端口转发请求** (`conn.on('request', 'tcpip-forward')`)
3. **会话创建** (`conn.on('session')`)
4. **PTY请求** (`session.on('pty')`)
5. **Shell请求** (`session.on('shell')`)

这些事件处理器是独立异步的，可能导致：

- Shell请求在端口转发验证完成之前就处理完毕
- 错误信息设置得太晚，用户看不到

### 典型错误场景

1. **端口已被使用**：用户尝试连接一个已经被其他连接占用的端口
2. **端口不属于自己的**：用户尝试连接一个不在其配置中的端口
3. **系统端口被占用**：请求的端口被系统其他进程占用

## 解决方案

### 1. 端口转发请求跟踪

在每个SSH连接对象上跟踪端口转发状态：

```javascript
conn._pendingPortForwards = 0; // 待处理的端口转发请求数
conn._processedPortForwards = 0; // 已处理的端口转发请求数
```

### 2. 错误状态存储

当端口转发验证失败时，立即存储错误信息：

```javascript
conn._sshbForwardError = {
  message: errorMsg,
  details: detailMsg,
};
```

**重要**：存储错误后立即调用`reject()`拒绝端口转发，但不断开SSH连接。

### 3. PTY请求处理

PTY请求处理器检查是否存在端口转发错误：

```javascript
session.on('pty', (accept, reject, info) => {
  if (conn._sshbForwardError) {
    // 接受PTY但准备在shell中显示错误
    accept();
    session._showForwardError = true;
    return;
  }
  // 正常处理PTY
});
```

### 4. Shell请求同步化

Shell请求处理器等待所有端口转发验证完成：

```javascript
session.on('shell', (accept, reject) => {
  const pending = conn._pendingPortForwards || 0;
  const processed = conn._processedPortForwards || 0;

  if (processed < pending) {
    // 端口转发验证还未完成，等待
    setTimeout(() => {
      session.emit('shell', accept, reject);
    }, 500);
    return;
  }

  // 检查错误并显示
  const forwardError = conn._sshbForwardError;
  if (forwardError) {
    channel.write(`ERROR: ${forwardError.message}\r\n`);
    channel.write(`${forwardError.details}\r\n`);
    channel.write(`连接将被断开。\r\n`);

    // 清理错误并断开连接
    delete conn._sshbForwardError;
    setTimeout(() => {
      channel.end();
      conn.end();
    }, 2000);
    return;
  }

  // 正常设置shell
});
```

## 错误消息格式

### 统一错误消息

所有端口转发错误都使用相同的格式：

```
ERROR: 远程端口转发 ${bindAddr}:${bindPort} 未被授权
${错误详情}
连接将被断开。
```

### 具体错误类型

1. **端口已占用**：

   ```
   隧道端口 ${bindPort} 已在线。此隧道端口已在此连接或另一个连接中在线。请勿重复连接同一端口。
   ```

2. **端口不属于自己的**：

   ```
   该端口不匹配您配置的任何隧道。您已配置的端口: ${availablePorts || '无'}
   ```

3. **系统端口被占用**：
   ```
   隧道端口 ${bindPort} 启用失败: ${err.message}
   ```

## 关键点

### 异步处理

- 端口转发验证和shell处理是并行的异步过程
- 必须确保shell处理等待端口转发验证完成

### 连接管理

- **拒绝端口转发**：立即调用`reject()`
- **保持SSH连接**：不要立即断开，让PTY显示错误
- **断开时机**：错误显示后延迟2秒断开

### 状态清理

- 错误显示后立即清理：`delete conn._sshbForwardError`
- 避免重复显示错误信息

## 扩展指南

当需要添加新的错误类型时：

1. **确定错误时机**：端口转发验证的哪个阶段
2. **设置错误信息**：使用统一格式
3. **拒绝端口转发**：调用`reject()`
4. **保持连接活跃**：不调用`conn.end()`

错误信息应包含：

- **主要错误**：为什么端口转发被拒绝
- **详细说明**：用户可以采取的行动
- **上下文信息**：用户已配置的端口列表

## 实现细节

### 请求计数

- `_pendingPortForwards`：记录连接收到的端口转发请求数量
- `_processedPortForwards`：记录已处理完成的端口转发请求数量
- 每个端口转发请求处理完成时（无论是成功还是失败）都增加计数

### 错误传递

- `_sshbForwardError`：存储在连接对象上的错误信息
- `_showForwardError`：存储在session对象上的标志，用于在shell中显示错误

### 时序控制

- Shell请求在计数器显示所有请求已处理之前，不继续执行
- 使用500ms的延迟重新触发shell请求，给端口转发验证足够的时间完成
