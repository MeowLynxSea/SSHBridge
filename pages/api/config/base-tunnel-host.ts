import { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get BASE_TUNNEL_HOST and BASE_TUNNEL_PORT from environment variables or use defaults
  const baseTunnelHost = process.env.BASE_TUNNEL_HOST || process.env.HOSTNAME || 'localhost';
  const baseTunnelPort = process.env.SSH_PORT || '22';

  res.status(200).json({ baseTunnelHost, baseTunnelPort });
}
