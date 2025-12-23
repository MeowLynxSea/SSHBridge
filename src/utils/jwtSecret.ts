import { randomBytes } from 'crypto';
import { loadEnv } from './loadEnv.js';

export function getJwtSecret(): string {
  loadEnv();
  const configured = process.env.JWT_SECRET?.trim();
  if (configured) {
    if (configured === 'your-jwt-secret-key-here') {
      console.warn(
        '[SECURITY] JWT_SECRET is set to the example value. Set a strong random secret to keep sessions secure and stable.'
      );
    }
    return configured;
  }

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
