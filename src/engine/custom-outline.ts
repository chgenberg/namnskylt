import { CUSTOM_SHAPE_LIMITS } from "./catalog";
import type { Point } from "./shape";
import type { Mm } from "./types";
import { edgeLength, round2, signedArea } from "./outline-math";

/**
 * Egen form: en sluten polygon som kunden ritat, i mm inom skyltens mått
 * (origo övre vänstra hörnet, y nedåt). Formen får ha inbuktningar men får
 * inte korsa sig själv. Hörnen rundas med en gemensam radie.
 */

export function polygonArea(points: readonly Point[]): number {
  return Math.abs(signedArea(points));
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Korsar eller nuddar sträckorna varandra någon annanstans än i en delad ändpunkt? */
export function segmentsTouch(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  const within = (p: Point, q: Point, r: Point) =>
    Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  return (o1 === 0 && within(a, b, c)) || (o2 === 0 && within(a, b, d)) || (o3 === 0 && within(c, d, a)) || (o4 === 0 && within(c, d, b));
}

/**
 * Kantparen som korsar eller nuddar varandra; kant `i` går från punkt `i` till nästa.
 * Samma regel avgör om formen är giltig och vilka kanter ritverktyget pekar ut.
 */
export function* crossingEdgePairs(points: readonly Point[]): Generator<[number, number]> {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Grannkanter delar en punkt och räknas inte.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const a = points[i];
      const b = points[(i + 1) % n];
      const c = points[j];
      const d = points[(j + 1) % n];
      if (a && b && c && d && segmentsTouch(a, b, c, d)) yield [i, j];
    }
  }
}

/** En enkel polygon korsar inte sig själv — det enda en skärmaskin kan följa. */
export function isSimplePolygon(points: readonly Point[]): boolean {
  return crossingEdgePairs(points).next().done === true;
}

export type CustomOutlineIssue = "points" | "outside" | "short-edge" | "crossing" | "area";

export const CUSTOM_OUTLINE_ISSUE_TEXT: Record<CustomOutlineIssue, string> = {
  points: `Formen ska ha mellan ${CUSTOM_SHAPE_LIMITS.minPoints} och ${CUSTOM_SHAPE_LIMITS.maxPoints} punkter`,
  outside: "Formen går utanför skyltens mått",
  "short-edge": `En kant är kortare än ${CUSTOM_SHAPE_LIMITS.minEdgeMm} mm`,
  crossing: "Formen korsar sig själv",
  area: "Formen är för liten för att graveras",
};

/** Punkter på 0,01 mm när kan hamna en hårsmån utanför efter omskalning. */
const BOX_TOLERANCE_MM = 0.05;

/** Första felet som gör att formen inte går att skära, eller `null`. */
export function customOutlineIssue(points: readonly Point[], size: { widthMm: Mm; heightMm: Mm }): CustomOutlineIssue | null {
  const limits = CUSTOM_SHAPE_LIMITS;
  if (points.length < limits.minPoints || points.length > limits.maxPoints) return "points";
  if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return "points";
  const outside = (p: Point) =>
    p.x < -BOX_TOLERANCE_MM || p.y < -BOX_TOLERANCE_MM || p.x > size.widthMm + BOX_TOLERANCE_MM || p.y > size.heightMm + BOX_TOLERANCE_MM;
  if (points.some(outside)) return "outside";
  if (points.some((p, i) => edgeLength(p, points[(i + 1) % points.length] ?? p) < limits.minEdgeMm)) return "short-edge";
  if (!isSimplePolygon(points)) return "crossing";
  if (polygonArea(points) < limits.minAreaMm2) return "area";
  return null;
}

/** Trimmet längs en kant får aldrig äta mer än knappt halva kanten, så två hörn inte möts. */
const MAX_TRIM_SHARE = 0.49;
const ARC_STEPS = 6;
const STRAIGHT_EPS = 1e-3;

/**
 * Rundar varje hörn med samma radie och returnerar konturen som en tät
 * polygon. Ett hörn med korta grannkanter får en mindre radie. Inbuktade hörn
 * rundas inåt — skärverktyget kan ändå inte göra ett skarpt innerhörn.
 */
export function roundPolygon(points: readonly Point[], radiusMm: Mm): Point[] {
  if (radiusMm <= 0 || points.length < 3) return [...points];
  const n = points.length;
  return points.flatMap((cur, i) => {
    const prev = points[(i + n - 1) % n] ?? cur;
    const next = points[(i + 1) % n] ?? cur;
    const len1 = edgeLength(cur, prev);
    const len2 = edgeLength(cur, next);
    if (len1 === 0 || len2 === 0) return [cur];
    const u1 = { x: (prev.x - cur.x) / len1, y: (prev.y - cur.y) / len1 };
    const u2 = { x: (next.x - cur.x) / len2, y: (next.y - cur.y) / len2 };
    const angle = Math.acos(Math.min(1, Math.max(-1, u1.x * u2.x + u1.y * u2.y)));
    if (angle < STRAIGHT_EPS || angle > Math.PI - STRAIGHT_EPS) return [cur];
    const trim = Math.min(radiusMm / Math.tan(angle / 2), len1 * MAX_TRIM_SHARE, len2 * MAX_TRIM_SHARE);
    const radius = trim * Math.tan(angle / 2);
    const bisector = { x: u1.x + u2.x, y: u1.y + u2.y };
    const bisectorLength = Math.hypot(bisector.x, bisector.y);
    const toCenter = trim / Math.cos(angle / 2) / bisectorLength;
    const center = { x: cur.x + bisector.x * toCenter, y: cur.y + bisector.y * toCenter };
    const start = Math.atan2(cur.y + u1.y * trim - center.y, cur.x + u1.x * trim - center.x);
    const end = Math.atan2(cur.y + u2.y * trim - center.y, cur.x + u2.x * trim - center.x);
    let sweep = end - start;
    if (sweep > Math.PI) sweep -= Math.PI * 2;
    if (sweep < -Math.PI) sweep += Math.PI * 2;
    return Array.from({ length: ARC_STEPS + 1 }, (_, step) => {
      const a = start + (sweep * step) / ARC_STEPS;
      return { x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) };
    });
  });
}

/** Spetsiga hörn skulle annars skjuta iväg långt när konturen flyttas. */
const MITER_LIMIT = 4;

/**
 * Flyttar varje kant `inset` mm inåt (negativt = utåt) och låter grannkanterna
 * mötas. Fungerar för inbuktade former. Tom lista när formen äts upp eller
 * viker sig över sig själv.
 */
export function offsetPolygon(points: readonly Point[], inset: Mm): Point[] {
  const n = points.length;
  if (n < 3 || inset === 0) return [...points];
  const area = signedArea(points);
  if (area === 0) return [];
  const side = area > 0 ? 1 : -1;
  const normals = points.map((a, i) => {
    const b = points[(i + 1) % n] ?? a;
    const len = edgeLength(a, b) || 1;
    return { x: (-(b.y - a.y) / len) * side, y: ((b.x - a.x) / len) * side };
  });
  const moved = points.map((p, i) => {
    const n1 = normals[(i + n - 1) % n] ?? { x: 0, y: 0 };
    const n2 = normals[i] ?? { x: 0, y: 0 };
    const sum = { x: n1.x + n2.x, y: n1.y + n2.y };
    const squared = sum.x * sum.x + sum.y * sum.y;
    if (squared < 1e-12) return p;
    // Bisektrisen med längden 1/cos(halva vinkeln), begränsad vid spetsar.
    const scale = Math.min(2 / squared, MITER_LIMIT / Math.sqrt(squared));
    return { x: p.x + sum.x * scale * inset, y: p.y + sum.y * scale * inset };
  });
  // En kant som bytt riktning betyder att formen har ätits upp eller vikt sig just där.
  const flipped = moved.some((a, i) => {
    const b = moved[(i + 1) % n] ?? a;
    const from = points[i] ?? a;
    const to = points[(i + 1) % n] ?? from;
    return (b.x - a.x) * (to.x - from.x) + (b.y - a.y) * (to.y - from.y) <= 0;
  });
  if (flipped || signedArea(moved) * side <= 1e-6 || !isSimplePolygon(moved)) return [];
  return moved;
}

/** Var en vågrät linje på höjden `y` korsar konturen, sorterat från vänster. */
function crossings(outline: readonly Point[], y: Mm): Mm[] {
  const xs: Mm[] = [];
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length] ?? a;
    // Halvöppet intervall: ett hörn mitt på linjen räknas en gång.
    if (a.y <= y === b.y <= y) return;
    xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
  });
  return xs.sort((p, q) => p - q);
}

/**
 * Stycket av linjen `y` som ligger närmare kanten `a–b` än `r`, eller `null`.
 * En linje som bara nuddar marginalen (avståndet är exakt `r`) räknas som fri.
 */
function nearEdgeSpan(a: Point, b: Point, r: Mm, y: Mm): [Mm, Mm] | null {
  const xs: Mm[] = [];
  for (const p of [a, b]) {
    const dy = y - p.y;
    if (Math.abs(dy) >= r) continue;
    const dx = Math.sqrt(r * r - dy * dy);
    xs.push(p.x - dx, p.x + dx);
  }
  const len = edgeLength(a, b);
  if (len > 0) {
    const nx = (-(b.y - a.y) / len) * r;
    const ny = ((b.x - a.x) / len) * r;
    for (const s of [1, -1]) {
      const y1 = a.y + ny * s;
      const y2 = b.y + ny * s;
      if (y1 === y2 || y < Math.min(y1, y2) || y > Math.max(y1, y2)) continue;
      xs.push(a.x + nx * s + ((y - y1) / (y2 - y1)) * (b.x - a.x));
    }
  }
  return xs.length > 0 ? [Math.min(...xs), Math.max(...xs)] : null;
}

const EDGE_EPS_MM = 1e-6;

/** Halvbredden runt `centerX` på höjden `y` som ligger inuti konturen och minst `inset` från kanten. */
function clearHalfWidthAt(outline: readonly Point[], y: Mm, centerX: Mm, inset: Mm): Mm {
  // Precis på konturens underkant hittar den halvöppna regeln inget; titta en hårsmån ovanför.
  const exact = crossings(outline, y);
  const xs = exact.length > 0 ? exact : crossings(outline, y - EDGE_EPS_MM);
  let left = -Infinity;
  let right = Infinity;
  let inside = false;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const from = xs[i] ?? 0;
    const to = xs[i + 1] ?? 0;
    if (from <= centerX && centerX <= to) {
      left = from;
      right = to;
      inside = true;
    }
  }
  if (!inside) return 0;
  if (inset > 0) {
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      const span = a && b ? nearEdgeSpan(a, b, inset, y) : null;
      if (!span) continue;
      if (span[0] <= centerX && centerX <= span[1]) return 0;
      if (span[1] < centerX) left = Math.max(left, span[1]);
      else right = Math.min(right, span[0]);
    }
  }
  return Math.max(0, Math.min(centerX - left, right - centerX));
}

const SCAN_STEP_MM = 0.5;

/**
 * Tillgänglig halvbredd runt `centerX` på höjden `y0…y1`: det sammanhängande
 * stycke som ligger inuti konturen och minst `inset` från kanten på hela
 * höjden. Konturen får ha inbuktningar, så bandet avsöks rad för rad.
 */
export function clearHalfWidth(outline: readonly Point[], centerX: Mm, inset: Mm, y0: Mm, y1: Mm): Mm {
  if (outline.length < 3) return 0;
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const steps = Math.max(1, Math.ceil((bottom - top) / SCAN_STEP_MM));
  let half = Infinity;
  for (let i = 0; i <= steps; i++) {
    half = Math.min(half, clearHalfWidthAt(outline, top + ((bottom - top) * i) / steps, centerX, inset));
    if (half <= 0) return 0;
  }
  return half;
}

/** Skalar konturen när skyltens mått ändras, så att formen följer med. */
export function scaleOutline(
  points: readonly Point[],
  from: { widthMm: Mm; heightMm: Mm },
  to: { widthMm: Mm; heightMm: Mm },
): Point[] {
  const sx = from.widthMm > 0 ? to.widthMm / from.widthMm : 1;
  const sy = from.heightMm > 0 ? to.heightMm / from.heightMm : 1;
  return points.map((p) => ({ x: round2(p.x * sx), y: round2(p.y * sy) }));
}

/** Avståndet från `p` till sträckan `a–b`. */
function distanceToSegment(p: Point, a: Point, b: Point): Mm {
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2));
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
}

/** Douglas–Peucker på en öppen kedja: behåller punkterna som avviker mer än `tolerance`. */
function simplifyChain(points: readonly Point[], tolerance: number): Point[] {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length < 3) return [...points];
  let worst = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const d = p ? distanceToSegment(p, first, last) : 0;
    if (d > worst) {
      worst = d;
      index = i;
    }
  }
  if (worst <= tolerance) return [first, last];
  return [...simplifyChain(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplifyChain(points.slice(index), tolerance)];
}

/**
 * Förenklar en tät, sluten kontur (till exempel från en uppladdad fil) tills
 * den ryms inom högsta antalet punkter. Toleransen ökas stegvis.
 */
export function simplifyOutline(points: readonly Point[], maxPoints: number = CUSTOM_SHAPE_LIMITS.maxPoints): Point[] {
  if (points.length <= 3) return [...points];
  // Dela den slutna konturen i två kedjor mellan de två punkter som ligger längst ifrån varandra.
  const anchor = points[0] ?? { x: 0, y: 0 };
  const far = points.reduce((best, p, i) => (Math.hypot(p.x - anchor.x, p.y - anchor.y) > Math.hypot((points[best] ?? anchor).x - anchor.x, (points[best] ?? anchor).y - anchor.y) ? i : best), 0);
  const firstHalf = points.slice(0, far + 1);
  const secondHalf = [...points.slice(far), anchor];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  let tolerance = span / 400;
  for (let attempt = 0; attempt < 24; attempt++) {
    const simplified = [...simplifyChain(firstHalf, tolerance).slice(0, -1), ...simplifyChain(secondHalf, tolerance).slice(0, -1)];
    if (simplified.length <= maxPoints) return simplified;
    tolerance *= 1.5;
  }
  return points.filter((_, i) => i % Math.ceil(points.length / maxPoints) === 0).slice(0, maxPoints);
}

/**
 * Lägger en kontur i godtycklig skala inuti rutan `maxWidthMm × maxHeightMm`
 * med bibehållna proportioner. Svaret är konturen i mm från rutans hörn och
 * måttet den fyller.
 */
export function fitOutline(
  points: readonly Point[],
  maxWidthMm: Mm,
  maxHeightMm: Mm,
): { points: Point[]; widthMm: Mm; heightMm: Mm } | null {
  if (points.length < 3) return null;
  const minX = Math.min(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const spanX = Math.max(...points.map((p) => p.x)) - minX;
  const spanY = Math.max(...points.map((p) => p.y)) - minY;
  if (spanX <= 0 || spanY <= 0) return null;
  const scale = Math.min(maxWidthMm / spanX, maxHeightMm / spanY);
  const widthMm = Math.max(1, Math.round(spanX * scale));
  const heightMm = Math.max(1, Math.round(spanY * scale));
  return {
    points: points.map((p) => ({ x: round2(((p.x - minX) / spanX) * widthMm), y: round2(((p.y - minY) / spanY) * heightMm) })),
    widthMm,
    heightMm,
  };
}
