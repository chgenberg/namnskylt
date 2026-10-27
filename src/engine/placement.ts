import { availableHalfWidth } from "./shape";
import type { BadgeDocument, Mm, Offset, Rect } from "./types";

export const ZERO_OFFSET: Offset = { xMm: 0, yMm: 0 };

/** Steg mot mitten när en oval blir för smal där kunden släppte. */
const NARROW_SEARCH_STEPS = 48;
const EPS_MM = 1e-6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function moveRect(rect: Rect, offset: Offset): Rect {
  return { ...rect, x: rect.x + offset.xMm, y: rect.y + offset.yMm };
}

export function unionRect(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Förflyttningar i sidled där alla rutor ryms i zonen på höjden `dy`. */
function horizontalRange(doc: BadgeDocument, insetMm: Mm, boxes: readonly Rect[], dy: Mm) {
  const center = doc.size.widthMm / 2;
  let lo = -Infinity;
  let hi = Infinity;
  for (const box of boxes) {
    const half = availableHalfWidth(doc, insetMm, box.y + dy, box.y + box.height + dy);
    lo = Math.max(lo, center - half - box.x);
    hi = Math.min(hi, center + half - (box.x + box.width));
  }
  return { lo, hi };
}

export interface SnappedOffset {
  offset: Offset;
  /** Rutans mitt ligger på skyltens lodräta respektive vågräta mittlinje. */
  centerX: boolean;
  centerY: boolean;
}

/** Drar rutan till skyltens mittlinjer när dess mitt hamnar inom `thresholdMm`. */
export function snapToCenter(doc: BadgeDocument, autoBox: Rect, desired: Offset, thresholdMm: Mm): SnappedOffset {
  const toCenterX = doc.size.widthMm / 2 - (autoBox.x + autoBox.width / 2);
  const toCenterY = doc.size.heightMm / 2 - (autoBox.y + autoBox.height / 2);
  const centerX = Math.abs(desired.xMm - toCenterX) <= thresholdMm;
  const centerY = Math.abs(desired.yMm - toCenterY) <= thresholdMm;
  return {
    offset: { xMm: centerX ? toCenterX : desired.xMm, yMm: centerY ? toCenterY : desired.yMm },
    centerX,
    centerY,
  };
}

/**
 * Den förflyttning närmast `desired` där alla rutor ligger inom
 * säkerhetszonen: skyltens kontur indragen `insetMm`. Rutorna flyttas
 * tillsammans (textraderna följer sitt block). Ryms de inte alls centreras de.
 */
export function clampOffset(doc: BadgeDocument, insetMm: Mm, boxes: readonly Rect[], desired: Offset): Offset {
  const bounds = unionRect(boxes);
  if (!bounds) return ZERO_OFFSET;
  const minY = insetMm - bounds.y;
  const maxY = doc.size.heightMm - insetMm - (bounds.y + bounds.height);
  const centerY = (minY + maxY) / 2;
  const startY = minY <= maxY ? clamp(desired.yMm, minY, maxY) : centerY;
  for (let step = 0; step <= NARROW_SEARCH_STEPS; step++) {
    const dy = startY + ((centerY - startY) * step) / NARROW_SEARCH_STEPS;
    const { lo, hi } = horizontalRange(doc, insetMm, boxes, dy);
    if (lo <= hi + EPS_MM) return { xMm: clamp(desired.xMm, lo, Math.max(lo, hi)), yMm: dy };
  }
  return { xMm: doc.size.widthMm / 2 - (bounds.x + bounds.width / 2), yMm: centerY };
}
