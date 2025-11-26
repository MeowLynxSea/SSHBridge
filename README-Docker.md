# SSHBridge Docker 部署指南

## 快速部署

1. **上传项目文件到服务器**
   ```bash
   scp -r . user@your-server:/path/to/ssbbridge
   ```

2. **运行部署脚本**
   ```bash
   cd /path/to/ssbbridge
   ./scripts/docker-deploy.sh
   ```

## 手动部署步骤

### 1. 构建镜像
```bash
docker build -t sshbridge:latest .
```

### 2. 运行容器
```bash
# 方式1：使用 docker-compose
docker-compose up -d

# 方式2：直接使用 docker run
docker run -d \
  --name sshbridge \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 2222:2222 \
  -e NODE_ENV=production \
  -e JWT_SECRET="your-secure-jwt-secret-here" \
  -v $(pwd)/data:/app/data \
  sshbridge:latest
```

## 环境变量

- `NODE_ENV`: 运行环境 (默认: production)
- `WEB_PORT`: Web UI端口 (默认: 3000)
- `SSH_PORT`: SSH服务端口 (默认: 2222)
- `JWT_SECRET`: JWT签名密钥 (必须设置，生产环境使用强密码)
- `DATABASE_PATH`: 数据库文件路径 (可选)

## 数据持久化

- 数据库文件：`/app/data/database.sqlite`
- SSH主机密钥：`/app/hostkey`

建议使用Docker volumes或绑定挂载来保存数据。

## 常见问题

### sqlite3 编译失败
确保Dockerfile包含了构建依赖：
```dockerfile
RUN apk add --no-cache python3 make g++ sqlite-dev
```

### 权限问题
使用非root用户运行容器：
```dockerfile
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs
```

### 端口冲突
修改docker-compose.yml中的端口映射或SSH服务端口。

## 健康检查

容器包含健康检查，可以通过以下命令查看状态：
```bash
docker ps
docker inspect sshbridge
```

## 日志查看
```bash
# 实时查看日志
docker-compose logs -f

# 查看容器日志
docker logs sshbridge -f
```

## 更新应用
```bash
# 停止并删除旧容器
docker-compose down

# 重新构建镜像
docker build -t sshbridge:latest .

# 启动新容器
docker-compose up -d
```