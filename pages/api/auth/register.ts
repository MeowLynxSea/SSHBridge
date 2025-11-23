import { NextApiRequest, NextApiResponse } from 'next';
import Database from '../../../src/database';

const database = new Database();

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
        created_at: user.created_at
      },
      token
    });
  } catch (error: any) {
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}