import getDatabaseInstance from './database';
import { SSHBridgeServer } from './ssh-server';
import { setSSHServer, getSSHServer } from './sshInstance';
import * as fs from 'fs';
import * as path from 'path';

const sshPort = parseInt(process.env.SSH_PORT || '2222', 10);

async function generateHostKey(): Promise<string> {
  const keyPath = path.join(process.cwd(), 'host.key');

  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf8');
  }

  const { execSync } = require('child_process');
  execSync(`ssh-keygen -t rsa -b 2048 -f ${keyPath} -N "" -C "SSHBridge Server"`);
  return fs.readFileSync(keyPath, 'utf8');
}

async function gracefulShutdown(): Promise<void> {
  try {
    console.log('Starting graceful shutdown...');

    const sshServer = getSSHServer();
    if (sshServer) {
      console.log('Shutting down SSH server and all TCP tunnels...');
      await sshServer.stop();
      console.log('SSH server and all TCP tunnels stopped');
    }

    console.log('Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

async function startServer() {
  try {
    console.log('Starting SSHBridge server...');

    const database = getDatabaseInstance();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Give database time to initialize

    const hostKey = await generateHostKey();
    const sshServer = new SSHBridgeServer(
      {
        port: sshPort,
        hostKey,
      },
      database
    );

    // Set the SSH server instance in our shared module
    setSSHServer(sshServer);

    await sshServer.start();
    console.log(`SSH server started on port ${sshPort}`);

    // Handle multiple shutdown signals
    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);

    // Handle uncaught exceptions and rejections
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      gracefulShutdown();
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown();
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
