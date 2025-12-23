/**
 * Enhanced RateLimiter that integrates with TCP connections
 * Maintains protocol integrity by queuing complete packets
 */

export interface TokenBucket {
  capacity: number;
  tokens: number;
  refillRate: number;
  lastRefill: number;
  tunnelId: number;
  direction: 'upload' | 'download';
}

export interface BandwidthConfig {
  maxBandwidth: number;
  burstFactor: number;
  enableShaping: boolean;
}

export class IntegratedRateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private refillInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Refill tokens every 100ms for smooth rate limiting
    this.refillInterval = setInterval(() => {
      this.refillAllBuckets();
    }, 100);
  }

  /**
   * Initialize or update a bandwidth bucket
   * @param bucketKey Unique key for this tunnel-connection combination (e.g., "tunnelId:connectionId")
   */
  initBucket(bucketKey: string, config: BandwidthConfig, direction: 'upload' | 'download'): void {
    const key = `${bucketKey}:${direction}`;
    const capacity = Math.floor(config.maxBandwidth * config.burstFactor);
    const now = Date.now();

    if (this.buckets.has(key)) {
      const bucket = this.buckets.get(key)!;
      bucket.capacity = capacity;
      bucket.refillRate = config.maxBandwidth;
      if (bucket.tokens > capacity) {
        bucket.tokens = capacity;
      }
    } else {
      this.buckets.set(key, {
        capacity,
        tokens: capacity, // Start full to allow burst
        refillRate: config.maxBandwidth,
        lastRefill: now,
        tunnelId: parseInt(bucketKey.split(':')[0], 10), // Extract tunnel ID from key
        direction,
      });
    }
  }

  /**
   * Process data through rate limiter
   * Returns the data to send (possibly delayed for rate limiting)
   * Uses a non-blocking approach with token tracking
   */
  processData(
    tunnelId: number,
    data: Buffer,
    direction: 'upload' | 'download'
  ): {
    shouldSend: boolean;
    delay: number;
  } {
    // Backwards-compatible lookup: buckets are keyed by "tunnelId:connectionId:direction",
    // but some callers may only have a tunnelId.
    const legacyKey = this.getBucketKey(tunnelId, direction);
    let bucket: TokenBucket | undefined = this.buckets.get(legacyKey);
    for (const candidate of this.buckets.values()) {
      if (candidate.tunnelId === tunnelId && candidate.direction === direction) {
        bucket = candidate;
        break;
      }
    }

    if (!bucket) {
      // No bandwidth limit - send immediately
      return { shouldSend: true, delay: 0 };
    }

    this.refillBucket(bucket);

    if (bucket.tokens >= data.length) {
      // Enough tokens - consume and send immediately
      bucket.tokens -= data.length;
      return { shouldSend: true, delay: 0 };
    } else {
      // Not enough tokens - calculate delay needed
      const tokensNeeded = data.length - bucket.tokens;
      const delayMs = (tokensNeeded / bucket.refillRate) * 1000;

      return {
        shouldSend: false,
        delay: Math.min(delayMs, 1000), // Cap at 1 second
      };
    }
  }

  /**
   * Synchronous write with rate limiting
   * Actually blocks data transmission until tokens are available
   */
  async writeWithRateLimit(
    bucketKey: string,
    data: Buffer,
    direction: 'upload' | 'download'
  ): Promise<void> {
    const key = `${bucketKey}:${direction}`;
    const bucket = this.buckets.get(key);

    if (!bucket) {
      // No bandwidth limit - send immediately
      return;
    }

    // Keep trying until tokens are available
    while (true) {
      this.refillBucket(bucket);

      if (bucket.tokens >= data.length) {
        // Enough tokens available - consume them and allow sending
        bucket.tokens -= data.length;
        return; // Allow the actual data write to proceed
      }

      // Not enough tokens - wait for refill
      const tokensNeeded = data.length - bucket.tokens;
      const delayMs = (tokensNeeded / bucket.refillRate) * 1000;

      // Wait (minimum 10ms to avoid busy loop)
      await new Promise<void>((resolve) => setTimeout(resolve, Math.max(delayMs, 10)));
    }
  }

  /**
   * Try to consume tokens for immediate sending (backwards compatibility)
   * @param bucketKey Unique key for this tunnel-connection combination
   */
  consume(bucketKey: string, bytes: number, direction: 'upload' | 'download'): boolean {
    const key = `${bucketKey}:${direction}`;
    const bucket = this.buckets.get(key);

    if (!bucket) {
      return true;
    }

    this.refillBucket(bucket);
    if (bucket.tokens >= bytes) {
      bucket.tokens -= bytes;
      return true;
    }
    return false;
  }

  /**
   * Legacy shapeTraffic method - now uses improved rate limiting
   * @param bucketKey Unique key for this tunnel-connection combination
   */
  async shapeTraffic(
    bucketKey: string,
    data: Buffer,
    direction: 'upload' | 'download'
  ): Promise<void> {
    await this.writeWithRateLimit(bucketKey, data, direction);
  }

  /**
   * Remove bandwidth bucket
   * @param bucketKey Unique key for this tunnel-connection combination
   */
  removeBucket(bucketKey: string, direction?: 'upload' | 'download'): void {
    if (direction) {
      const key = `${bucketKey}:${direction}`;
      this.buckets.delete(key);
    } else {
      this.buckets.delete(`${bucketKey}:upload`);
      this.buckets.delete(`${bucketKey}:download`);
    }
  }

  /**
   * Refill tokens for a specific bucket
   */
  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const timeDiff = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = Math.floor(bucket.refillRate * timeDiff);

    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  /**
   * Refill tokens for all buckets
   */
  private refillAllBuckets(): void {
    const now = Date.now();
    this.buckets.forEach((bucket) => {
      const timeDiff = (now - bucket.lastRefill) / 1000;
      const tokensToAdd = Math.floor(bucket.refillRate * timeDiff);

      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    });
  }

  /**
   * Get bucket key
   */
  private getBucketKey(tunnelId: number, direction: 'upload' | 'download'): string {
    return `${tunnelId}:${direction}`;
  }

  /**
   * Get bucket statistics
   * @param bucketKey Unique key for this tunnel-connection combination
   */
  getBucketStats(
    bucketKey: string,
    direction: 'upload' | 'download'
  ): {
    tokens: number;
    capacity: number;
    refillRate: number;
    utilization: number;
  } | null {
    const key = `${bucketKey}:${direction}`;
    const bucket = this.buckets.get(key);

    if (!bucket) {
      return null;
    }

    this.refillBucket(bucket);

    return {
      tokens: bucket.tokens,
      capacity: bucket.capacity,
      refillRate: bucket.refillRate,
      utilization: 1 - bucket.tokens / bucket.capacity,
    };
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.refillInterval) {
      clearInterval(this.refillInterval);
      this.refillInterval = null;
    }
    this.buckets.clear();
  }
}
