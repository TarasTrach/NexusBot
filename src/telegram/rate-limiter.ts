export class RateLimiter {
  private readonly map = new Map<number, number[]>();

  constructor(
    private readonly windowMs: number,
    private readonly maxRequests: number
  ) {}

  isRateLimited(id: number): boolean {
    const now = Date.now();
    const fresh = (this.map.get(id) || []).filter((t) => now - t < this.windowMs);
    fresh.push(now);
    this.map.set(id, fresh);
    return fresh.length > this.maxRequests;
  }
}
