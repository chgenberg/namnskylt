import { createRateLimiter } from "./rate-limit";

/** Varje ritad form är en bildgenerering som kostar pengar: så här många får en besökare rita per timme. */
export const SHAPE_DRAWINGS_PER_HOUR = 5;
/** Tak per dygn för hela sajten, så att förfalskade IP-adresser inte ger obegränsat med bilder. */
export const SITE_SHAPE_DRAWINGS_PER_DAY = 300;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Vems gräns som är nådd: besökarens egen eller sajtens tak för dygnet. */
export type ShapeLimitHit = "client" | "site";

export const SHAPE_LIMIT_TEXT: Record<ShapeLimitHit, string> = {
  client: "Du har ritat flera former på kort tid. Försök igen om en stund, eller ladda upp en egen fil.",
  site: "Ritfunktionen har nått dagens gräns. Börja från ett förslag eller ladda upp en egen fil, och försök igen i morgon.",
};

interface ShapeLimits {
  /** Förbrukar ett försök. `null` = det ryms, annars vilken gräns som stoppade. */
  take(client: string, nowMs?: number): ShapeLimitHit | null;
}

/**
 * Gränserna för ritade former, i processens minne. Besökarens gräns prövas
 * först: annars kunde en enda besökare över sin gräns äta upp sajtens tak
 * utan att en enda bild ritades.
 */
export function createShapeLimits(): ShapeLimits {
  const perClient = createRateLimiter({ limit: SHAPE_DRAWINGS_PER_HOUR, windowMs: HOUR_MS });
  const site = createRateLimiter({ limit: SITE_SHAPE_DRAWINGS_PER_DAY, windowMs: DAY_MS });
  return {
    take(client, nowMs = Date.now()) {
      if (!perClient.take(client, 1, nowMs)) return "client";
      return site.take("site", 1, nowMs) ? null : "site";
    },
  };
}
