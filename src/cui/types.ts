import { SSH2Connection } from '../types/ssh2-types';
import { SSH2Channel } from '../types/ssh2-types';
import { Database } from '../database';

export interface CUIDataProvider {
  getActiveRemoteForwards(connection?: SSH2Connection): Promise<Map<string, {
    bindAddr: string;
    bindPort: number;
    connection: SSH2Connection;
    user: {
      id: number;
      username: string;
    };
  }>>;
  getActiveTunnels(connection?: SSH2Connection): Promise<Array<{
    id: number;
    name: string;
    port: number;
    activeConnections: number;
    sessionBytes: number;
  }>>;
  getAllTunnelStatuses(userId: number, currentConnection?: SSH2Connection): Promise<Array<{
    id: number;
    name: string;
    external_port: number;
    status: string;
    statusColor: string;
    displayStatus: string;
  }>>;
}

export interface CUIConfig {
  channel: SSH2Channel;
  connection: SSH2Connection;
  database: Database;
  user: {
    id: number;
    username: string;
  };
  dataProvider: CUIDataProvider;
}
