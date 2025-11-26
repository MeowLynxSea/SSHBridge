import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../src/database.js';
import { sendLocalizedError } from '../../../lib/apiErrors.js';

const database = getDatabaseInstance();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return sendLocalizedError(req, res, 405, 'methodNotAllowed');
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
      return sendLocalizedError(req, res, 409, 'usernameExists');
    }
    console.error('Registration error:', err);
    sendLocalizedError(req, res, 500, 'internalServerError');
  }
}
