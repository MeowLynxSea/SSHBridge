import getDatabaseInstance from './database.js';
import { SSHBridgeServer } from './ssh-server.js';
import { setSSHServer, getSSHServer } from './sshInstance.js';
import { ipcEventManager, IpcRequest } from './ipcManager.js';
import * as fs from 'fs';
import * as path from 'path';
import { fork, execSync } from 'child_process';

const sshPort = parseInt(process.env.SSH_PORT || '2222', 10);
const webPort = parseInt(process.env.WEB_PORT || '3000', 10);

async function generateHostKey(): Promise<string> {
  const keyPath = process.env.HOST_KEY_PATH || path.join(process.cwd(), 'keys', 'host.key');

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

    // Set up IPC message handling for child process
    const nextServer = fork('./node_modules/.bin/next', [nextCommand, '-p', webPort.toString()], {
      silent: false,
      env: {
        ...process.env,
        PORT: webPort.toString(),
      },
    });

    console.log(`[MAIN DEBUG] Started Next.js process with PID: ${nextServer.pid}`);
    console.log(`[MAIN DEBUG] IPC channel connected: ${nextServer.connected}`);
    console.log(`[MAIN DEBUG] stdio config:`, nextServer.stdio);

    // Check if the process is actually a Node.js process
    console.log(`[MAIN DEBUG] Process send method exists:`, typeof nextServer.send);

    // Add an error listener
    nextServer.on('error', (error) => {
      console.error('[MAIN DEBUG] Child process error:', error);
    });

    // Add a disconnect listener
    nextServer.on('disconnect', () => {
      console.log('[MAIN DEBUG] Child process disconnected');
    });

    // Handle IPC messages from Next.js process
    nextServer.on('message', async (message: IpcRequest) => {
      console.log(`[MAIN DEBUG] Received message from Next.js:`, message);
      if (message && message.type && message.messageId) {
        try {
          console.log(`[MAIN DEBUG] Forwarding message to IPC event manager`);
          // Forward the message to IPC event manager for handling
          const response = await ipcEventManager.handleMessageInMainProcess(message);
          console.log(`[MAIN DEBUG] Got response from IPC manager:`, response);
          // Send response back to child process
          const responseMessage = { type: 'response', messageId: message.messageId, ...response };
          console.log(`[MAIN DEBUG] Sending response back to Next.js:`, responseMessage);
          const sendResult = nextServer.send(responseMessage);
          console.log(`[MAIN DEBUG] nextServer.send result: ${sendResult}`);
        } catch (error) {
          console.error('Error handling IPC message:', error);
          // Send error response back to child process
          const errorMessage = {
            type: 'response',
            messageId: message.messageId,
            success: false,
            message: 'Internal error',
            error: error instanceof Error ? error.message : String(error),
          };
          console.log(`[MAIN DEBUG] Sending error response to Next.js:`, errorMessage);
          const sendResult = nextServer.send(errorMessage);
          console.log(`[MAIN DEBUG] nextServer.send error result: ${sendResult}`);
        }
      } else {
        console.log(`[MAIN DEBUG] Received invalid message format:`, message);
      }
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
