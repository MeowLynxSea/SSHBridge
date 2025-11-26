#!/bin/bash

# SSHBridge Docker Deployment Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== SSHBridge Docker Deployment ===${NC}"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed${NC}"
    exit 1
fi

# Generate JWT secret if not exists
if [ -z "$JWT_SECRET" ]; then
    echo -e "${YELLOW}Generating JWT secret...${NC}"
    JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "default-secret-change-in-production")
    export JWT_SECRET
    echo "JWT_SECRET=$JWT_SECRET" > .env.local
    echo -e "${GREEN}JWT secret generated and saved to .env.local${NC}"
fi

# Stop existing container if running
if docker-compose ps | grep -q "Up"; then
    echo -e "${YELLOW}Stopping existing container...${NC}"
    docker-compose down
fi

# Clean up old images
echo -e "${YELLOW}Cleaning up old images...${NC}"
docker image prune -f

# Build and start container
echo -e "${YELLOW}Building Docker image...${NC}"
docker build -t sshbridge:latest . || {
    echo -e "${RED}Failed to build Docker image${NC}"
    exit 1
}

echo -e "${YELLOW}Starting container with docker-compose...${NC}"
docker-compose up -d || {
    echo -e "${RED}Failed to start container${NC}"
    exit 1
}

# Wait for container to be healthy
echo -e "${YELLOW}Waiting for container to be healthy...${NC}"
for i in {1..30}; do
    if docker-compose ps | grep -q "healthy"; then
        echo -e "${GREEN}Container is healthy!${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}Container failed to become healthy${NC}"
        docker-compose logs
        exit 1
    fi
    sleep 2
done

echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo -e "${GREEN}Web UI: http://localhost:3000${NC}"
echo -e "${GREEN}SSH Port: 2222${NC}"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo -e "  View logs: ${GREEN}docker-compose logs -f${NC}"
echo -e "  Stop: ${GREEN}docker-compose down${NC}"
echo -e "  Restart: ${GREEN}docker-compose restart${NC}"
echo -e "  Status: ${GREEN}docker-compose ps${NC}"