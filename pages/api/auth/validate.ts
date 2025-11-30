import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../src/database.js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const database = getDatabaseInstance();
    const user = await database.validateSession(token);

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    return res.status(200).json({ valid: true });
  } catch (error) {
    console.error('Token validation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
