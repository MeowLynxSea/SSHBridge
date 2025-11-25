export default interface Tunnel {
  id: number;
  user_id: number;
  name: string;
  external_port: number;
  max_bandwidth?: number;
  created_at: string;
  is_online?: boolean;
}
