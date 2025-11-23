declare module 'ssh2' {
  interface AuthContext {
    method: string;
    username: string;
    password: string;
    accept(): void;
    reject(): void;
  }
  
  interface ChannelInfo {
    type: string;
    destAddr: string;
    destPort: number;
  }
  
  class Server {
    constructor(options: any);
    on(event: string, callback: (connection: Connection) => void): void;
    listen(options: { port: number; host?: string }, callback?: () => void): void;
    close(callback?: () => void): void;
  }
  
  class Connection {
    id: string;
    on(event: 'authentication', callback: (ctx: AuthContext) => void): void;
    on(event: 'session', callback: (accept: () => any) => void): void;
    on(event: 'error', callback: (err: Error) => void): void;
    on(event: 'end', callback: () => void): void;
    end(): void;
  }
  
  export { Server, Connection };
}