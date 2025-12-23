import type { NextApiRequest, NextApiResponse } from 'next';

export function getAuthToken(req: NextApiRequest): string | null {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    if (token) return token;
  }

  const cookieToken = req.cookies?.token;
  return cookieToken || null;
}

function appendSetCookie(res: NextApiResponse, cookie: string) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookie);
    return;
  }
  if (typeof existing === 'string') {
    res.setHeader('Set-Cookie', [existing, cookie]);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookie]);
    return;
  }
  res.setHeader('Set-Cookie', cookie);
}

export function setAuthCookie(res: NextApiResponse, token: string) {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookie = [
    `token=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${60 * 60 * 24}`,
    isProduction ? 'Secure' : null,
  ]
    .filter(Boolean)
    .join('; ');

  appendSetCookie(res, cookie);
}

export function clearAuthCookie(res: NextApiResponse) {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookie = [
    'token=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    isProduction ? 'Secure' : null,
  ]
    .filter(Boolean)
    .join('; ');

  appendSetCookie(res, cookie);
}
