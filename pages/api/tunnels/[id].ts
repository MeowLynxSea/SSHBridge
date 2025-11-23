import { NextApiRequest, NextApiResponse } from 'next';
import Database from '../../../src/database';

const database = new Database();

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

  const { id } = req.query;
  if (!id || isNaN(Number(id))) {
    return res.status(400).json({ error: 'Invalid tunnel ID' });
  }

  const tunnelId = Number(id);

  switch (req.method) {
    case 'PUT':
      try {
        const { name, target_host, target_port, local_port } = req.body;

        if (!name || !target_host || !target_port || !local_port) {
          return res.status(400).json({ error: 'All fields are required' });
        }

        if (isNaN(target_port) || isNaN(local_port)) {
          return res.status(400).json({ error: 'Ports must be numbers' });
        }

        const tunnel = await database.getTunnelById(tunnelId);
        if (!tunnel || tunnel.user_id !== user.id) {
          return res.status(404).json({ error: 'Tunnel not found' });
        }

        const updatedTunnel = await database.updateTunnel(
          tunnelId,
          name,
          target_host,
          parseInt(target_port),
          parseInt(local_port)
        );

        res.status(200).json({ tunnel: updatedTunnel });
      } catch (error) {
        console.error('Update tunnel error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
      break;

    case 'DELETE':
      try {
        const tunnel = await database.getTunnelById(tunnelId);
        if (!tunnel || tunnel.user_id !== user.id) {
          return res.status(404).json({ error: 'Tunnel not found' });
        }

        const success = await database.deleteTunnel(tunnelId);
        if (success) {
          res.status(200).json({ message: 'Tunnel deleted successfully' });
        } else {
          res.status(404).json({ error: 'Tunnel not found' });
        }
      } catch (error) {
        console.error('Delete tunnel error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
      break;

    default:
      res.status(405).json({ error: 'Method not allowed' });
      break;
  }
}