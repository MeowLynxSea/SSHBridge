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

  const { id } = req.query;
  if (!id || isNaN(Number(id))) {
    return res.status(400).json({ error: 'Invalid tunnel ID' });
  }

  const tunnelId = Number(id);

  switch (req.method) {
    case 'PUT':
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
          return res.status(400).json({ error: 'External port must be in range 10000-65535' });
        }

        if (max_bandwidth && (isNaN(max_bandwidth) || parseInt(max_bandwidth) <= 0)) {
          return res.status(400).json({ error: 'Max bandwidth must be a positive number (bytes per second)' });
        }

        const tunnel = await database.getTunnelById(tunnelId);
        if (!tunnel || tunnel.user_id !== user.id) {
          return res.status(404).json({ error: 'Tunnel not found' });
        }

        const updatedTunnel = await database.updateTunnel(
          tunnelId,
          name,
          port,
          max_bandwidth ? parseInt(max_bandwidth) : undefined
        );

        res.status(200).json({ tunnel: updatedTunnel });
      } catch (error) {
        console.error('Update tunnel error:', error);
        
        // Handle specific validation errors
        if (error instanceof Error) {
          if (error.message.includes('is already in use')) {
            return res.status(409).json({ error: error.message });
          }
          if (error.message.includes('not allowed') || error.message.includes('Port must be in range')) {
            return res.status(400).json({ error: error.message });
          }
        }
        
        res.status(500).json({ error: 'Internal server error' });
      }
      break;

    case 'PATCH':
      try {
        const { max_bandwidth } = req.body;

        if (!max_bandwidth) {
          return res.status(400).json({ error: 'Max bandwidth is required for PATCH operation' });
        }

        if (isNaN(max_bandwidth) || parseInt(max_bandwidth) <= 0) {
          return res.status(400).json({ error: 'Max bandwidth must be a positive number (bytes per second)' });
        }

        const tunnel = await database.getTunnelById(tunnelId);
        if (!tunnel || tunnel.user_id !== user.id) {
          return res.status(404).json({ error: 'Tunnel not found' });
        }

        const updatedTunnel = await database.updateTunnelBandwidth(
          tunnelId,
          parseInt(max_bandwidth)
        );

        res.status(200).json({ tunnel: updatedTunnel });
      } catch (error) {
        console.error('Update tunnel bandwidth error:', error);
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