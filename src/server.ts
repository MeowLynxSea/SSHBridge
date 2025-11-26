import getDatabaseInstance from './database.js';
import { SSHBridgeServer } from './ssh-server.js';
import { setSSHServer, getSSHServer } from './sshInstance.js';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, execSync } from 'child_process';

const sshPort = parseInt(process.env.SSH_PORT || '2222', 10);
const webPort = parseInt(process.env.WEB_PORT || '3000', 10);

async function generateHostKey(): Promise<string> {
  const keyPath = process.env.HOST_KEY_PATH || path.join(process.cwd(), 'host.key');

  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf8');
  }
  
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

    const database = getDatabaseInstance(process.env.DATABASE_PATH);
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

    // Start the Next.js server
    const isProduction = process.env.NODE_ENV === 'production';
    const nextCommand = isProduction ? 'start' : 'dev';
    const nextServer = spawn('next', [nextCommand, '-p', webPort.toString()], {
      stdio: 'inherit',
      env: {
        ...process.env,
        PORT: webPort.toString(),
      },
    });

    nextServer.on('error', (error: Error) => {
      console.error('Failed to start Next.js server:', error);
      gracefulShutdown();
    });

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
