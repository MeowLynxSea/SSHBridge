import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../../src/database.js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = getDatabaseInstance();
    const user = await db.validateSession(token);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { days = 7 } = req.query;
    const tunnelId = req.query.id;

    if (!tunnelId || isNaN(Number(tunnelId))) {
      return res.status(400).json({ error: 'Invalid tunnel ID' });
    }

    // Verify that tunnel belongs to user
    const tunnel = await db.getTunnelById(Number(tunnelId));
    if (!tunnel || tunnel.user_id !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const stats = await db.getClientAccessLogStats(Number(tunnelId), Number(days));

    res.status(200).json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Error fetching client access log stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
