import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../src/database';

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
        const tunnels = await database.getTunnelsByUserId(user.id);
        res.status(200).json({ tunnels });
      } catch (error) {
        console.error('Get tunnels error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
      break;

    case 'POST':
      try {
        const { name, external_port, max_bandwidth } = req.body;

        if (!name || !external_port) {
          return res.status(400).json({ error: 'Name and external_port are required' });
        }

        if (isNaN(external_port)) {
          return res.status(400).json({ error: 'External port must be a number' });
        }

        const port = parseInt(external_port);
        if (port < 10000 || port > 65535) {
          return res.status(400).json({ error: 'External port must be in the range 10000-65535' });
        }

        if (max_bandwidth && (isNaN(max_bandwidth) || parseInt(max_bandwidth) <= 0)) {
          return res.status(400).json({
            error: 'Max bandwidth must be a positive number (bytes per second)',
          });
        }

        const tunnel = await database.createTunnel(
          user.id,
          name,
          port,
          max_bandwidth ? parseInt(max_bandwidth) : undefined
        );

        res.status(201).json({ tunnel });
      } catch (error) {
        console.error('Create tunnel error:', error);

        // Handle specific validation errors
        if (error instanceof Error) {
          if (error.message.includes('is already in use')) {
            return res.status(409).json({ error: error.message });
          }
          if (
            error.message.includes('not allowed') ||
            error.message.includes('Port must be in range')
          ) {
            return res.status(400).json({ error: error.message });
          }
        }

        res.status(500).json({ error: 'Internal server error' });
      }
      break;

    default:
      res.status(405).json({ error: 'Method not allowed' });
      break;
  }
}
