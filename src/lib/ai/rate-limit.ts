export interface RateLimiter {
  /** Förbrukar `cost` enheter för nyckeln. `false` = gränsen nådd, inget förbrukas. */
  take(key: string, cost?: number, nowMs?: number): boolean;
  /** Antal nycklar som har förbrukning kvar i fönstret. */
  size(): number;
}

/**
 * Glidande fönster i minnet. Räcker för en instans; körs sajten på flera
 * servrar behöver gränsen flyttas till en delad lagring (t.ex. Redis).
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }): RateLimiter {
  const usage = new Map<string, number[]>();

  function prune(nowMs: number) {
    for (const [key, times] of usage) {
      if (times.every((t) => nowMs - t >= windowMs)) usage.delete(key);
    }
  }

  return {
    take(key, cost = 1, nowMs = Date.now()) {
      prune(nowMs);
      const recent = (usage.get(key) ?? []).filter((t) => nowMs - t < windowMs);
      if (recent.length + cost > limit) return false;
      usage.set(key, [...recent, ...Array.from({ length: cost }, () => nowMs)]);
      return true;
    },
    size: () => usage.size,
  };
}

/**
 * Klientens IP bakom proxy; okänd klient delar en gemensam kvot. Headern
 * kan förfalskas utan en proxy som skriver över den — därför finns även
 * en global gräns i `limits.ts`.
 */
export function clientKey(request: Request): string {
  const ip =
    request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0];
  return ip?.trim() || "unknown";
}
