import { SSHBridgeServer } from './ssh-server.js';

let sshServerInstance: SSHBridgeServer | null = null;

export function setSSHServer(server: SSHBridgeServer): void {
  sshServerInstance = server;
}

export function getSSHServer(): SSHBridgeServer | null {
  return sshServerInstance;
}
