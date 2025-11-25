declare module 'ssh2' {
  export interface Server {
    constructor(options: any);
    on(event: string, callback: (connection: Connection) => void): void;
    listen(options: { port: number; host?: string }, callback?: () => void): void;
    close(callback?: () => void): void;
  }
  
  export interface Connection {
    on(event: string, callback: (ctx: any) => void): void;
    on(event: 'authentication', callback: (ctx: AuthContext) => void): void;
    on(event: 'request', callback: (accept: () => void, reject: () => void, name: string, data: any) => void): void;
    on(event: 'session', callback: (accept: () => Session) => void): void;
    on(event: 'error' | 'end', callback: () => void): void;
    forwardOut(srcAddr: string, srcPort: number, destAddr: string, destPort: number, callback: (err: Error, channel: Channel) => void): void;
    end(): void;
  }
  
  export interface AuthContext {
    method: string;
    username: string;
    password?: string;
    accept(): void;
    reject(): void;
  }
  
  export interface Session {
    on(event: string, callback: (accept: any, reject: any, info: any) => void): void;
    on(event: 'pty', callback: (accept: () => void, reject: () => void, info: PtyInfo) => void): void;
    on(event: 'shell', callback: (accept: () => Channel, reject: () => void) => void): void;
    on(event: 'channel', callback: (accept: () => Channel, reject: () => void, info: any) => void): void;
    on(event: 'error', callback: (err: Error) => void): void;
  }
  
  export interface PtyInfo {
    term: string;
    rows: number;
    cols: number;
    session?: string;
  }
  
  export interface Channel {
    write(data: string | Buffer): void;
    on(event: string, callback: (data: any) => void): void;
    on(event: 'data', callback: (data: Buffer) => void): void;
    on(event: 'close' | 'error', callback: () => void): void;
    close(): void;
    end(): void;
    eof(): void; // Send EOF signal to indicate no more data will be sent
  }
  
  export interface TCPForwardingInfo {
    server: any;
    bindAddr: string;
    bindPort: number;
    connection: Connection;
    user: any;
  }
  
  const ssh2: {
    Server: typeof Server;
  };
  
  export default ssh2;
}