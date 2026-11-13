import type { Point } from "./shape";
import type { Mm } from "./types";

/** Delade räknesätt för konturer. Internt för motorn — exporteras inte från `@/engine`. */

/** Arean med tecken: positiv när punkterna går medurs på skärmen (y nedåt). */
export function signedArea(points: readonly Point[]): number {
  return (
    points.reduce((sum, a, i) => {
      const b = points[(i + 1) % points.length] ?? a;
      return sum + a.x * b.y - b.x * a.y;
    }, 0) / 2
  );
}

export function edgeLength(a: Point, b: Point): Mm {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Avrundar till hundradels millimeter. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
