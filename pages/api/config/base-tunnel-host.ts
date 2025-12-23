import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../src/database.js';
import { getAuthToken } from '../../../lib/auth.js';

const database = getDatabaseInstance();

async function authenticate(req: NextApiRequest): Promise<{ id: number; username: string } | null> {
  const token = getAuthToken(req);
  if (!token) return null;

  const user = await database.validateSession(token);
  return user ? { id: user.id, username: user.username } : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Get public tunnel host from configuration; do not leak container hostname.
  const baseTunnelHost = process.env.BASE_TUNNEL_HOST || 'localhost';

  // Align with server default in src/server.ts (SSH_PORT defaults to 2222).
  const baseTunnelPort = process.env.SSH_PORT || '2222';

  res.status(200).json({ baseTunnelHost, baseTunnelPort });
}
