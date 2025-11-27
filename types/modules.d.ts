// Type declarations for Node.js modules
declare module '../database.js' {
  function getDatabaseInstance(): any;
  export = getDatabaseInstance;
}

declare module '../sshInstance.js' {
  function getSSHServer(): any;
  function setSSHServer(server: any): void;
  export = { getSSHServer, setSSHServer };
}
