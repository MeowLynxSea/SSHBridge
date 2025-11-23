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
        const { name, target_host, target_port, local_port } = req.body;

        if (!name || !target_host || !target_port || !local_port) {
          return res.status(400).json({ error: 'All fields are required' });
        }

        if (isNaN(target_port) || isNaN(local_port)) {
          return res.status(400).json({ error: 'Ports must be numbers' });
        }

        const tunnel = await database.createTunnel(
          user.id,
          name,
          target_host,
          parseInt(target_port),
          parseInt(local_port)
        );

        res.status(201).json({ tunnel });
      } catch (error) {
        console.error('Create tunnel error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
      break;

    default:
      res.status(405).json({ error: 'Method not allowed' });
      break;
  }
}