import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../src/database.js';

const database = getDatabaseInstance();

async function authenticate(req: NextApiRequest): Promise<{ id: number; username: string } | null> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;

  const user = await database.validateSession(token);
  return user ? { id: user.id, username: user.username } : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await authenticate(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  switch (req.method) {
    case 'GET':
      try {
        // Get tunnel statistics for the authenticated user
        const stats = await database.getTunnelStatsByUserId(user.id);

        // Format statistics and include online status and real-time rates
        const statsFormatted = await Promise.all(
          stats.map(async (stat) => {
            const realtimeStats = await database.getRealtimeStats(stat.tunnel_id);

            return {
              ...stat,
              is_online: stat.is_online === 1,
              formatted: {
                total_bytes_received: formatBytes(stat.total_bytes_received),
                total_bytes_sent: formatBytes(stat.total_bytes_sent),
                current_bytes_received: formatBytes(stat.current_bytes_received),
                current_bytes_sent: formatBytes(stat.current_bytes_sent),
                rate_received: realtimeStats
                  ? formatBytes(realtimeStats.bytes_per_second_received) + '/s'
                  : '0 B/s',
                rate_sent: realtimeStats
                  ? formatBytes(realtimeStats.bytes_per_second_sent) + '/s'
                  : '0 B/s',
              },
              realtimeStats,
            };
          })
        );

        res.status(200).json({ stats: statsFormatted });
      } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
      break;

    default:
      res.status(405).json({ error: 'Method not allowed' });
      break;
  }
}

// Helper function to format bytes to human readable format
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
