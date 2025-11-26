# SSHBridge

[中文](./README.zh.md) | English

SSH server and tunnel management system with user authentication, tunnel management, and Web UI.

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
- SQLite3 (data storage)
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
