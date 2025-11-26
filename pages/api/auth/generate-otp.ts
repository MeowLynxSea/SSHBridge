import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../src/database.js';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { sendLocalizedError } from '../../../lib/apiErrors.js';

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

    // Check if OTP is already enabled
    const isOtpEnabled = await database.isUserOtpEnabled(user.id);
    if (isOtpEnabled) {
      return sendLocalizedError(req, res, 400, 'otpAlreadyEnabled');
    }

    // Generate secret key
    const secret = speakeasy.generateSecret({
      name: `SSHBridge (${user.username})`,
      issuer: 'SSHBridge',
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    // Store secret temporarily (not enabled yet)
    // In a real implementation, you might want to store this temporarily
    // or require the user to verify before enabling

    res.status(200).json({
      secret: secret.base32,
      qrCode: qrCodeUrl,
      manualEntryKey: secret.base32,
    });
  } catch (error) {
    console.error('Generate OTP error:', error);
    sendLocalizedError(req, res, 500, 'internalServerError');
  }
}
