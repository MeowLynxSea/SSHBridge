import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../src/database.js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const database = getDatabaseInstance();
    const { token } = req.cookies;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await database.validateSession(token);
    if (!user) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const { tunnelId } = req.query;

    if (!tunnelId || Array.isArray(tunnelId)) {
      return res.status(400).json({ error: 'Tunnel ID is required' });
    }

    // Verify tunnel belongs to user
    const tunnel = await database.getTunnelById(Number(tunnelId));
    if (!tunnel || tunnel.user_id !== user.id) {
      return res.status(404).json({ error: 'Tunnel not found' });
    }

    // Get current stats and rate
    const realtimeStats = await database.getRealtimeStats(Number(tunnelId));

    return res.status(200).json({
      success: true,
      tunnelId: Number(tunnelId),
      realtimeStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Rate API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
