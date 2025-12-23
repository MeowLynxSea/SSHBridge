import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../src/database.js';
import { sendLocalizedError } from '../../../lib/apiErrors.js';
import { getClientIp, rateLimit } from '../../../lib/rateLimit.js';
import { getAuthToken } from '../../../lib/auth.js';

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
    const { allowed, retryAfterSeconds } = rateLimit(`auth:verify-otp:${user.id}:${ip}`, {
      windowMs: 60_000,
      max: 20,
    });
    if (!allowed) {
      res.setHeader('Retry-After', retryAfterSeconds.toString());
      return res.status(429).json({ error: 'Too many OTP attempts. Please try again later.' });
    }

    const { otpToken } = req.body;

    if (!otpToken) {
      return sendLocalizedError(req, res, 400, 'otpTokenRequired');
    }

    // Check if OTP is enabled for this user
    const isOtpEnabled = await database.isUserOtpEnabled(user.id);
    if (!isOtpEnabled) {
      return sendLocalizedError(req, res, 400, 'otpNotEnabledForAccount');
    }

    // Get the OTP secret
    const secret = await database.getUserOtpSecret(user.id);
    if (!secret) {
      return sendLocalizedError(req, res, 400, 'otpSecretNotFound');
    }

    // Verify the OTP token
    const { default: speakeasy } = await import('speakeasy');
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: otpToken,
      window: 2,
    });

    if (!verified) {
      return sendLocalizedError(req, res, 400, 'invalidOtpToken');
    }

    res.status(200).json({ valid: true });
  } catch (error) {
    console.error('Verify OTP error:', error);
    sendLocalizedError(req, res, 500, 'internalServerError');
  }
}
