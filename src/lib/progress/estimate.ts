/** Ett steg i en väntan, med procenten där det börjar. */
export type ProgressStep = readonly [fromPercent: number, label: string];

/** Uppskattningen stannar här tills jobbet faktiskt är klart. */
export const ESTIMATE_CEILING_PERCENT = 95;
/** Andel av taket som nås vid den förväntade tiden. */
const EXPECTED_SHARE = 0.84;
const ESTIMATE_RATE = -Math.log(1 - EXPECTED_SHARE);

/**
 * Procent för en väntan med okänd längd: snabbt i början, ~80 % vid den
 * förväntade tiden och sedan allt långsammare mot taket — aldrig 100 förrän klart.
 */
export function estimatedPercent(elapsedMs: number, expectedMs: number): number {
  if (elapsedMs <= 0 || expectedMs <= 0) return 0;
  return ESTIMATE_CEILING_PERCENT * (1 - Math.exp((-ESTIMATE_RATE * elapsedMs) / expectedMs));
}

/** Procent för en väntan med känd längd, t.ex. en inspelning. */
export function timedPercent(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return ESTIMATE_CEILING_PERCENT;
  return clampPercent((elapsedMs / durationMs) * 100, ESTIMATE_CEILING_PERCENT);
}

export function clampPercent(percent: number, max = 100): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(max, Math.max(0, percent));
}

/** Index för steget som pågår vid en viss procent; -1 om inga steg finns. */
export function stepIndexAt(steps: readonly ProgressStep[], percent: number): number {
  let index = steps.length > 0 ? 0 : -1;
  steps.forEach(([fromPercent], i) => {
    if (percent >= fromPercent) index = i;
  });
  return index;
}
