type Headers = Record<string, string | string[] | undefined>;

export interface RateLimitedRequest {
  headers: Headers;
  socket?: { remoteAddress?: string | null };
}

const buckets = new Map<string, { count: number; resetAt: number }>();

export function getClientIp(req: RateLimitedRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const firstForwarded =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : Array.isArray(forwarded)
        ? forwarded[0]
        : '';
  return firstForwarded || req.socket?.remoteAddress || 'unknown';
}

export function rateLimit(
  key: string,
  {
    windowMs,
    max,
  }: {
    windowMs: number;
    max: number;
  }
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();

  // Best-effort cleanup
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
