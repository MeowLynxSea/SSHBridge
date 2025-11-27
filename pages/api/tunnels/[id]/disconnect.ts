import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../../src/database.js';
import { sendLocalizedError } from '../../../../lib/apiErrors.js';

const database = getDatabaseInstance();

async function authenticate(req: NextApiRequest): Promise<{ id: number; username: string } | null> {
  const token = req.headers.authorization?.replace('Bearer ', '');
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
    case 'POST':
      try {
        console.log(
          `[DISCONNECT API] Disconnect request for tunnel ${tunnelId} by user ${user.username}`
        );
        // Get tunnel to verify ownership and get port info
        const tunnel = await database.getTunnelById(tunnelId);
        if (!tunnel || tunnel.user_id !== user.id) {
          console.log(`[DISCONNECT API] Tunnel not found or access denied`);
          return res.status(404).json({ error: 'Tunnel not found' });
        }

        console.log(`[DISCONNECT API] Found tunnel:`, tunnel);

        // Check if tunnel is online in database
        const isOnline = await database.isTunnelWithPortOnline(tunnel.external_port);
        console.log(`[DISCONNECT API] Tunnel online status in database: ${isOnline}`);

        // Even if not online in database, we should still proceed with disconnection
        // to handle cases where SSH connection is gone but TCP server is still running
        if (!isOnline) {
          console.log(
            `[DISCONNECT API] Tunnel not online in database, but will still attempt to close TCP server`
          );
        }

        console.log(`[DISCONNECT API] Marking tunnel as needing closure in database`);
        // Mark tunnel for closure - the SSH server will detect this flag and disconnect
        await database.markTunnelForClosure(tunnelId);

        console.log(`[DISCONNECT API] Tunnel marked for closure`);
        res.status(200).json({ message: 'Tunnel will be disconnected shortly' });
      } catch (error) {
        console.error('Error marking tunnel for closure:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
      break;

    default:
      sendLocalizedError(req, res, 405, 'methodNotAllowed');
      break;
  }
}
