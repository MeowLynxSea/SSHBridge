export interface TunnelStats {
  id: number;
  tunnel_id: number;
  total_bytes_received: number;
  total_bytes_sent: number;
  current_bytes_received: number;
  current_bytes_sent: number;
  active_connections: number;
  is_online: number;
  created_at: string;
  updated_at: string;
}

export interface RealtimeStats {
  timestamp: Date;
  bytes_per_second_received: number;
  bytes_per_second_sent: number;
  current_bytes_received?: number;
  current_bytes_sent?: number;
}

export interface TunnelStatsWithInfo extends TunnelStats {
  tunnel_name: string;
  external_port: number;
  user_id: number;
}

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
