import { EventEmitter } from 'events';

// IPC message with messageId for request/response tracking
export interface IpcRequest extends IpcMessage {
  messageId: string;
}

export interface IpcMessage {
  type: 'disconnect_tunnel';
  data: {
    tunnelId: number;
    userId: number;
    username: string;
    port: number;
  };
}

export interface IpcResponse {
  success: boolean;
  message: string;
  error?: string;
}

// Response message from main process includes messageId
export interface IpcResponseMessage extends IpcResponse {
  messageId: string;
  type: 'response';
}

// IPC event emitter for communication
class IPCEventManager extends EventEmitter {
  private responseCallbacks: Map<string, (response: IpcResponse) => void> = new Map();

  constructor() {
    super();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle responses from main process
    this.on('response', (messageId: string, response: IpcResponse) => {
      console.log(`[IPC DEBUG] Received response event for messageId: ${messageId}`, response);
      const callback = this.responseCallbacks.get(messageId);
      if (callback) {
        console.log(`[IPC DEBUG] Found and executing callback for messageId: ${messageId}`);
        callback(response);
        this.responseCallbacks.delete(messageId);
      } else {
        console.log(`[IPC DEBUG] No callback found for messageId: ${messageId}`);
      }
    });

    // Handle messages from main process (when running as child process)
    if (process.on) {
      process.on('message', (message: IpcResponseMessage) => {
        console.log(`[IPC DEBUG] Received message from main process:`, message);
        if (message && message.type === 'response' && message.messageId) {
          console.log(`[IPC DEBUG] Emitting response event for messageId: ${message.messageId}`);
          // Emit the response event to trigger the callback
          this.emit('response', message.messageId, message);
        } else {
          console.log(
            `[IPC DEBUG] Received non-response message or missing messageId. Message type: ${message?.type}, messageId: ${message?.messageId}`
          );
        }
      });
    } else {
      console.log(`[IPC DEBUG] process.on is not available`);
    }
  }

  /**
   * Send a message to the main process
   */
  sendToMainProcess(message: IpcMessage): Promise<IpcResponse> {
    console.log(`[IPC DEBUG] Sending message:`, message);
    return new Promise((resolve, reject) => {
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      console.log(`[IPC DEBUG] Generated messageId: ${messageId}`);

      // Store callback for response
      this.responseCallbacks.set(messageId, resolve);
      console.log(`[IPC DEBUG] Stored callback for messageId: ${messageId}`);

      // Set a timeout for the response
      const timeout = setTimeout(() => {
        this.responseCallbacks.delete(messageId);
        console.error(`[IPC DEBUG] Timeout waiting for response to messageId: ${messageId}`);
        reject(new Error('IPC message timeout'));
      }, 5000); // 5 second timeout

      // Modify the resolve function to clear the timeout
      const wrappedResolve = (response: IpcResponse) => {
        clearTimeout(timeout);
        resolve(response);
      };
      this.responseCallbacks.set(messageId, wrappedResolve);

      // Create request with messageId
      const request: IpcRequest = {
        ...message,
        messageId,
      };

      // Send message via process.send if available (child process)
      if (process.send) {
        console.log(`[IPC DEBUG] Using process.send to send message`);
        console.log(`[IPC DEBUG] process exists: ${!!process}`);
        console.log(`[IPC DEBUG] process.send exists: ${typeof process.send}`);
        console.log(`[IPC DEBUG] process.pid: ${process.pid}`);
        console.log(`[IPC DEBUG] process.ppid: ${process.ppid}`);

        const sendResult = process.send(request);
        console.log(`[IPC DEBUG] process.send result: ${sendResult}`);
        if (sendResult === false) {
          console.log(`[IPC DEBUG] process.send returned false, indicating send buffer is full`);
          clearTimeout(timeout);
          this.responseCallbacks.delete(messageId);
          reject(new Error('IPC send buffer full'));
        }
      } else {
        console.log(`[IPC DEBUG] Not in child process, handling directly`);
        clearTimeout(timeout);
        // If not in child process, handle directly
        this.handleMessageInMainProcess(request).then(wrappedResolve).catch(reject);
      }
    });
  }

  /**
   * Handle message in main process
   */
  async handleMessageInMainProcess(message: IpcRequest): Promise<IpcResponse> {
    console.log(`[MAIN IPC DEBUG] handleMessageInMainProcess called with:`, message);
    try {
      // Import the SSH server instance
      const { getSSHServer } = await import('./sshInstance.js');
      const sshServer = getSSHServer();
      console.log(`[MAIN IPC DEBUG] SSH server instance:`, !!sshServer);

      if (!sshServer) {
        console.log(`[MAIN IPC DEBUG] SSH server not available`);
        return {
          success: false,
          message: 'SSH server not available',
          error: 'SSH server not available',
        };
      }

      switch (message.type) {
        case 'disconnect_tunnel':
          console.log(`[MAIN IPC DEBUG] Handling disconnect_tunnel`);
          return this.handleDisconnectTunnel(message.data, sshServer);
        default:
          console.log(`[MAIN IPC DEBUG] Unknown message type: ${message.type}`);
          return {
            success: false,
            message: 'Unknown message type',
            error: 'Unknown message type',
          };
      }
    } catch (error) {
      console.log(`[MAIN IPC DEBUG] Exception in handleMessageInMainProcess:`, error);
      return {
        success: false,
        message: 'Internal error',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Handle tunnel disconnection request
   */
  private async handleDisconnectTunnel(
    data: IpcMessage['data'],
    // SSHBridgeServer - Using dynamic import here
    sshServer: unknown
  ): Promise<IpcResponse> {
    try {
      const { tunnelId, userId, username, port } = data;

      // Get active remote forwards to find connection
      // Type assertion as we're dynamically importing this module
      const server = sshServer as {
        getActiveRemoteForwards: () => Promise<Map<string, unknown>>;
        getTcpServerManager: () => {
          closeTcpServer: (username: string, port: number) => Promise<void>;
        };
      };

      const activeRemoteForwards = await server.getActiveRemoteForwards();
      let connectionToNotify: unknown = null;

      for (const [, forward] of activeRemoteForwards.entries()) {
        // Type assertion for forward object
        const forwardData = forward as {
          bindPort: number;
          user: { id: number };
          connection: unknown;
        };

        if (forwardData.bindPort === port && forwardData.user.id === userId) {
          connectionToNotify = forwardData.connection;
          break;
        }
      }

      // Get tunnel info
      const dbModule = await import('./database.js');
      const getDatabaseInstance = dbModule.default;
      const database = getDatabaseInstance();
      const tunnel = await database.getTunnelById(tunnelId);

      if (!tunnel || tunnel.user_id !== userId) {
        return {
          success: false,
          message: 'Tunnel not found or access denied',
          error: 'Tunnel not found or access denied',
        };
      }

      // Send error message to client if we found connection
      if (connectionToNotify) {
        // Type assertion for connection object
        const connection = connectionToNotify as {
          _sshbForwardError?: { message: string; details: string };
          end: () => void;
        };

        const errorMsg = `Tunnel ${tunnel.name} (Port: ${tunnel.external_port}) has been forcefully disconnected by the web interface`;
        const errorDetails = `The tunnel has been taken offline. Please reconnect if needed.`;

        // Store error on connection to show in PTY
        connection._sshbForwardError = {
          message: errorMsg,
          details: errorDetails,
        };

        // Wait a bit for the error to be displayed
        setTimeout(() => {
          // End the SSH connection after error message is displayed
          connection.end();
        }, 1000);
      }

      // Close TCP server using existing TcpServerManager from SSH server
      const tcpManager = server.getTcpServerManager();
      await tcpManager.closeTcpServer(username, port);
      console.log(`Successfully closed TCP server for tunnel ${tunnelId} on port ${port}`);

      // Update database to mark tunnel as offline
      await database.updateTunnelOnlineStatus(tunnelId, false);

      return {
        success: true,
        message: 'Tunnel successfully taken offline',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error disconnecting tunnel',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const ipcEventManager = new IPCEventManager();
