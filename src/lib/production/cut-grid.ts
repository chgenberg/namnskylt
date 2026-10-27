/**
 * Skärlinjer som ett sammanhängande rutnät i stället för en ruta per skylt.
 * Skyltar kant i kant delar linje, så maskinen kör varje linje en gång.
 */

const TOLERANCE_MM = 0.1;

export interface CutGridCandidate {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  /** Raka sidorna stannar vid tangentpunkten; hörnbågen genomskärs för sig. */
  cornerRadiusMm: number;
}

export interface CutGrid {
  horizontal: Array<{ yMm: number; x1Mm: number; x2Mm: number }>;
  vertical: Array<{ xMm: number; y1Mm: number; y2Mm: number }>;
}

interface Interval {
  a: number;
  b: number;
}

function roundKey(value: number): number {
  return Math.round(value / TOLERANCE_MM) * TOLERANCE_MM;
}

function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].sort((l, r) => l.a - r.a || l.b - r.b);
  const merged: Interval[] = [];
  for (const next of sorted) {
    const current = merged.at(-1);
    if (current && next.a <= current.b + TOLERANCE_MM) current.b = Math.max(current.b, next.b);
    else merged.push({ ...next });
  }
  return merged;
}

function addInterval(byKey: Map<number, Interval[]>, key: number, a: number, b: number): void {
  if (b - a <= TOLERANCE_MM) return;
  const list = byKey.get(key) ?? [];
  list.push({ a, b });
  byKey.set(key, list);
}

/**
 * Varje kant kortas med skyltens egen hörnradie före sammanslagningen. Kortas
 * det sammanslagna segmentet försvinner skäret även för grannen som delar linjen.
 */
export function computeCutGrid(list: readonly CutGridCandidate[]): CutGrid {
  const hByY = new Map<number, Interval[]>();
  const vByX = new Map<number, Interval[]>();

  for (const p of list) {
    if (!(p.widthMm > 0) || !(p.heightMm > 0)) continue;
    const r = Math.max(0, Math.min(p.cornerRadiusMm, p.widthMm / 2, p.heightMm / 2));
    const x2 = p.xMm + p.widthMm;
    const y2 = p.yMm + p.heightMm;
    addInterval(hByY, roundKey(p.yMm), p.xMm + r, x2 - r);
    addInterval(hByY, roundKey(y2), p.xMm + r, x2 - r);
    addInterval(vByX, roundKey(p.xMm), p.yMm + r, y2 - r);
    addInterval(vByX, roundKey(x2), p.yMm + r, y2 - r);
  }

  const byKey = (map: Map<number, Interval[]>) =>
    [...map.entries()].sort((l, r) => l[0] - r[0]).flatMap(([key, intervals]) =>
      mergeIntervals(intervals).map((interval) => ({ key, ...interval })),
    );

  return {
    horizontal: byKey(hByY).map(({ key, a, b }) => ({ yMm: key, x1Mm: a, x2Mm: b })),
    vertical: byKey(vByX).map(({ key, a, b }) => ({ xMm: key, y1Mm: a, y2Mm: b })),
  };
}
