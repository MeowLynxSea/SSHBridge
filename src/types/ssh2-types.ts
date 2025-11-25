// SSH2 types and interfaces - Strict typing without any

export interface SSH2RequestData {
  bindAddr: string;
  bindPort: number;
  destAddr?: string;
  destPort?: number;
  term?: string;
  rows?: number;
  cols?: number;
}

export interface SSH2ForwardData {
  destPort: number;
  destAddr: string;
  originPort: number;
  originAddr: string;
  type: string;
}

export interface SSH2AuthContext {
  method: string;
  username: string;
  password?: string;
  accept(): void;
  reject(): void;
}

// User data structure
export interface UserData {
  id: number;
  username: string;
  password?: string;
  created_at: string;
}

// Function overloads for event handlers
export interface SSH2Connection {
  on(event: 'authentication', callback: (ctx: SSH2AuthContext) => void): void;
  on(event: 'request', callback: (accept: () => void, reject: () => void, name: string, data: SSH2RequestData) => void): void;
  on(event: 'session', callback: (accept: () => SSH2Session) => void): void;
  on(event: 'error' | 'end', callback: () => void): void;
  on(event: 'error', callback: (err: Error) => void): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  forwardOut(
    srcAddr: string, 
    srcPort: number, 
    destAddr: string, 
    destPort: number, 
    callback: (err: Error | null, channel: SSH2Channel) => void
  ): void;
  end(): void;
  _pendingPortForwards?: number;
  _processedPortForwards?: number;
  _sshbForwardError?: {
    message: string;
    details: string;
  };
  _sshbTunnelReplaced?: {
    message: string;
    details: string;
  };
  remoteAddress: string;
}

export interface SSH2Session {
  on(event: 'pty', callback: (accept: () => void, reject: () => void, info: SSH2PtyInfo) => void): void;
  on(event: 'shell', callback: (accept: () => SSH2Channel, reject: () => void) => void): void;
  on(event: 'channel', callback: (accept: () => SSH2Channel, reject: () => void, info: SSH2ForwardData) => void): void;
  on(event: 'error', callback: (err: Error) => void): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  _showForwardError?: boolean;
  _showTunnelReplaced?: boolean;
  emit(event: string, ...args: unknown[]): void;
}

export interface SSH2PtyInfo {
  term: string;
  rows: number;
  cols: number;
  session?: string;
}

export interface SSH2Channel {
  write(data: string | Buffer): void;
  on(event: 'data', callback: (data: Buffer) => void): void;
  on(event: 'close' | 'error' | 'end', callback: () => void): void;
  on(event: 'error', callback: (err: Error) => void): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  close(): void;
  end(): void;
  destroy(): void;
  eof(): void; // Send EOF signal to indicate no more data will be sent
  _conn?: SSH2Connection;
  listeners(event: string): Array<(...args: unknown[]) => void>;
  removeAllListeners(event?: string): void;
}

export interface SSH2Server {
  on(event: 'connection', callback: (conn: SSH2Connection) => void): void;
  listen(options: { port: number; host?: string }, callback?: () => void): void;
  close(callback?: () => void): void;
}

export interface SSH2Module {
  Server: new (options: { hostKeys: string[] }) => SSH2Server;
}

// Extended types for server data
export interface RemoteForwardInfo {
  server: net.Server;
  bindAddr: string;
  bindPort: number;
  connection: SSH2Connection;
  user: UserData;
}

export interface ActiveTunnelInfo {
  tunnel: Tunnel;
  connection: SSH2Connection;
  port: number;
  user: UserData;
}

// Import net module types
import * as net from 'net';
import { Tunnel } from '../database';