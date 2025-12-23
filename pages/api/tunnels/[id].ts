import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../src/database.js';
import { sendLocalizedError } from '../../../lib/apiErrors.js';
import { getAuthToken } from '../../../lib/auth.js';

const database = getDatabaseInstance();

async function authenticate(req: NextApiRequest): Promise<{ id: number; username: string } | null> {
  const token = getAuthToken(req);
  if (!token) return null;

  const user = await database.validateSession(token);
  return user ? { id: user.id, username: user.username } : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await authenticate(req);
  if (!user) {
    return sendLocalizedError(req, res, 401, 'unauthorized');
  }

  const { id } = req.query;
  if (!id || isNaN(Number(id))) {
    return sendLocalizedError(req, res, 400, 'invalidTunnelId');
  }

  const tunnelId = Number(id);

  switch (req.method) {
    case 'PUT':
      try {
        const { name, external_port, max_bandwidth } = req.body;

        if (!name || !external_port) {
          return sendLocalizedError(req, res, 400, 'nameAndPortRequired');
        }

        if (isNaN(external_port)) {
          return sendLocalizedError(req, res, 400, 'portMustBeNumber');
        }

        const port = parseInt(external_port);
        if (port < 10000 || port > 65535) {
          return sendLocalizedError(req, res, 400, 'portOutOfRange');
        }

        if (max_bandwidth && (isNaN(max_bandwidth) || parseInt(max_bandwidth) <= 0)) {
          return sendLocalizedError(req, res, 400, 'bandwidthMustBePositive');
        }

        const tunnel = await database.getTunnelById(tunnelId);
        if (!tunnel || tunnel.user_id !== user.id) {
          return res.status(404).json({ error: 'Tunnel not found' });
        }

        const updatedTunnel = await database.updateTunnel(
          tunnelId,
          name,
          port,
          max_bandwidth ? parseInt(max_bandwidth) : undefined
        );

        res.status(200).json({ tunnel: updatedTunnel });
      } catch (error) {
        console.error('Update tunnel error:', error);

        // Handle specific validation errors
        if (error instanceof Error) {
          if (error.message.includes('is already in use')) {
            return sendLocalizedError(req, res, 409, 'portInUse');
          }
          if (
            error.message.includes('not allowed') ||
            error.message.includes('Port must be in range')
          ) {
            return sendLocalizedError(req, res, 400, 'portOutOfRange');
          }
        }

        res.status(500).json({ error: 'Internal server error' });
      }
      break;

    case 'PATCH':
      try {
        const { max_bandwidth } = req.body;

        if (!max_bandwidth) {
          return sendLocalizedError(req, res, 400, 'bandwidthRequiredForPatch');
        }

        if (isNaN(max_bandwidth) || parseInt(max_bandwidth) <= 0) {
          return sendLocalizedError(req, res, 400, 'bandwidthMustBePositive');
        }

        const tunnel = await database.getTunnelById(tunnelId);
        if (!tunnel || tunnel.user_id !== user.id) {
          return res.status(404).json({ error: 'Tunnel not found' });
        }

        const updatedTunnel = await database.updateTunnelBandwidth(
          tunnelId,
          parseInt(max_bandwidth)
        );

        res.status(200).json({ tunnel: updatedTunnel });
      } catch (error) {
        console.error('Update tunnel bandwidth error:', error);
        sendLocalizedError(req, res, 500, 'internalServerError');
      }
      break;

    case 'DELETE':
      try {
        const { otpToken } = req.body;

        // Get full user info to check OTP
        const fullUser = await database.getUserById(user.id);
        if (!fullUser) {
          return sendLocalizedError(req, res, 404, 'userNotFound');
        }

        // If OTP is enabled, require OTP token
        if (fullUser.otp_enabled) {
          if (!otpToken) {
            return sendLocalizedError(req, res, 400, 'otpTokenRequired');
          }

          // Get the OTP secret
          const secret = await database.getUserOtpSecret(user.id);
          if (!secret) {
            return res.status(400).json({ error: 'OTP secret not found' });
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

        const tunnel = await database.getTunnelById(tunnelId);
        if (!tunnel || tunnel.user_id !== user.id) {
          return res.status(404).json({ error: 'Tunnel not found' });
        }

        const success = await database.deleteTunnel(tunnelId);
        if (success) {
          res.status(200).json({ message: 'Tunnel deleted successfully' });
        } else {
          sendLocalizedError(req, res, 404, 'tunnelNotFound');
        }
      } catch (error) {
        console.error('Delete tunnel error:', error);
        sendLocalizedError(req, res, 500, 'internalServerError');
      }
      break;

    default:
      sendLocalizedError(req, res, 405, 'methodNotAllowed');
      break;
  }
}
