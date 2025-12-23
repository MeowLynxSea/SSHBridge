# Multi-stage build for optimized production image
FROM node:20-alpine AS base
WORKDIR /app

# Build stage (includes native module compilation)
FROM base AS builder
RUN apk add --no-cache libc6-compat python3 make g++ sqlite-dev
ENV HUSKY=0
ENV npm_config_build_from_source=true

# Copy package files and install deps (build tools only exist in this stage)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source code and build
COPY . .
RUN npm run build:server
RUN npm run build:web

# Remove dev deps for runtime
RUN npm prune --omit=dev && npm cache clean --force

# Production stage (runtime only)
FROM base AS runner
RUN apk add --no-cache libc6-compat sqlite openssh-client
WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/database.sqlite
ENV HOST_KEY_PATH=/app/keys/host.key

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Copy runtime artifacts only
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.next ./.next

# Create directories for data and host keys
RUN mkdir -p /app/data /app/keys && chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Start the application
CMD ["sh", "-c", "mkdir -p /app/data /app/keys && exec node dist/server.js"]
