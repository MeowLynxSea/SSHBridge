import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../src/database.js';
import bcrypt from 'bcrypt';
import { sendLocalizedError } from '../../../lib/apiErrors.js';
import { getAuthToken } from '../../../lib/auth.js';
import { getClientIp, rateLimit } from '../../../lib/rateLimit.js';

const database = getDatabaseInstance();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return sendLocalizedError(req, res, 405, 'methodNotAllowed');
  }

  try {
    const { currentPassword, newPassword, otpToken } = req.body;
    const token = getAuthToken(req);

    if (!token) {
      return sendLocalizedError(req, res, 401, 'authRequired');
    }

    if (!currentPassword || !newPassword) {
      return sendLocalizedError(req, res, 400, 'currentPasswordRequired');
    }

    if (newPassword.length < 6) {
      return sendLocalizedError(req, res, 400, 'newPasswordRequired');
    }

    // Get user from token
    const session = await database.getSession(token);
    if (!session) {
      return sendLocalizedError(req, res, 401, 'invalidSession');
    }

    const user = await database.getUserById(session.user_id);
    if (!user) {
      return sendLocalizedError(req, res, 401, 'userNotFound');
    }

    const ip = getClientIp(req);
    const { allowed, retryAfterSeconds } = rateLimit(`auth:change-password:${user.id}:${ip}`, {
      windowMs: 60_000,
      max: 5,
    });
    if (!allowed) {
      res.setHeader('Retry-After', retryAfterSeconds.toString());
      return res.status(429).json({ error: 'Too many password change attempts. Please try again later.' });
    }

    // If OTP is enabled, require OTP token
    if (user.otp_enabled) {
      if (!otpToken) {
        return sendLocalizedError(req, res, 400, 'otpTokenRequired');
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
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return sendLocalizedError(req, res, 400, 'currentPasswordIncorrect');
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password in database
    await database.updateUserPassword(user.id, hashedNewPassword);

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Password change error:', err);
    sendLocalizedError(req, res, 500, 'internalServerError');
  }
}
