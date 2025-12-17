# SSHBridge

中文 | [English](./README.md)

SSH服务器和隧道管理系统，具有用户认证、隧道管理和Web UI功能。

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [使用方法](#使用方法)
- [环境变量](#环境变量)
- [安全性](#安全性)
- [API端点](#api端点)
- [项目结构](#项目结构)
- [Docker 部署](#docker-部署)
  - [快速部署](#快速部署)
    - [基本部署](#基本部署)
    - [完整配置部署](#完整配置部署)
  - [环境变量说明](#环境变量说明)
    - [必需变量](#必需变量)
    - [可选变量](#可选变量)
  - [Docker Compose 部署](#docker-compose-部署)
  - [数据持久化](#数据持久化)
    - [数据持久化部署](#数据持久化部署)
    - [持久化数据说明](#持久化数据说明)
    - [数据持久化最佳实践](#数据持久化最佳实践)
      - [使用数据卷（推荐）](#使用数据卷推荐)
      - [使用绑定挂载](#使用绑定挂载)
      - [备份策略](#备份策略)
  - [验证部署](#验证部署)
  - [生产环境注意事项](#生产环境注意事项)
  - [故障排除](#故障排除)
    - [容器无法启动](#容器无法启动)
    - [无法访问Web界面](#无法访问web界面)
    - [SSH连接失败](#ssh连接失败)
    - [数据持久化问题](#数据持久化问题)
  - [更新部署](#更新部署)
- [开发](#开发)
- [许可证](#许可证)
- [贡献](#贡献)

## 功能特性

- 支持密码认证的SSH服务器
- 反向代理/隧道管理
- 用户注册、登录和认证
- 隧道管理的Web UI（创建、编辑、删除）
- 多语言支持（英文、中文、西班牙语、法语、德语、日语、俄语、阿拉伯语）
- RTL语言支持（阿拉伯语）
- 基于TOTP的双因素认证（2FA）
- 带宽监控和统计
- 实时隧道分析
- 基于GeoIP的访问日志
- SSH命令行界面（CUI），支持PTY
- 主题定制（深色/浅色模式）
- 严格的TypeScript类型检查
- Next.js SSR模式前端
- 新野蛮主义UI设计

## 技术栈

### 后端

- Node.js + TypeScript
- ssh2 (SSH服务器)
- better-sqlite3 (数据存储)
- bcrypt (密码加密)
- JWT (会话管理)

### 前端

- Next.js 16 (SSR模式)
- React 19
- TypeScript
- Tailwind CSS 4
- Radix UI components (shadcn/ui)
- React Hook Form with Zod validation
- React i18next for internationalization

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

这将同时启动：

- SSH服务器（端口 2222）
- Web UI（端口 3000）

### 生产模式

```bash
npm run build
npm start
```

## 使用方法

### 1. 创建用户

访问 http://localhost:3000 并注册一个新账户

### 2. 配置隧道

登录后，在Web UI中创建隧道：

- 名称：隧道的描述性名称
- 目标主机：要转发到的目标服务器地址
- 目标端口：目标服务器上的端口
- 本地端口：SSH服务器上的本地端口

### 3. 使用隧道

使用SSH客户端连接到服务器：

```bash
ssh -L [本地端口]:[目标主机]:[目标端口] 用户名@服务器地址 -p 2222
```

## 环境变量

- `WEB_PORT`: Web UI端口（默认：3000）
- `SSH_PORT`: SSH服务器端口（默认：2222）
- `JWT_SECRET`: JWT密钥（生产环境必需）

## 安全性

1. 在生产环境中更改默认的JWT_SECRET
2. 使用强密码
3. 启用2FA以增加安全性

## API端点

### 认证

- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户登出
- `POST /api/auth/enable-otp` - 启用2FA
- `POST /api/auth/disable-otp` - 禁用2FA
- `POST /api/auth/verify-otp` - 验证2FA令牌

### 隧道管理

- `GET /api/tunnels` - 获取用户隧道列表
- `POST /api/tunnels` - 创建新隧道
- `PUT /api/tunnels/[id]` - 更新隧道
- `DELETE /api/tunnels/[id]` - 删除隧道
- `GET /api/tunnels/[id]/bandwidth` - 获取隧道带宽使用情况
- `GET /api/tunnels/[id]/access-logs` - 获取隧道访问日志
- `GET /api/tunnels/[id]/access-stats` - 获取隧道访问统计

## 项目结构

```
SSHBridge/
├── src/                 # 后端源代码
│   ├── database.ts      # 数据库管理和模型
│   ├── ssh-server.ts    # SSH服务器实现
│   ├── server.ts        # 主服务器入口点
│   ├── components/      # 共享UI组件
│   ├── lib/             # 工具函数
│   ├── types/           # TypeScript类型定义
│   ├── utils/           # 工具函数
│   └── cui/             # SSH CUI (PTY)界面
├── pages/               # Next.js页面
│   ├── api/            # API路由
│   │   ├── auth/       # 认证端点
│   │   ├── tunnels/    # 隧道管理端点
│   │   ├── stats/      # 统计端点
│   │   └── settings/   # 设置端点
│   ├── _app.tsx        # Next.js应用配置
│   ├── _document.tsx   # 文档配置
│   ├── index.tsx       # 主页面
│   ├── stats.tsx       # 统计页面
│   ├── settings.tsx    # 设置页面
│   └── account.tsx     # 账户页面
├── components/          # React组件
│   ├── AuthContext.tsx  # 认证上下文
│   ├── AuthForm.tsx     # 登录/注册表单
│   ├── TunnelManager.tsx # 隧道管理界面
│   ├── BandwidthMonitor.tsx # 带宽监控
│   ├── TunnelStats.tsx  # 隧道统计
│   ├── Settings.tsx     # 设置模态框
│   ├── LanguageContext.tsx # 语言上下文
│   └── ThemeContext.tsx # 主题上下文
├── styles/              # CSS文件
│   ├── globals.css      # 全局样式
│   └── neo-brutalism.css # 自定义UI主题
├── lib/                 # 前端库函数
│   ├── i18n.ts         # i18n配置
│   ├── locales/        # 翻译文件
│   └── apiErrors.ts    # API错误处理
├── docs/                # 文档
│   ├── pty-error-handling.md
│   └── timezone-handling.md
└── scripts/             # 实用脚本
```

## Docker 部署

### 前提条件

- Docker 已安装并运行
- 对服务器的访问权限（可绑定端口 2222 和 3000）

### 快速部署

#### 基本部署

```bash
docker run -d \
  --name sshbridge \
  --network host \
  -e BASE_TUNNEL_HOST=your-server-ip \
  -e SSH_PORT=2222 \
  ghcr.io/meowlynxsea/sshbridge:main
```

#### 完整配置部署

```bash
docker run -d \
  --name sshbridge \
  --network host \
  -e BASE_TUNNEL_HOST=your-server-ip \
  -e SSH_PORT=2222 \
  -e JWT_SECRET=your-jwt-secret-key \
  -e WEB_PORT=3000 \
  -e DATABASE_PATH=/app/data/database.sqlite \
  -e HOST_KEY_PATH=/app/data/host.key \
  -e NEXT_PUBLIC_FOOTER_TEXT="Your Custom Footer" \
  -v /path/to/data:/app/data \
  ghcr.io/meowlynxsea/sshbridge:main
```

### 环境变量说明

#### 必需变量

- `BASE_TUNNEL_HOST`: 基础隧道主机地址（通常为服务器IP）
- `SSH_PORT`: SSH服务器端口（默认2222）

#### 可选变量

- `JWT_SECRET`: JWT签名密钥（生产环境必须设置）
- `WEB_PORT`: Web界面端口（默认3000）
- `DATABASE_PATH`: 数据库文件路径（默认./database.sqlite）
- `HOST_KEY_PATH`: SSH主机密钥路径（默认./host.key）
- `NEXT_PUBLIC_FOOTER_TEXT`: 页脚自定义文本

### Docker Compose 部署

创建 `docker-compose.yml` 文件：

```yaml
version: '3.8'

services:
  sshbridge:
    image: ghcr.io/meowlynxsea/sshbridge:main
    container_name: sshbridge
    network_mode: host
    restart: unless-stopped
    environment:
      - BASE_TUNNEL_HOST=your-server-ip
      - SSH_PORT=2222
      - JWT_SECRET=your-jwt-secret-key
      - WEB_PORT=3000
      - DATABASE_PATH=/app/data/database.sqlite
      - HOST_KEY_PATH=/app/data/host.key
      - NEXT_PUBLIC_FOOTER_TEXT=Your Custom Footer
    volumes:
      - ./sshbridge-data:/app/data
```

启动服务：

```bash
docker-compose up -d
```

### 数据持久化

**重要建议：必须持久化数据文件以避免数据丢失**

#### 数据持久化部署

```bash
# 创建数据目录
mkdir -p ./sshbridge-data

# 启动容器并挂载数据卷
docker run -d \
  --name sshbridge \
  --network host \
  -e BASE_TUNNEL_HOST=your-server-ip \
  -e SSH_PORT=2222 \
  -e DATABASE_PATH=/app/data/database.sqlite \
  -e HOST_KEY_PATH=/app/data/host.key \
  -v $(pwd)/sshbridge-data:/app/data \
  ghcr.io/meowlynxsea/sshbridge:main
```

#### 持久化数据说明

默认情况下，Docker容器内的数据会在容器删除时丢失。SSHBridge需要持久化以下关键文件：

1. **数据库文件** (`database.sqlite`): 包含用户账户、隧道配置和统计信息
2. **SSH主机密钥** (`host.key`): SSH服务器身份验证密钥

如果不持久化这些文件，每次重启容器都会：

- 丢失所有用户数据
- 重置隧道配置
- 生成新的SSH主机密钥（导致客户端连接警告）

#### 数据持久化最佳实践

**1. 使用数据卷（推荐）**

```bash
# 使用Docker命名卷
docker volume create sshbridge-data

docker run -d \
  --name sshbridge \
  --network host \
  -e BASE_TUNNEL_HOST=your-server-ip \
  -e SSH_PORT=2222 \
  -e DATABASE_PATH=/app/data/database.sqlite \
  -e HOST_KEY_PATH=/app/data/host.key \
  -v sshbridge-data:/app/data \
  ghcr.io/meowlynxsea/sshbridge:main
```

**2. 使用绑定挂载**

```bash
# 在宿主机上创建数据目录
mkdir -p /opt/sshbridge-data
chmod 755 /opt/sshbridge-data

docker run -d \
  --name sshbridge \
  --network host \
  -e BASE_TUNNEL_HOST=your-server-ip \
  -e SSH_PORT=2222 \
  -e DATABASE_PATH=/app/data/database.sqlite \
  -e HOST_KEY_PATH=/app/data/host.key \
  -v /opt/sshbridge-data:/app/data \
  ghcr.io/meowlynxsea/sshbridge:main
```

**3. 备份策略**

```bash
# 备份数据目录
tar -czf sshbridge-backup-$(date +%Y%m%d).tar.gz ./sshbridge-data

# 恢复数据目录
tar -xzf sshbridge-backup-YYYYMMDD.tar.gz
```

### 验证部署

1. **检查容器状态**：

   ```bash
   docker ps | grep sshbridge
   ```

2. **查看日志**：

   ```bash
   docker logs sshbridge
   ```

3. **访问Web界面**：
   打开浏览器访问 `http://your-server-ip:3000`

4. **测试SSH连接**：

   ```bash
   ssh -p 2222 username@your-server-ip
   ```

5. **验证数据持久化**：
   ```bash
   # 检查数据文件是否存在
   ls -la ./sshbridge-data/
   # 应该看到 database.sqlite 和 host.key 文件
   ```

### 生产环境注意事项

1. 必须设置 `JWT_SECRET` 环境变量，使用强随机字符串：

   ```bash
   JWT_SECRET=$(openssl rand -base64 32)
   ```

2. 确保数据目录权限正确：

   ```bash
   chown -R 1000:1000 ./sshbridge-data
   ```

3. 考虑使用防火墙限制端口访问：

   ```bash
   # Ubuntu/Debian
   ufw allow 2222/tcp
   ufw allow 3000/tcp

   # CentOS/RHEL
   firewall-cmd --permanent --add-port=2222/tcp
   firewall-cmd --permanent --add-port=3000/tcp
   firewall-cmd --reload
   ```

### 故障排除

#### 容器无法启动

```bash
# 检查容器日志
docker logs sshbridge

# 检查端口是否被占用
netstat -tulpn | grep -E ":(2222|3000)"
```

#### 无法访问Web界面

- 确认防火墙设置
- 检查 `WEB_PORT` 环境变量配置
- 验证容器是否正在运行

#### SSH连接失败

- 确认 `SSH_PORT` 环境变量配置
- 检查网络连接
- 验证用户凭证

#### 数据持久化问题

```bash
# 检查数据目录
docker exec sshbridge ls -la /app/data/

# 检查挂载点
docker inspect sshbridge | grep -A 5 -B 5 Mounts
```

### 更新部署

```bash
# 备份数据（重要！）
tar -czf sshbridge-backup-$(date +%Y%m%d).tar.gz ./sshbridge-data

# 停止并删除现有容器
docker stop sshbridge && docker rm sshbridge

# 拉取最新镜像
docker pull ghcr.io/meowlynxsea/sshbridge:main

# 使用相同命令重新启动
```

## 开发

### 类型安全

项目使用严格的TypeScript配置。所有代码必须通过类型检查。

### 代码风格

- 带有TypeScript规则的ESLint
- Prettier格式化
- Husky预提交钩子
- 约定性Git提交

### SSH隧道机制

服务器根据用户配置的隧道信息，自动将传入的SSH连接转发到指定的目标主机和端口。用户在连接时不需要指定转发参数。

### 测试

```bash
# 运行类型检查
npm run type-check

# 运行代码检查
npm run lint

# 修复代码检查问题
npm run lint:fix

# 格式化代码
npm run format
```

## 许可证

AGPL v3

## 贡献

1. Fork 仓库
2. 创建功能分支
3. 进行更改
4. 运行测试和代码检查
5. 提交拉取请求
