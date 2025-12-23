# AGENTS.md

## Project Overview

SSHBridge is an SSH server and tunnel management system with a Web UI. It provides user authentication, tunnel management, and a Next.js-based web interface.

### Technology Stack

**Backend:**

- Node.js + TypeScript
- better-sqlite3 (SQLite database with synchronous API)
- bcrypt (password hashing)
- JWT (session management)

**Frontend:**

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Radix UI components (shadcn/ui)

### Multi-language Support

The application supports 8 languages:

- English (en) - Default
- Chinese (zh) - 中文
- Spanish (es) - Español
- French (fr) - Français
- German (de) - Deutsch
- Japanese (ja) - 日本語
- Russian (ru) - Русский
- Arabic (ar) - العربية (with RTL support)

Language preferences are stored in localStorage and can be changed in the Settings modal.

## Essential Commands

### Development

```bash
# Install dependencies
npm install

# Start development mode (both SSH server and Web UI)
npm run dev

# Start only SSH server in development
npm run server:dev

# Start only Web UI in development
npm run web:dev
```

### Production

```bash
# Build both server and web
npm run build

# Build server only
npm run build:server

# Build web only
npm run build:web

# Start production server
npm start
```

### Quality Assurance

```bash
# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Run type checking without emitting files
npm run type-check
```

### Utilities

```bash
# Create demo user with example data
node scripts/create-demo-user.js

# Start development servers using shell script
./start-dev.sh

# Start production servers using shell script
./start.sh
```

## Project Structure

```
SSHBridge/
├── src/                     # Backend source code
│   ├── database.ts          # Database management and models
│   ├── server.ts            # Main server entry point
│   ├── ssh-server.ts        # SSH server implementation
│   ├── integratedRateLimiter.ts  # Bandwidth rate limiting implementation
│   ├── tcpServerManager.ts   # TCP server management
│   ├── sshInstance.ts       # SSH instance management
│   ├── components/ui/       # Shared UI components (shadcn/ui)
│   ├── lib/                 # Backend utility functions
│   ├── utils/               # Backend utilities (time, etc.)
│   ├── types/               # Backend TypeScript type definitions
│   └── cui/                 # Command-line UI components
│       ├── CUIManager.ts    # Main CUI manager
│       ├── CUII18n.ts       # Internationalization for CUI
│       ├── i18n.ts          # Text display utilities for multi-language
│       └── types.ts         # CUI type definitions
├── pages/                   # Next.js pages
│   ├── api/                 # API routes
│   │   ├── auth/            # Authentication endpoints
│   │   │   ├── login.ts     # User login
│   │   │   ├── register.ts  # User registration
│   │   │   ├── change-password.ts  # Password change
│   │   │   ├── enable-otp.ts       # 2FA enable
│   │   │   ├── disable-otp.ts      # 2FA disable
│   │   │   ├── generate-otp.ts     # OTP generation
│   │   │   ├── verify-otp.ts       # OTP verification
│   │   │   └── otp-status.ts       # OTP status
│   │   ├── tunnels/         # Tunnel management endpoints
│   │   │   ├── index.ts     # Tunnel CRUD operations
│   │   │   ├── [id].ts      # Individual tunnel operations
│   │   │   ├── rate.ts      # Rate limiting configuration
│   │   │   └── [id]/bandwidth.ts  # Bandwidth monitoring
│   │   ├── stats/           # Statistics endpoints
│   │   ├── settings/        # Settings endpoints
│   │   └── config/          # Configuration endpoints
│   ├── _app.tsx             # Next.js app configuration
│   ├── _document.tsx        # Document configuration
│   ├── index.tsx            # Main page
│   ├── account.tsx          # Account management
│   ├── settings.tsx         # Settings page
│   └── stats.tsx            # Statistics page
├── components/              # React components
│   ├── AuthContext.tsx      # Authentication context
│   ├── LanguageContext.tsx  # Language context for i18n
│   ├── ThemeContext.tsx     # Theme context (dark/light mode)
│   ├── AuthForm.tsx         # Login/Register form
│   ├── TunnelManager.tsx    # Tunnel management interface
│   ├── TunnelFormDialog.tsx # Tunnel creation/editing dialog
│   ├── TunnelStats.tsx      # Tunnel statistics display
│   ├── BandwidthMonitor.tsx # Bandwidth monitoring component
│   ├── OTPManager.tsx       # 2FA management
│   ├── OtpContext.tsx       # OTP context
│   ├── OtpInputModal.tsx    # OTP input modal
│   ├── CommandDialog.tsx    # Command execution dialog
│   ├── DeleteConfirmDialog.tsx  # Deletion confirmation
│   ├── LogoutConfirmDialog.tsx  # Logout confirmation
│   ├── Modal.tsx            # Base modal component
│   ├── ResponsiveLayout.tsx # Responsive layout wrapper
│   ├── Settings.tsx         # Settings page component
│   └── Footer.tsx           # Footer component
├── lib/                     # Frontend utility functions
│   ├── apiErrors.ts         # API error handling
│   ├── i18n.ts              # Frontend i18n configuration
│   └── locales/             # Translation files for 8 languages
│       ├── en.ts            # English translations
│       ├── zh.ts            # Chinese translations
│       ├── es.ts            # Spanish translations
│       ├── fr.ts            # French translations
│       ├── de.ts            # German translations
│       ├── ja.ts            # Japanese translations
│       ├── ru.ts            # Russian translations
│       └── ar.ts            # Arabic translations (RTL)
├── styles/                  # CSS files
│   ├── globals.css          # Global styles
│   └── neo-brutalism.css    # Custom UI theme
├── types/                   # Frontend TypeScript definitions
│   ├── Tunnel.ts            # Tunnel type definitions
├── docs/                    # Documentation
│   ├── pty-error-handling.md   # PTY error handling guide
│   └── timezone-handling.md     # Timezone handling guide
├── start-dev.sh             # Development startup script
├── start.sh                 # Production startup script
└── .husky/                  # Git hooks configuration
    └── pre-commit           # Pre-commit hook for linting
```

## Code Patterns and Conventions

### TypeScript Configuration

- Strict TypeScript enabled with comprehensive type checking
- Path aliases configured: `@/*` maps to `./src/*`
- ESNext modules with Node resolution for frontend
- CommonJS modules for backend server build
- React JSX transform enabled
- Two tsconfig files:
  - `tsconfig.json` for Next.js frontend (noEmit)
  - `tsconfig.server.json` for backend server build
- Custom type definitions in `src/types/ssh2.d.ts` and `src/types/ssh2-types.ts`

### ESLint Configuration

- TypeScript ESLint rules enabled
- React and React Hooks rules configured
- Unused variables with `_` prefix are allowed
- `any` types are flagged as warnings (not errors)
- Linting is enforced via pre-commit hook

### Component Patterns

- Functional components with hooks throughout
- Props interfaces defined above components
- shadcn/ui components for UI elements (stored in `src/components/ui/`)
- Tailwind CSS classes for styling
- Custom CSS classes for neo-brutalism theme (prefix: `nb-`)
- Context providers for auth, language, theme, and OTP management
- Form validation using react-hook-form and Zod schemas
- Responsive layouts with Tailwind breakpoints

### API Routes

- Next.js API routes in `pages/api/`
- Method validation at route start
- Try-catch blocks for error handling
- Consistent error response format: `{ error: string }`
- Authentication via JWT tokens
- Rate limiting capabilities for tunnels
- Comprehensive OTP/2FA support
- Real-time statistics and bandwidth monitoring
- Dynamic route handling (e.g., `pages/api/tunnels/[id].ts`)

### Database Patterns

- better-sqlite3 for synchronous database operations
- Singleton pattern for database instance
- Prepared statements with parameterized queries
- Async/await throughout (while better-sqlite3 is synchronous, we maintain async interfaces)

## Authentication & Security

### User Authentication

- Password hashing with bcrypt
- JWT sessions for API authentication
- User registration and login endpoints
- Session management in SQLite database
- Two-factor authentication (2FA) with TOTP via speakeasy library
- Password change functionality
- OTP generation and verification

### SSH Server

- Runs on port 2222 (configurable via SSH_PORT env var)
- RSA host key generation on first run
- Password-based authentication
- Tunnel forwarding based on user configurations
- Real-time connection tracking
- Bandwidth rate limiting per tunnel
- Custom SSH2 type extensions for additional properties

## Environment Variables

- `WEB_PORT`: Web UI port (default: 3000)
- `SSH_PORT`: SSH server port (default: 2222)
- `JWT_SECRET`: JWT signing key (required for production)

## Testing

Currently no test framework is configured. Consider adding:

- Jest for unit testing
- React Testing Library for component testing
- Supertest for API endpoint testing
- Integration tests for SSH server functionality
- Rate limiting and bandwidth shaping tests

## Development Workflow

1. The project uses Husky for git hooks
2. Pre-commit hook runs `npm run lint` (allows up to 60 warnings)
3. Use `npm run dev` to start both SSH server and Web UI with concurrently
4. Alternative: Use `./start-dev.sh` script for development
5. Web UI runs on port 3000, SSH server on port 2222
6. Use the demo user script to quickly set up test data
7. Project supports both development and production startup scripts
8. TypeScript compilation output goes to `dist/` directory for server code
9. Next.js builds to `.next/` directory for frontend

## Key Files to Understand

1. `src/server.ts` - Main server entry point
2. `src/ssh-server.ts` - SSH server implementation
3. `src/database.ts` - Database operations and models
4. `src/cui/` - Command-line UI implementation with internationalization
5. `src/integratedRateLimiter.ts` - Bandwidth shaping implementation
6. `src/tcpServerManager.ts` - TCP connection management
7. `pages/api/auth/login.ts` - Example of API route pattern
8. `components/AuthForm.tsx` - Example of React component with form handling
9. `lib/locales/` - Translation files for 8 languages
10. `styles/neo-brutalism.css` - Custom UI theme classes
11. `start-dev.sh` - Development server startup script

## Gotchas and Important Notes

1. **Type Safety**: The project uses strict TypeScript with comprehensive type definitions, including custom SSH2 types.

2. **Server Communication**: The SSH server runs independently of the Next.js app. In development, both need to be running concurrently.

3. **Database Initialization**: The database uses a singleton pattern with synchronous better-sqlite3 operations wrapped in async interfaces. There's a small delay in `server.ts` to ensure the database is ready.

4. **Path Aliases**: The project uses `@/*` for imports, which maps to `./src/*`. This is configured in both `tsconfig.json` and `components.json`.

5. **Styling**: The project uses both Tailwind CSS and custom neo-brutalism classes. Custom classes use the `nb-` prefix.

6. **No API Client**: The project doesn't use a dedicated API client library - it uses `axios` directly in the auth context.

7. **Component Library**: The project uses shadcn/ui components, which are stored in `src/components/ui/`.

8. **SSH Key Management**: Host keys are generated automatically on first run and stored as `host.key` in the project root.

9. **Database File**: SQLite database file is stored as `database.sqlite` in the project root. The project uses better-sqlite3 which provides synchronous database operations wrapped in async interfaces.

10. **Pre-commit Hook**: Linting is enforced via a pre-commit hook. The lint command allows up to 60 warnings.

11. **Internationalization**: The project supports 8 languages including RTL (Arabic). Translation resources are split between frontend (`lib/locales/`) and CUI (`src/cui/i18n.ts`).

12. **Text Display Width**: For proper CUI layout, use `getDisplayWidth()` function from `src/cui/i18n.ts` which correctly calculates display width for CJK characters.

13. **Rate Limiting**: The bandwidth rate limiter uses a token bucket algorithm with 100ms refill intervals. It maintains protocol integrity by queuing complete packets.

14. **SSH2 Type Extensions**: The project extends ssh2 types with custom properties for connection tracking, error handling, and tunnel management.

15. **Module System**: The project uses ES modules for Next.js frontend and CommonJS for the backend server build (see separate tsconfig files).
