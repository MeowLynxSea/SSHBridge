#!/bin/bash

# Start the development servers
cd "$(dirname "$0")"

echo "Starting SSHBridge development environment..."

# Start SSH server in background
./node_modules/.bin/tsx watch src/server.ts &
SSH_SERVER_PID=$!

# Wait a moment for SSH server to initialize
sleep 2

# Start Next.js web server in background
./node_modules/.bin/next dev &
WEB_SERVER_PID=$!

echo "SSH server PID: $SSH_SERVER_PID"
echo "Web server PID: $WEB_SERVER_PID"
echo "SSH server listening on port 2222"
echo "Web UI available at http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for interrupt signal
trap 'echo "Stopping servers..."; kill $SSH_SERVER_PID $WEB_SERVER_PID; exit' INT

# Wait for both processes
wait