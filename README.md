# SSHBridge

SSH server and tunnel management system with user authentication, tunnel management, and Web UI.

## Features

- SSH server with password authentication
- Reverse proxy/tunnel management
- User registration, login, and authentication
- Web UI for tunnel management (create, edit, delete)
- Multi-language support (English, Chinese, Spanish, French, German, Japanese, Russian, Arabic)
- RTL language support (Arabic)
- Strict TypeScript type checking
- Next.js SSR mode frontend

## 技术栈

### 后端

- Node.js + TypeScript
- ssh2 (SSH服务器)
- SQLite3 (数据存储)
- bcrypt (密码加密)
- JWT (会话管理)

### 前端

- Next.js 14 (SSR模式)
- React 18
- TypeScript
- Tailwind CSS

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

- SSH服务器 (端口 2222)
- Web UI (端口 3000)

### 生产模式

```bash
npm run build
npm start
```

## 使用说明

### 1. 创建用户

访问 http://localhost:3000 并注册一个新账户

### 2. 配置隧道

登录后，在Web UI中创建隧道：

- 名称：隧道的描述性名称
- 目标主机：要转发到的目标服务器地址
- 目标端口：目标服务器的端口
- 本地端口：SSH服务器上的本地端口

### 3. 使用隧道

使用SSH客户端连接到服务器：

```bash
ssh -L [本地端口]:[目标主机]:[目标端口] 用户名@服务器地址 -p 2222
```

## 环境变量

- `WEB_PORT`: Web UI端口 (默认: 3000)
- `SSH_PORT`: SSH服务器端口 (默认: 2222)
- `JWT_SECRET`: JWT密钥 (生产环境请设置)

## 安全说明

1. 生产环境请更改默认的JWT_SECRET
2. 使用强密码

## API接口

### 认证

- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户登出

### 隧道管理

- `GET /api/tunnels` - 获取用户隧道列表
- `POST /api/tunnels` - 创建新隧道
- `PUT /api/tunnels/[id]` - 更新隧道
- `DELETE /api/tunnels/[id]` - 删除隧道

## 项目结构

```
SSHBridge/
├── src/                 # 后端源码
│   ├── database.ts      # 数据库管理
│   ├── ssh-server.ts    # SSH服务器
│   └── server.ts        # 主服务器
├── pages/               # Next.js页面
│   ├── api/            # API路由
│   ├── _app.tsx        # Next.js应用配置
│   └── index.tsx       # 主页面
├── components/          # React组件
│   ├── AuthContext.tsx  # 认证上下文
│   ├── AuthForm.tsx     # 认证表单
│   └── TunnelManager.tsx # 隧道管理
└── styles/              # 样式文件
```

## 开发说明

### 类型安全

项目使用严格的TypeScript配置，所有代码都需要通过类型检查。

### SSH隧道机制

服务器根据用户配置的隧道信息，自动将传入的SSH连接转发到指定的目标主机和端口。用户无需在连接时指定转发参数。
