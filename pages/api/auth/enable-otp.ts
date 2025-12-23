import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../src/database.js';
import speakeasy from 'speakeasy';
import { sendLocalizedError } from '../../../lib/apiErrors.js';
import { getAuthToken } from '../../../lib/auth.js';
import { getClientIp, rateLimit } from '../../../lib/rateLimit.js';

const database = getDatabaseInstance();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return sendLocalizedError(req, res, 405, 'methodNotAllowed');
  }

  try {
    // Verify authentication
    const token = getAuthToken(req);
    if (!token) {
      return sendLocalizedError(req, res, 401, 'authRequired');
    }

    const user = await database.validateSession(token);
    if (!user) {
      return sendLocalizedError(req, res, 401, 'invalidToken');
    }

    const ip = getClientIp(req);
    const { allowed, retryAfterSeconds } = rateLimit(`auth:enable-otp:${user.id}:${ip}`, {
      windowMs: 60_000,
      max: 10,
    });
    if (!allowed) {
      res.setHeader('Retry-After', retryAfterSeconds.toString());
      return res.status(429).json({ error: 'Too many OTP attempts. Please try again later.' });
    }

    const { secret, token: otpToken } = req.body;

    if (!secret || !otpToken) {
      return sendLocalizedError(req, res, 400, 'secretAndOtpRequired');
    }

    // Verify the OTP token
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: otpToken,
      window: 2, // Allow 2 time windows before and after
    });

    if (!verified) {
      return sendLocalizedError(req, res, 400, 'invalidOtpToken');
    }

    // Enable OTP for the user
    const success = await database.enableOTP(user.id, secret);
    if (!success) {
      return sendLocalizedError(req, res, 500, 'failedToEnableOtp');
    }

    res.status(200).json({ message: 'OTP enabled successfully' });
  } catch (error) {
    console.error('Enable OTP error:', error);
    sendLocalizedError(req, res, 500, 'internalServerError');
  }
}
