import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../src/database.js';
import { getAuthToken, setAuthCookie } from '../../../lib/auth.js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = getAuthToken(req);

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const database = getDatabaseInstance();
    const user = await database.validateSession(token);

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    setAuthCookie(res, token, req);
    return res.status(200).json({
      valid: true,
      user: {
        id: user.id,
        username: user.username,
        otp_enabled: user.otp_enabled,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error('Token validation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
