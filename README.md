# SSHBridge

[中文](./README.zh.md) | English

SSH server and tunnel management system with user authentication, tunnel management, and Web UI.

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Environment Variables](#environment-variables)
- [Security](#security)
- [API Endpoints](#api-endpoints)
- [Project Structure](#project-structure)
- [Docker Deployment](#docker-deployment)
  - [Quick Deployment](#quick-deployment)
    - [Basic Deployment](#basic-deployment)
    - [Full Configuration Deployment](#full-configuration-deployment)
  - [Environment Variables](#environment-variables-1)
    - [Required Variables](#required-variables)
    - [Optional Variables](#optional-variables)
  - [Docker Compose Deployment](#docker-compose-deployment)
  - [Data Persistence](#data-persistence)
    - [Data Persistence Deployment](#data-persistence-deployment)
    - [Data Persistence Explanation](#data-persistence-explanation)
    - [Data Persistence Best Practices](#data-persistence-best-practices)
      - [Using Data Volumes (Recommended)](#using-data-volumes-recommended)
      - [Using Bind Mounts](#using-bind-mounts)
      - [Backup Strategy](#backup-strategy)
  - [Verify Deployment](#verify-deployment)
  - [Production Environment Notes](#production-environment-notes)
  - [Troubleshooting](#troubleshooting)
    - [Container Won't Start](#container-wont-start)
    - [Cannot Access Web Interface](#cannot-access-web-interface)
    - [SSH Connection Fails](#ssh-connection-fails)
    - [Data Persistence Issues](#data-persistence-issues)
  - [Update Deployment](#update-deployment)
- [Development](#development)
- [License](#license)
- [Contributing](#contributing)

## Features

- SSH server with password authentication
- Reverse proxy/tunnel management
- User registration, login, and authentication
- Web UI for tunnel management (create, edit, delete)
- Multi-language support (English, Chinese, Spanish, French, German, Japanese, Russian, Arabic)
- RTL language support (Arabic)
- Two-factor authentication (2FA) with TOTP
- Bandwidth monitoring and statistics
- Real-time tunnel analytics
- GeoIP-based access logging
- SSH command interface (CUI) with PTY support
- Theme customization (dark/light mode)
- Strict TypeScript type checking
- Next.js SSR mode frontend
- Neo-brutalism UI design

## Technology Stack

### Backend

- Node.js + TypeScript
- ssh2 (SSH server)
- better-sqlite3 (data storage)
- bcrypt (password hashing)
- JWT (session management)

### Frontend

- Next.js 16 (SSR mode)
- React 19
- TypeScript
- Tailwind CSS 4
- Radix UI components (shadcn/ui)
- React Hook Form with Zod validation
- React i18next for internationalization

## Quick Start

### Install Dependencies

```bash
npm install
```

### Development Mode

```bash
npm run dev
```

This will start both:

- SSH server (port 2222)
- Web UI (port 3000)

### Production Mode

```bash
npm run build
npm start
```

## Usage

### 1. Create User

Visit http://localhost:3000 and register a new account

### 2. Configure Tunnel

After logging in, create tunnels in the Web UI:

- Name: Descriptive name for the tunnel
- Target Host: Target server address to forward to
- Target Port: Port on the target server
- Local Port: Local port on the SSH server

### 3. Use Tunnel

Connect to the server using an SSH client:

```bash
ssh -L [local_port]:[target_host]:[target_port] username@server_address -p 2222
```

## Environment Variables

- `WEB_PORT`: Web UI port (default: 3000)
- `SSH_PORT`: SSH server port (default: 2222)
- `JWT_SECRET`: JWT secret (required for production)

## Security

1. Change default JWT_SECRET in production
2. Use strong passwords
3. Enable 2FA for additional security

## API Endpoints

### Authentication

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/enable-otp` - Enable 2FA
- `POST /api/auth/disable-otp` - Disable 2FA
- `POST /api/auth/verify-otp` - Verify 2FA token

### Tunnel Management

- `GET /api/tunnels` - Get user tunnel list
- `POST /api/tunnels` - Create new tunnel
- `PUT /api/tunnels/[id]` - Update tunnel
- `DELETE /api/tunnels/[id]` - Delete tunnel
- `GET /api/tunnels/[id]/bandwidth` - Get tunnel bandwidth usage
- `GET /api/tunnels/[id]/access-logs` - Get tunnel access logs
- `GET /api/tunnels/[id]/access-stats` - Get tunnel access statistics

## Project Structure

```
SSHBridge/
├── src/                 # Backend source code
│   ├── database.ts      # Database management and models
│   ├── ssh-server.ts    # SSH server implementation
│   ├── server.ts        # Main server entry point
│   ├── components/      # Shared UI components
│   ├── lib/             # Utility functions
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utility functions
│   └── cui/             # SSH CUI (PTY) interface
├── pages/               # Next.js pages
│   ├── api/            # API routes
│   │   ├── auth/       # Authentication endpoints
│   │   ├── tunnels/    # Tunnel management endpoints
│   │   ├── stats/      # Statistics endpoints
│   │   └── settings/   # Settings endpoints
│   ├── _app.tsx        # Next.js app configuration
│   ├── _document.tsx   # Document configuration
│   ├── index.tsx       # Main page
│   ├── stats.tsx       # Statistics page
│   ├── settings.tsx    # Settings page
│   └── account.tsx     # Account page
├── components/          # React components
│   ├── AuthContext.tsx  # Authentication context
│   ├── AuthForm.tsx     # Login/Register form
│   ├── TunnelManager.tsx # Tunnel management interface
│   ├── BandwidthMonitor.tsx # Bandwidth monitoring
│   ├── TunnelStats.tsx  # Tunnel statistics
│   ├── Settings.tsx     # Settings modal
│   ├── LanguageContext.tsx # Language context
│   └── ThemeContext.tsx # Theme context
├── styles/              # CSS files
│   ├── globals.css      # Global styles
│   └── neo-brutalism.css # Custom UI theme
├── lib/                 # Frontend library functions
│   ├── i18n.ts         # i18n configuration
│   ├── locales/        # Translation files
│   └── apiErrors.ts    # API error handling
├── docs/                # Documentation
│   ├── pty-error-handling.md
│   └── timezone-handling.md
└── scripts/             # Utility scripts
```

## Docker Deployment

### Prerequisites

- Docker installed and running
- Server access (able to bind ports 2222 and 3000)

### Quick Deployment

#### Basic Deployment

```bash
docker run -d \
  --name sshbridge \
  --network host \
  -e BASE_TUNNEL_HOST=your-server-ip \
  -e SSH_PORT=2222 \
  ghcr.io/meowlynxsea/sshbridge:main
```

#### Full Configuration Deployment

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

### Environment Variables

#### Required Variables

- `BASE_TUNNEL_HOST`: Base tunnel host address (usually your server IP)
- `SSH_PORT`: SSH server port (default: 2222)

#### Optional Variables

- `JWT_SECRET`: JWT signing key (must be set for production)
- `WEB_PORT`: Web interface port (default: 3000)
- `DATABASE_PATH`: Database file path (default: ./database.sqlite)
- `HOST_KEY_PATH`: SSH host key path (default: ./host.key)
- `NEXT_PUBLIC_FOOTER_TEXT`: Custom footer text

### Docker Compose Deployment

Create a `docker-compose.yml` file:

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

Start the service:

```bash
docker-compose up -d
```

### Data Persistence

**Important: You must persist data files to avoid data loss**

#### Data Persistence Deployment

```bash
# Create data directory
mkdir -p ./sshbridge-data

# Start container with data volume mounted
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

#### Data Persistence Explanation

By default, data inside Docker containers is lost when the container is removed. SSHBridge requires persistence for the following critical files:

1. **Database file** (`database.sqlite`): Contains user accounts, tunnel configurations, and statistics
2. **SSH host key** (`host.key`): SSH server authentication key

If these files are not persisted, each container restart will:

- Lose all user data
- Reset tunnel configurations
- Generate new SSH host keys (causing client connection warnings)

#### Data Persistence Best Practices

**1. Using Data Volumes (Recommended)**

```bash
# Create a Docker named volume
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

**2. Using Bind Mounts**

```bash
# Create data directory on the host
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

**3. Backup Strategy**

```bash
# Backup data directory
tar -czf sshbridge-backup-$(date +%Y%m%d).tar.gz ./sshbridge-data

# Restore data directory
tar -xzf sshbridge-backup-YYYYMMDD.tar.gz
```

### Verify Deployment

1. **Check container status**:

   ```bash
   docker ps | grep sshbridge
   ```

2. **View logs**:

   ```bash
   docker logs sshbridge
   ```

3. **Access Web Interface**:
   Open your browser and navigate to `http://your-server-ip:3000`

4. **Test SSH Connection**:

   ```bash
   ssh -p 2222 username@your-server-ip
   ```

5. **Verify Data Persistence**:
   ```bash
   # Check if data files exist
   ls -la ./sshbridge-data/
   # You should see database.sqlite and host.key files
   ```

### Production Environment Notes

1. Must set the `JWT_SECRET` environment variable with a strong random string:

   ```bash
   JWT_SECRET=$(openssl rand -base64 32)
   ```

2. Ensure data directory permissions are correct:

   ```bash
   chown -R 1000:1000 ./sshbridge-data
   ```

3. Consider using firewall to restrict port access:

   ```bash
   # Ubuntu/Debian
   ufw allow 2222/tcp
   ufw allow 3000/tcp

   # CentOS/RHEL
   firewall-cmd --permanent --add-port=2222/tcp
   firewall-cmd --permanent --add-port=3000/tcp
   firewall-cmd --reload
   ```

### Troubleshooting

#### Container Won't Start

```bash
# Check container logs
docker logs sshbridge

# Check if ports are already in use
netstat -tulpn | grep -E ":(2222|3000)"
```

#### Cannot Access Web Interface

- Verify firewall settings
- Check `WEB_PORT` environment variable configuration
- Confirm container is running

#### SSH Connection Fails

- Confirm `SSH_PORT` environment variable configuration
- Check network connectivity
- Verify user credentials

#### Data Persistence Issues

```bash
# Check data directory
docker exec sshbridge ls -la /app/data/

# Check mount points
docker inspect sshbridge | grep -A 5 -B 5 Mounts
```

### Update Deployment

```bash
# Backup data (important!)
tar -czf sshbridge-backup-$(date +%Y%m%d).tar.gz ./sshbridge-data

# Stop and remove existing container
docker stop sshbridge && docker rm sshbridge

# Pull latest image
docker pull ghcr.io/meowlynxsea/sshbridge:main

# Restart with the same command
```

## Development

### Type Safety

The project uses strict TypeScript configuration. All code must pass type checking.

### Code Style

- ESLint with TypeScript rules
- Prettier for formatting
- Husky pre-commit hooks
- Conventional Git commits

### SSH Tunnel Mechanism

The server automatically forwards incoming SSH connections to specified target hosts and ports based on user-configured tunnel information. Users don't need to specify forwarding parameters when connecting.

### Testing

```bash
# Run type checking
npm run type-check

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

## License

AGPL v3

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request
