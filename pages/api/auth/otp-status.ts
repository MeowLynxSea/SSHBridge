import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../src/database.js';
import { getAuthToken } from '../../../lib/auth.js';

const database = getDatabaseInstance();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication
    const token = getAuthToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    const user = await database.validateSession(token);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const isOtpEnabled = await database.isUserOtpEnabled(user.id);

    res.status(200).json({
      otp_enabled: isOtpEnabled,
    });
  } catch (error) {
    console.error('Get OTP status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
