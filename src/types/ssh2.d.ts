declare module 'ssh2' {
  class Server {
    constructor(options: any);
    on(event: string, callback: (connection: any) => void): void;
    listen(options: { port: number; host?: string }, callback?: () => void): void;
    close(callback?: () => void): void;
  }
  
  const ssh2: {
    Server: typeof Server;
  };
  
  export default ssh2;
}