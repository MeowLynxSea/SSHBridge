import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../src/database.js';
import { clearAuthCookie, getAuthToken } from '../../../lib/auth.js';

const database = getDatabaseInstance();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    try {
      const token = getAuthToken(req);
      if (token) {
        await database.deleteSession(token);
      }
      clearAuthCookie(res, req);
      res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
