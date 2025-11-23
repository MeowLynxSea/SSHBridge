#!/bin/bash

cd "$(dirname "$0")"

# Generate host key if it doesn't exist
if [ ! -f "host.key" ]; then
    echo "Generating SSH host key..."
    ssh-keygen -t rsa -b 2048 -f host.key -N "" -C "SSHBridge Server"
fi

echo "Starting SSHBridge..."

# Start both servers
./node_modules/.bin/tsx src/server.ts