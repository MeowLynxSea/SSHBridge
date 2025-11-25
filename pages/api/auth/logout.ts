import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../src/database';

const database = getDatabaseInstance();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    try {
      await database.deleteSession(req.headers.authorization?.replace('Bearer ', '') || '');
      res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
