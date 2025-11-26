# SSHBridge

中文 | [English](./README.md)

SSH服务器和隧道管理系统，具有用户认证、隧道管理和Web UI功能。

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
- SQLite3 (数据存储)
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
