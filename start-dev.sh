#!/bin/bash

# Start the development servers
cd "$(dirname "$0")"

echo "Starting SSHBridge development environment..."

echo "SSH server listening on port 2222"
echo "Web UI available at http://localhost:3000"
echo "Press Ctrl+C to stop"

# src/server.ts starts the SSH server and forks Next.js in development mode
./node_modules/.bin/tsx watch src/server.ts
