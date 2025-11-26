export interface ClientAccessLog {
  id: number;
  tunnel_id: number;
  connection_id: string;
  client_ip: string;
  client_country?: string;
  client_region?: string;
  client_city?: string;
  connection_start_time: string;
  connection_end_time?: string;
  duration_seconds?: number;
  bytes_sent: number;
  bytes_received: number;
  user_agent?: string;
  created_at: string;
}

export default interface Tunnel {
  id: number;
  user_id: number;
  name: string;
  external_port: number;
  max_bandwidth?: number;
  created_at: string;
  is_online?: boolean;
}
