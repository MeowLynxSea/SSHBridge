import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../src/database';
import { sendLocalizedError } from '../../../lib/apiErrors';

const database = getDatabaseInstance();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return sendLocalizedError(req, res, 405, 'methodNotAllowed');
  }

  try {
    // Verify authentication
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return sendLocalizedError(req, res, 401, 'authRequired');
    }

    const user = await database.validateSession(token);
    if (!user) {
      return sendLocalizedError(req, res, 401, 'invalidToken');
    }

    // Verify OTP before disabling (2FA confirmation)
    const { token: otpToken } = req.body;
    if (!otpToken) {
      return sendLocalizedError(req, res, 400, 'otpTokenRequiredToDisable');
    }

    const isOtpEnabled = await database.isUserOtpEnabled(user.id);
    if (!isOtpEnabled) {
      return sendLocalizedError(req, res, 400, 'otpNotEnabled');
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

    // Disable OTP for the user
    const success = await database.disableOTP(user.id);
    if (!success) {
      return sendLocalizedError(req, res, 500, 'failedToDisableOtp');
    }

    res.status(200).json({ message: 'OTP disabled successfully' });
  } catch (error) {
    console.error('Disable OTP error:', error);
    sendLocalizedError(req, res, 500, 'internalServerError');
  }
}