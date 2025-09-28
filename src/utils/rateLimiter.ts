export interface RateLimiter {
  isRateLimited(id: number): boolean;
}

export function createRateLimiter(windowMs: number, maxRequests: number): RateLimiter {
  const map = new Map<number, number[]>();
  function isRateLimited(id: number): boolean {
    const now = Date.now();
    const arr = map.get(id) || [];
    const fresh = arr.filter(t => now - t < windowMs);
    fresh.push(now);
    map.set(id, fresh);
    return fresh.length > maxRequests;
  }
  return { isRateLimited };
}
