import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../../src/database.js';
import { getAuthToken } from '../../../../lib/auth.js';

const database = getDatabaseInstance();

async function authenticate(req: NextApiRequest): Promise<{ id: number; username: string } | null> {
  const token = getAuthToken(req);
  if (!token) return null;

  const user = await database.validateSession(token);
  return user ? { id: user.id, username: user.username } : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await authenticate(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || isNaN(Number(id))) {
    return res.status(400).json({ error: 'Invalid tunnel ID' });
  }

  const tunnelId = Number(id);

  try {
    const tunnel = await database.getTunnelById(tunnelId);
    if (!tunnel || tunnel.user_id !== user.id) {
      return res.status(404).json({ error: 'Tunnel not found' });
    }

    // Get bandwidth statistics from the database
    const tunnelStats = await database.getTunnelStatsByTunnelId(tunnelId);

    // Format response
    const bandwidthStats = {
      tunnel_id: tunnelId,
      tunnel_name: tunnel.name,
      max_bandwidth: tunnel.max_bandwidth,
      is_limited: !!tunnel.max_bandwidth,
      current_bytes_received: tunnelStats?.current_bytes_received || 0,
      current_bytes_sent: tunnelStats?.current_bytes_sent || 0,
      total_bytes_received: tunnelStats?.total_bytes_received || 0,
      total_bytes_sent: tunnelStats?.total_bytes_sent || 0,
      active_connections: tunnelStats?.active_connections || 0,
      is_online: tunnelStats?.is_online || 0,
      updated_at: tunnelStats?.updated_at || new Date().toISOString(),
    };

    res.status(200).json({ stats: bandwidthStats });
  } catch (error) {
    console.error('Get bandwidth stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
