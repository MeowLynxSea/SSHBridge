import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import Database from './database';
import { SSHBridgeServer } from './ssh-server';
import * as fs from 'fs';
import * as path from 'path';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const webPort = parseInt(process.env.WEB_PORT || '3000', 10);
const sshPort = parseInt(process.env.SSH_PORT || '2222', 10);

const app = next({ dev, hostname, port: webPort });
const handle = app.getRequestHandler();

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
    
    const database = new Database();
    await new Promise(resolve => setTimeout(resolve, 100)); // Give database time to initialize
    
    const hostKey = await generateHostKey();
    const sshServer = new SSHBridgeServer({
      port: sshPort,
      hostKey
    }, database);
    
    await sshServer.start();
    console.log(`SSH server started on port ${sshPort}`);
    
    await app.prepare();
    const server = createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url!, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('Error occurred handling', req.url, err);
        res.statusCode = 500;
        res.end('internal server error');
      }
    });
    
    server.listen(webPort, () => {
      console.log(`Web UI ready on http://${hostname}:${webPort}`);
    });
    
    process.on('SIGINT', async () => {
      console.log('Shutting down gracefully...');
      await sshServer.stop();
      server.close(() => {
        console.log('Server stopped');
        process.exit(0);
      });
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();