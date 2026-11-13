import { availableHalfWidth } from "./shape";
import type { BadgeDocument, Mm } from "./types";

/**
 * Fästet på baksidan ska inte sticka ut bakom skylten. Ämnena är breda nog
 * där fästet sitter, men en egen form kan vara smal just där — en stjärnas
 * udd, en pil. Här flyttas fästet i höjdled och förminskas om det behövs.
 */

/** Ytan fästet täcker på baksidan: en rektangel mitt på skylten i sidled. */
export interface HardwareFootprint {
  widthMm: Mm;
  heightMm: Mm;
  /** Rektangelns mitt, mätt från skyltens överkant. */
  centerYMm: Mm;
}

interface HardwareFit {
  centerYMm: Mm;
  /** 1 = full storlek. */
  scale: number;
}

/** Luft mellan fästet och skyltens kant. */
const EDGE_MARGIN_MM = 1.5;
/** Storlekarna som prövas, störst först. */
const SCALES = [1, 0.75, 0.55, 0.4] as const;
const SHIFT_STEP_MM = 2;

function fitsAt(doc: BadgeDocument, widthMm: Mm, heightMm: Mm, centerYMm: Mm): boolean {
  const top = centerYMm - heightMm / 2;
  const bottom = centerYMm + heightMm / 2;
  if (top < EDGE_MARGIN_MM || bottom > doc.size.heightMm - EDGE_MARGIN_MM) return false;
  return availableHalfWidth(doc, EDGE_MARGIN_MM, top, bottom) * 2 >= widthMm;
}

/**
 * Var fästet får plats: i full storlek så nära sin vanliga höjd som möjligt,
 * annars förminskat. Ett ämne har alltid fästet på sin vanliga plats.
 */
export function fitHardware(doc: BadgeDocument, footprint: HardwareFootprint): HardwareFit {
  const nominal: HardwareFit = { centerYMm: footprint.centerYMm, scale: 1 };
  if (doc.shape !== "custom") return nominal;
  const steps = Math.ceil(doc.size.heightMm / SHIFT_STEP_MM);
  for (const scale of SCALES) {
    const widthMm = footprint.widthMm * scale;
    const heightMm = footprint.heightMm * scale;
    for (let step = 0; step <= steps; step++) {
      // Närmast först: den vanliga höjden, sedan lika långt nedåt och uppåt.
      for (const shift of step === 0 ? [0] : [step * SHIFT_STEP_MM, -step * SHIFT_STEP_MM]) {
        const centerYMm = footprint.centerYMm + shift;
        if (fitsAt(doc, widthMm, heightMm, centerYMm)) return { centerYMm, scale };
      }
    }
  }
  return { centerYMm: footprint.centerYMm, scale: SCALES[SCALES.length - 1] ?? 1 };
}
