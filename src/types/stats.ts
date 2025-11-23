export interface TunnelStats {
  id: number;
  tunnel_id: number;
  total_bytes_received: number;
  total_bytes_sent: number;
  current_bytes_received: number;
  current_bytes_sent: number;
  active_connections: number;
  is_online: number;
  created_at: Date;
  updated_at: Date;
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