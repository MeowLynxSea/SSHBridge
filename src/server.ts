import getDatabaseInstance from './database';
import { SSHBridgeServer } from './ssh-server';
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

async function startServer() {
  try {
    console.log('Starting SSHBridge server...');
    
    const database = getDatabaseInstance();
    await new Promise(resolve => setTimeout(resolve, 100)); // Give database time to initialize
    
    const hostKey = await generateHostKey();
    const sshServer = new SSHBridgeServer({
      port: sshPort,
      hostKey
    }, database);
    
    await sshServer.start();
    console.log(`SSH server started on port ${sshPort}`);
    
    process.on('SIGINT', async () => {
      console.log('Shutting down gracefully...');
      await sshServer.stop();
      console.log('SSH server stopped');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();