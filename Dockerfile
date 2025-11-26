# Multi-stage build for optimized production image
FROM node:20-alpine AS base

# Install dependencies needed for native modules
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Build stage
FROM base AS builder
RUN apk add --no-cache libc6-compat python3 make g++ sqlite-dev
ENV npm_config_build_from_source=true
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Debug: Check if src files exist and inspect tsconfig
RUN echo "--- Checking src files ---"
RUN ls -la src/server.ts src/database.ts src/ssh-server.ts

RUN echo "--- Checking tsconfig.server.json ---"
RUN cat tsconfig.server.json

RUN echo "--- Running build:server ---"
RUN npm run build:server

RUN echo "--- Checking build output ---"
RUN ls -la dist/ || echo "Dist directory not found"

# Verify server.js was created
RUN ls -la dist/server.js || (echo "server.js not found in dist directory" && exit 1)

RUN echo "--- Running build:web ---"
RUN npm run build:web

# Production stage
FROM base AS runner
RUN apk add --no-cache libc6-compat sqlite python3 make g++ openssh-client
WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/database.sqlite

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Create empty public directory if it doesn't exist
RUN mkdir -p ./public

# Copy package.json and package-lock.json
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

# Install all dependencies and rebuild native modules
RUN npm ci --ignore-scripts && \
    npm rebuild better-sqlite3 && \
    npm prune --production

# Create directories for data and host keys
RUN mkdir -p /app/data /app/keys && chown -R nodejs:nodejs /app/data /app/keys

# Switch to non-root user
USER nodejs

# Start the application
CMD ["sh", "-c", "mkdir -p /app/data /app/keys && npm start"]