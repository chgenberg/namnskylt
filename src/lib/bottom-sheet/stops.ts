/**
 * Bladet med skyltmotorns val på telefon (beslut av ägaren 2026-11-24, efter Merchin): skylten står
 * stor överst, och valen ligger i ett blad som dras upp underifrån. Bladet har tre lägen: litet
 * (greppet, genvägarna och prisraden), halvt och helt. Här står bara reglerna för lägena, så att de
 * går att testa; bladet själv är `useBottomSheet` i skyltmotorn.
 */

export type SheetStop = "small" | "half" | "full";

const STOPS: readonly SheetStop[] = ["small", "half", "full"];

/** Bladets höjd i varje läge, i pixlar. */
export interface SheetHeights {
  small: number;
  half: number;
  full: number;
}

/** Ett drag som är så här snabbt, i pixlar per millisekund, går ett läge åt sitt håll var det än släpps. */
export const FLICK_PX_PER_MS = 0.5;

/** Ett tryck på greppet stegar litet, halvt, helt och tillbaka till litet. */
export function nextSheetStop(stop: SheetStop): SheetStop {
  return STOPS[(STOPS.indexOf(stop) + 1) % STOPS.length]!;
}

/** Höjden ett drag ger, inom bladets minsta och största höjd. */
export function clampSheetHeight(height: number, heights: SheetHeights): number {
  return Math.min(heights.full, Math.max(heights.small, height));
}

interface SnapInput {
  /** Läget draget började i. */
  from: SheetStop;
  /** Bladets höjd när fingret släpptes. */
  height: number;
  /** Fart i pixlar per millisekund. Positiv när bladet dras uppåt, alltså växer. */
  velocity: number;
  heights: SheetHeights;
}

/**
 * Läget bladet stannar i när det släpps: ett snabbt drag går ett läge åt sitt håll från där det
 * började, annars stannar bladet i det läge vars höjd ligger närmast.
 */
export function snapSheet({ from, height, velocity, heights }: SnapInput): SheetStop {
  if (Math.abs(velocity) >= FLICK_PX_PER_MS) {
    const index = STOPS.indexOf(from) + Math.sign(velocity);
    return STOPS[Math.min(STOPS.length - 1, Math.max(0, index))]!;
  }
  return STOPS.reduce((best, stop) => (Math.abs(heights[stop] - height) < Math.abs(heights[best] - height) ? stop : best));
}
