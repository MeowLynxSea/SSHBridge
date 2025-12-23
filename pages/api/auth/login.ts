import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../src/database.js';
import { sendLocalizedError } from '../../../lib/apiErrors.js';
import { getClientIp, rateLimit } from '../../../lib/rateLimit.js';
import { setAuthCookie } from '../../../lib/auth.js';

const database = getDatabaseInstance();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return sendLocalizedError(req, res, 405, 'methodNotAllowed');
  }

  try {
    const ip = getClientIp(req);
    const { allowed, retryAfterSeconds } = rateLimit(`auth:login:${ip}`, {
      windowMs: 60_000,
      max: 10,
    });
    if (!allowed) {
      res.setHeader('Retry-After', retryAfterSeconds.toString());
      return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
    }

    const { username, password, otpToken } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
      const user = await database.validatePasswordWithOtp(username, password, otpToken);

      if (!user) {
        return sendLocalizedError(req, res, 401, 'invalidCredentials');
      }

      const token = await database.createSession(user.id);
      setAuthCookie(res, token);

      res.status(200).json({
        user: {
          id: user.id,
          username: user.username,
          otp_enabled: user.otp_enabled,
          created_at: user.created_at,
        },
        token,
      });
    } catch (error: unknown) {
      const err = error as Error;
      // Handle specific OTP errors
      if (err.message === 'OTP token required') {
        return res.status(401).json({
          error: 'OTP token required',
          requiresOtp: true,
        });
      }
      if (err.message === 'Invalid OTP token') {
        return sendLocalizedError(req, res, 401, 'invalidOtpToken');
      }
      throw error; // Re-throw other errors
    }
  } catch (error) {
    console.error('Login error:', error);
    sendLocalizedError(req, res, 500, 'internalServerError');
  }
}
