# AGENTS.md

## Project Overview

SSHBridge is an SSH server and tunnel management system with a Web UI. It provides user authentication, tunnel management, and a Next.js-based web interface.

### Technology Stack

**Backend:**
- Node.js + TypeScript
- ssh2 (SSH server implementation)
- SQLite3 (data storage)
- bcrypt (password hashing)
- JWT (session management)

**Frontend:**
- Next.js 14 (SSR mode)
- React 18
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
```

## Project Structure

```
SSHBridge/
├── src/                     # Backend source code
│   ├── database.ts          # Database management and models
│   ├── server.ts            # Main server entry point
│   ├── ssh-server.ts        # SSH server implementation
│   ├── components/ui/       # Shared UI components
│   ├── lib/                 # Utility functions
│   └── types/               # TypeScript type definitions
├── pages/                   # Next.js pages
│   ├── api/                 # API routes
│   │   ├── auth/            # Authentication endpoints
│   │   ├── tunnels/         # Tunnel management endpoints
│   │   └── stats/           # Statistics endpoints
│   ├── _app.tsx             # Next.js app configuration
│   ├── _document.tsx        # Document configuration
│   └── index.tsx            # Main page
├── components/              # React components
│   ├── AuthContext.tsx      # Authentication context
│   ├── AuthForm.tsx         # Login/Register form
│   └── TunnelManager.tsx    # Tunnel management interface
├── styles/                  # CSS files
│   ├── globals.css          # Global styles
│   └── neo-brutalism.css    # Custom UI theme
└── scripts/                 # Utility scripts
```

## Code Patterns and Conventions

### TypeScript Configuration
- Strict TypeScript enabled
- Path aliases configured: `@/*` maps to `./src/*`
- ESNext modules with Node resolution
- React JSX transform enabled

### ESLint Configuration
- TypeScript ESLint rules enabled
- React and React Hooks rules configured
- Unused variables with `_` prefix are allowed
- `any` types are flagged as warnings (not errors)
- Linting is enforced via pre-commit hook

### Component Patterns
- Functional components with hooks
- Props interfaces defined above components
- shadcn/ui components for UI elements
- Tailwind CSS classes for styling
- Custom CSS classes for neo-brutalism theme (prefix: `nb-`)

### API Routes
- Next.js API routes in `pages/api/`
- Method validation at route start
- Try-catch blocks for error handling
- Consistent error response format: `{ error: string }`
- Authentication via JWT tokens

### Database Patterns
- SQLite with promisified methods
- Singleton pattern for database instance
- Prepared statements with parameterized queries
- Async/await throughout

## Authentication & Security

### User Authentication
- Password hashing with bcrypt
- JWT sessions for API authentication
- User registration and login endpoints
- Session management in SQLite database

### SSH Server
- Runs on port 2222 (configurable via SSH_PORT env var)
- RSA host key generation on first run
- Password-based authentication
- Tunnel forwarding based on user configurations

## Environment Variables

- `WEB_PORT`: Web UI port (default: 3000)
- `SSH_PORT`: SSH server port (default: 2222)
- `JWT_SECRET`: JWT signing key (required for production)

## Testing

Currently no test framework is configured. Consider adding:
- Jest for unit testing
- React Testing Library for component testing
- Supertest for API endpoint testing

## Development Workflow

1. The project uses Husky for git hooks
2. Pre-commit hook runs `npm run lint`
3. Use `npm run dev` to start both SSH server and Web UI
4. Web UI runs on port 3000, SSH server on port 2222
5. Use the demo user script to quickly set up test data

## Key Files to Understand

1. `src/server.ts` - Main server entry point
2. `src/ssh-server.ts` - SSH server implementation
3. `src/database.ts` - Database operations and models
4. `pages/api/auth/login.ts` - Example of API route pattern
5. `components/AuthForm.tsx` - Example of React component with form handling
6. `styles/neo-brutalism.css` - Custom UI theme classes

## Gotchas and Important Notes

1. **Type Safety**: The project uses strict TypeScript. Always ensure types are properly defined.

2. **Server Communication**: The SSH server runs independently of the Next.js app. In development, both need to be running.

3. **Database Initialization**: The database uses a singleton pattern with async initialization. There's a small delay in `server.ts` to ensure the database is ready.

4. **Path Aliases**: The project uses `@/*` for imports, which maps to `./src/*`. This is configured in both `tsconfig.json` and `components.json`.

5. **Styling**: The project uses both Tailwind CSS and custom neo-brutalism classes. Custom classes use the `nb-` prefix.

6. **No API Client**: The project doesn't use a dedicated API client library - it uses `axios` directly in the auth context.

7. **Component Library**: The project uses shadcn/ui components, which are stored in `src/components/ui/`.

8. **SSH Key Management**: Host keys are generated automatically on first run and stored as `host.key` in the project root.

9. **Database File**: SQLite database file is stored as `database.sqlite` in the project root.

10. **Pre-commit Hook**: Linting is enforced via a pre-commit hook. The lint command allows up to 50 warnings.