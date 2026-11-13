import { CUSTOM_SHAPE_LIMITS } from "./catalog";
import { crossingEdgePairs, type CustomOutlineIssue } from "./custom-outline";
import { edgeLength, round2 } from "./outline-math";
import type { Point } from "./shape";
import { SHAPE_PRESETS, presetOutline, type ShapePreset } from "./shape-presets";
import type { Mm } from "./types";

/**
 * Ritverktygets handgrepp på en egen form: flytta, lägg till och ta bort
 * punkter, och läs av det kunden behöver se medan hon ritar. Allt i mm inom
 * skyltens mått, rent och utan DOM.
 */

interface Box {
  widthMm: Mm;
  heightMm: Mm;
}

function nextOf(points: readonly Point[], index: number): Point | undefined {
  return points[(index + 1) % points.length];
}

function midpoint(a: Point, b: Point): Point {
  return { x: round2((a.x + b.x) / 2), y: round2((a.y + b.y) / 2) };
}

/** Håller en punkt inom måttrutan, på hundradels millimeter. */
function clampOutlinePoint(point: Point, box: Box): Point {
  return {
    x: round2(Math.min(box.widthMm, Math.max(0, point.x))),
    y: round2(Math.min(box.heightMm, Math.max(0, point.y))),
  };
}

/** Flyttar punkten `index` till `to`, klampad till måttrutan. */
export function moveOutlinePoint(points: readonly Point[], index: number, to: Point, box: Box): Point[] {
  return points.map((p, i) => (i === index ? clampOutlinePoint(to, box) : p));
}

/**
 * Lägger en ny punkt mitt på kanten från punkten `edge` till nästa. Den nya
 * punkten får index `edge + 1`. Oförändrad när formen redan har högsta antalet.
 */
export function insertOutlinePoint(points: readonly Point[], edge: number): Point[] {
  const a = points[edge];
  const b = nextOf(points, edge);
  if (!a || !b || points.length >= CUSTOM_SHAPE_LIMITS.maxPoints) return [...points];
  return [...points.slice(0, edge + 1), midpoint(a, b), ...points.slice(edge + 1)];
}

/** Tar bort punkten `index`. Oförändrad när formen bara har det minsta antalet kvar. */
export function removeOutlinePoint(points: readonly Point[], index: number): Point[] {
  if (points.length <= CUSTOM_SHAPE_LIMITS.minPoints || !points[index]) return [...points];
  return points.filter((_, i) => i !== index);
}

interface OutlineCorner {
  /** Kanten från föregående punkt. */
  prevEdgeMm: Mm;
  /** Kanten till nästa punkt. */
  nextEdgeMm: Mm;
  /** Vinkeln mellan de två kanterna, 0–180°. Ett rakt streck är 180°. */
  angleDeg: number;
}

/** Måtten vid en hörnpunkt: de två grannkanternas längd och vinkeln mellan dem. */
export function outlineCorner(points: readonly Point[], index: number): OutlineCorner | null {
  const n = points.length;
  const cur = points[index];
  const prev = points[(index + n - 1) % n];
  const next = nextOf(points, index);
  if (n < 3 || !cur || !prev || !next) return null;
  const prevEdgeMm = edgeLength(prev, cur);
  const nextEdgeMm = edgeLength(cur, next);
  if (prevEdgeMm === 0 || nextEdgeMm === 0) return { prevEdgeMm, nextEdgeMm, angleDeg: 0 };
  const cos = ((prev.x - cur.x) * (next.x - cur.x) + (prev.y - cur.y) * (next.y - cur.y)) / (prevEdgeMm * nextEdgeMm);
  return { prevEdgeMm, nextEdgeMm, angleDeg: (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI };
}

/** Mitten på kanten från punkten `edge` till nästa — där handtaget för en ny punkt sitter. */
export function outlineEdgeMidpoint(points: readonly Point[], edge: number): Point | null {
  const a = points[edge];
  const b = nextOf(points, edge);
  return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
}

/**
 * Kanterna som går att dela: minst `minLengthMm` långa, och inga alls när
 * formen redan har högsta antalet punkter. Svaret är kanternas startpunkter.
 */
export function splittableEdges(points: readonly Point[], minLengthMm: Mm): number[] {
  if (points.length >= CUSTOM_SHAPE_LIMITS.maxPoints) return [];
  return points.flatMap((a, i) => (edgeLength(a, nextOf(points, i) ?? a) >= minLengthMm ? [i] : []));
}

/** Den längsta av kanterna `among` (alla om inget anges), eller `null` för en tom form. */
export function longestEdge(points: readonly Point[], among?: readonly number[]): number | null {
  const candidates = among ?? points.map((_, i) => i);
  let best: number | null = null;
  let bestLength = -1;
  for (const i of candidates) {
    const a = points[i];
    const b = nextOf(points, i);
    const length = a && b ? edgeLength(a, b) : -1;
    if (length > bestLength) {
      best = i;
      bestLength = length;
    }
  }
  return best;
}

export type OutlineHandle = { kind: "point"; index: number } | { kind: "edge"; index: number };

/**
 * Handtaget närmast `at` inom `reachMm`: en hörnpunkt, eller mitten på en av
 * kanterna `edges`. En hörnpunkt vinner när den ligger lika nära som en kant.
 */
export function nearestOutlineHandle(
  points: readonly Point[],
  at: Point,
  reachMm: Mm,
  edges: readonly number[] = [],
): OutlineHandle | null {
  let best: OutlineHandle | null = null;
  let bestDistance = reachMm;
  for (const [index, p] of points.entries()) {
    const distance = edgeLength(p, at);
    if (distance <= bestDistance) {
      best = { kind: "point", index };
      bestDistance = distance;
    }
  }
  for (const index of edges) {
    const mid = outlineEdgeMidpoint(points, index);
    const distance = mid ? edgeLength(mid, at) : Infinity;
    if (distance < bestDistance) {
      best = { kind: "edge", index };
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Kanterna som orsakar felet, så att ritverktyget kan peka ut dem: de för
 * korta, eller de som korsar en annan kant. Övriga fel gäller hela formen.
 */
export function outlineIssueEdges(points: readonly Point[], issue: CustomOutlineIssue | null): number[] {
  if (issue === "short-edge") {
    return points.flatMap((a, i) => (edgeLength(a, nextOf(points, i) ?? a) < CUSTOM_SHAPE_LIMITS.minEdgeMm ? [i] : []));
  }
  if (issue !== "crossing") return [];
  const touching = new Set<number>();
  for (const [i, j] of crossingEdgePairs(points)) touching.add(i).add(j);
  return [...touching].sort((p, q) => p - q);
}

/** Avrundning och omskalning kan flytta en punkt några hundradelar; så nära räknas som samma form. */
const PRESET_TOLERANCE_MM = 0.05;

/** Formförslaget som konturen fortfarande är, i skyltens nuvarande mått, eller `null` när kunden har ritat om den. */
export function matchingShapePreset(points: readonly Point[], size: Box): ShapePreset | null {
  return (
    SHAPE_PRESETS.find((preset) => {
      const outline = presetOutline(preset, size.widthMm, size.heightMm);
      return (
        outline.length === points.length &&
        outline.every((p, i) => {
          const q = points[i];
          return q !== undefined && Math.abs(p.x - q.x) <= PRESET_TOLERANCE_MM && Math.abs(p.y - q.y) <= PRESET_TOLERANCE_MM;
        })
      );
    }) ?? null
  );
}

/**
 * Nytt mått med formens proportioner kvar: den ändrade sidan styr och den andra
 * följer med. Skalan hålls inom det som får plats mellan minsta och största sida,
 * så en avlång form kan inte krympas längre än att kortsidan når gränsen.
 */
export function proportionalCustomSize(size: Box, change: { widthMm?: Mm; heightMm?: Mm }): Box {
  const { minSideMm, maxSideMm } = CUSTOM_SHAPE_LIMITS;
  const wanted =
    change.widthMm !== undefined ? change.widthMm / size.widthMm : change.heightMm !== undefined ? change.heightMm / size.heightMm : 1;
  const smallest = minSideMm / Math.min(size.widthMm, size.heightMm);
  const largest = maxSideMm / Math.max(size.widthMm, size.heightMm);
  // En form som redan är både så smal och så lång som det går kan inte skalas alls.
  const scale = smallest > largest ? 1 : Math.min(largest, Math.max(smallest, wanted));
  const clamp = (side: Mm) => Math.min(maxSideMm, Math.max(minSideMm, Math.round(side * scale)));
  return { widthMm: clamp(size.widthMm), heightMm: clamp(size.heightMm) };
}
