import type { NextApiRequest, NextApiResponse } from 'next';

function getHostname(hostHeader: string): string {
  const trimmed = hostHeader.trim();
  if (!trimmed) return '';

  // IPv6 host headers look like: "[::1]:3000"
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    if (end > 1) return trimmed.slice(1, end);
  }

  // IPv4/hostname: "localhost:3000"
  return trimmed.split(':')[0] ?? '';
}

function isLocalhostRequest(req?: NextApiRequest): boolean {
  const hostHeader = req?.headers?.host;
  if (typeof hostHeader !== 'string') return false;

  const hostname = getHostname(hostHeader).toLowerCase();
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost')
  );
}

function isHttpsRequest(req?: NextApiRequest): boolean {
  if (!req) return false;

  const forwardedProto = req.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string') {
    // Can be a comma-separated list like "https,http"
    const first = forwardedProto.split(',')[0]?.trim().toLowerCase();
    if (first === 'https') return true;
  }

  const forwardedSsl = req.headers['x-forwarded-ssl'];
  if (typeof forwardedSsl === 'string' && forwardedSsl.trim().toLowerCase() === 'on') {
    return true;
  }

  const socket = req.socket as unknown as { encrypted?: boolean } | undefined;
  return !!socket?.encrypted;
}

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

export function setAuthCookie(res: NextApiResponse, token: string, req?: NextApiRequest) {
  const isProduction = process.env.NODE_ENV === 'production';
  const secure = isProduction && !isLocalhostRequest(req) && isHttpsRequest(req);
  const cookie = [
    `token=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${60 * 60 * 24}`,
    secure ? 'Secure' : null,
  ]
    .filter(Boolean)
    .join('; ');

  appendSetCookie(res, cookie);
}

export function clearAuthCookie(res: NextApiResponse, req?: NextApiRequest) {
  const isProduction = process.env.NODE_ENV === 'production';
  const secure = isProduction && !isLocalhostRequest(req) && isHttpsRequest(req);
  const cookie = [
    'token=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    secure ? 'Secure' : null,
  ]
    .filter(Boolean)
    .join('; ');

  appendSetCookie(res, cookie);
}
