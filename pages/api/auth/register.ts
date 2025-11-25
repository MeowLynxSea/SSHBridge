import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../src/database';

const database = getDatabaseInstance();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await database.createUser(username, password);
    const token = await database.createSession(user.id);

    res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        created_at: user.created_at,
      },
      token,
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
