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
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Verify dist directory was created and contains server.js
RUN ls -la dist/server.js || (echo "server.js not found in dist directory" && exit 1)

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Create empty public directory if it doesn't exist
RUN mkdir -p ./public

# Copy package.json
COPY --from=builder /app/package.json ./package.json

# Install production dependencies (already in standalone, but for dist server files)
RUN npm ci --only=production --ignore-scripts

# Create directories for data and host keys
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app/data

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"]