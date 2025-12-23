import { randomBytes } from 'crypto';

export function getJwtSecret(): string {
  const configured = process.env.JWT_SECRET?.trim();
  if (configured) return configured;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required when NODE_ENV=production');
  }

  const generated = randomBytes(32).toString('hex');
  process.env.JWT_SECRET = generated;
  console.warn(
    '[SECURITY] JWT_SECRET is not set. Generated a random secret for this process; set JWT_SECRET to keep sessions stable across restarts.'
  );
  return generated;
}

