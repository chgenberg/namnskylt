import type { BadgeDocument, BadgeShape, Mm } from "./types";

export interface Point {
  x: Mm;
  y: Mm;
}

/** Konturens geometri — ritningen, layouten, 3D och produktionen läser samma. */
export type Outline =
  | { kind: "ellipse"; cx: Mm; cy: Mm; rx: Mm; ry: Mm }
  | { kind: "rounded-rect"; x: Mm; y: Mm; w: Mm; h: Mm; r: Mm }
  | { kind: "polygon"; points: Point[] };

/** Samma avskärningar som leverantörens motor, så formen blir densamma i produktion. */
const OCTAGON_CUT = 1 - Math.SQRT1_2;
const HEXAGON_CUT = 0.25;

export function isEllipseShape(shape: BadgeShape): boolean {
  return shape === "oval" || shape === "round";
}

export function isPolygonShape(shape: BadgeShape): boolean {
  return shape === "hexagon" || shape === "octagon";
}

/** Former med raka sidor som kan dela skärlinje med grannen på arket. */
export function hasStraightSides(shape: BadgeShape): shape is "rectangle" | "rounded" | "stadium" {
  return shape === "rectangle" || shape === "rounded" || shape === "stadium";
}

function num(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(4))) : "0";
}

/** Effektiv hörnradie efter klampning mot skyltens halva kortsida. */
export function effectiveCornerRadius(doc: BadgeDocument): Mm {
  const { widthMm, heightMm } = doc.size;
  const maxRadius = Math.min(widthMm, heightMm) / 2;
  if (doc.shape === "stadium") return maxRadius;
  if (doc.shape !== "rounded") return 0;
  return Math.max(0, Math.min(doc.cornerRadiusMm, maxRadius));
}

function polygonCorners(shape: BadgeShape, w: Mm, h: Mm): Point[] {
  if (shape === "hexagon") {
    const c = w * HEXAGON_CUT;
    return [
      { x: c, y: 0 },
      { x: w - c, y: 0 },
      { x: w, y: h / 2 },
      { x: w - c, y: h },
      { x: c, y: h },
      { x: 0, y: h / 2 },
    ];
  }
  const cx = OCTAGON_CUT * w;
  const cy = OCTAGON_CUT * h;
  return [
    { x: cx, y: 0 },
    { x: w - cx, y: 0 },
    { x: w, y: cy },
    { x: w, y: h - cy },
    { x: w - cx, y: h },
    { x: cx, y: h },
    { x: 0, y: h - cy },
    { x: 0, y: cy },
  ];
}

/**
 * Flyttar varje kant `inset` mm inåt (negativt = utåt) och skär grannkanterna.
 * Ger jämnt kantavstånd även när formen är utdragen; tom lista om formen äts upp.
 */
export function insetConvexPolygon(points: readonly Point[], inset: Mm): Point[] {
  const n = points.length;
  if (n < 3 || inset === 0) return [...points];
  const centroid = points.reduce((c, p) => ({ x: c.x + p.x / n, y: c.y + p.y / n }), { x: 0, y: 0 });
  const lines = points.map((a, i) => {
    const b = points[(i + 1) % n] ?? a;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nx = -(b.y - a.y) / len;
    let ny = (b.x - a.x) / len;
    if (nx * (centroid.x - a.x) + ny * (centroid.y - a.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { a: { x: a.x + nx * inset, y: a.y + ny * inset }, d: { x: b.x - a.x, y: b.y - a.y }, n: { x: nx, y: ny } };
  });
  const result: Point[] = [];
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i + n - 1) % n];
    const l2 = lines[i];
    if (!l1 || !l2) return [];
    const cross = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
    if (Math.abs(cross) < 1e-9) return [];
    const t = ((l2.a.x - l1.a.x) * l2.d.y - (l2.a.y - l1.a.y) * l2.d.x) / cross;
    result.push({ x: l1.a.x + l1.d.x * t, y: l1.a.y + l1.d.y * t });
  }
  // Har kanterna passerat varandra pekar en kant åt fel håll — formen är uppäten.
  const collapsed = result.some((p, i) => {
    const q = result[(i + 1) % n] ?? p;
    const line = lines[i];
    return line ? (q.x - p.x) * line.d.x + (q.y - p.y) * line.d.y <= 0 : true;
  });
  return collapsed ? [] : result;
}

/** Konturen indragen `inset` mm från skyltkanten (negativt = utåt), eller `null` om inget finns kvar. */
export function badgeOutline(doc: BadgeDocument, inset: Mm = 0): Outline | null {
  const { widthMm, heightMm } = doc.size;
  const w = widthMm - inset * 2;
  const h = heightMm - inset * 2;
  if (w <= 0 || h <= 0) return null;

  if (isEllipseShape(doc.shape)) {
    return { kind: "ellipse", cx: widthMm / 2, cy: heightMm / 2, rx: w / 2, ry: h / 2 };
  }
  if (isPolygonShape(doc.shape)) {
    const points = insetConvexPolygon(polygonCorners(doc.shape, widthMm, heightMm), inset);
    return points.length >= 3 ? { kind: "polygon", points } : null;
  }
  const r = Math.max(0, Math.min(effectiveCornerRadius(doc) - inset, w / 2, h / 2));
  return { kind: "rounded-rect", x: inset, y: inset, w, h, r };
}

export function outlineToPath(outline: Outline | null): string {
  if (!outline) return "";
  if (outline.kind === "ellipse") {
    const { cx, cy, rx, ry } = outline;
    return `M${num(cx - rx)} ${num(cy)}a${num(rx)} ${num(ry)} 0 1 0 ${num(rx * 2)} 0a${num(rx)} ${num(ry)} 0 1 0 ${num(-rx * 2)} 0Z`;
  }
  if (outline.kind === "polygon") {
    return `${outline.points.map((p, i) => `${i === 0 ? "M" : "L"}${num(p.x)} ${num(p.y)}`).join("")}Z`;
  }
  const { x, y, w, h, r } = outline;
  if (r === 0) return `M${num(x)} ${num(y)}h${num(w)}v${num(h)}h${num(-w)}Z`;
  return [
    `M${num(x + r)} ${num(y)}`,
    `h${num(w - 2 * r)}`,
    `a${num(r)} ${num(r)} 0 0 1 ${num(r)} ${num(r)}`,
    `v${num(h - 2 * r)}`,
    `a${num(r)} ${num(r)} 0 0 1 ${num(-r)} ${num(r)}`,
    `h${num(-(w - 2 * r))}`,
    `a${num(r)} ${num(r)} 0 0 1 ${num(-r)} ${num(-r)}`,
    `v${num(-(h - 2 * r))}`,
    `a${num(r)} ${num(r)} 0 0 1 ${num(r)} ${num(-r)}`,
    "Z",
  ].join("");
}

/**
 * Kontur som SVG-path, indragen `inset` mm från skyltkanten. Indragen kontur
 * används av ramen och säkerhetszonen så att de följer formen.
 */
export function outlinePath(doc: BadgeDocument, inset: Mm = 0): string {
  return outlineToPath(badgeOutline(doc, inset));
}

/** Konturens halvbredd på höjden `y`, mätt från skyltens mittlinje. */
function halfWidthAt(outline: Outline, y: Mm, centerX: Mm): Mm {
  if (outline.kind === "ellipse") {
    const t = Math.abs(y - outline.cy) / outline.ry;
    return t >= 1 ? 0 : outline.rx * Math.sqrt(1 - t * t);
  }
  if (outline.kind === "rounded-rect") {
    const { y: top, h, w, r } = outline;
    if (y < top || y > top + h) return 0;
    const dy = Math.max(0, top + r - y, y - (top + h - r));
    return w / 2 - r + Math.sqrt(Math.max(0, r * r - dy * dy));
  }
  let left = Infinity;
  let right = -Infinity;
  const { points } = outline;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length] ?? a;
    if ((y < Math.min(a.y, b.y)) || (y > Math.max(a.y, b.y))) return;
    const x = a.y === b.y ? null : a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
    for (const value of x === null ? [a.x, b.x] : [x]) {
      left = Math.min(left, value);
      right = Math.max(right, value);
    }
  });
  return right < left ? 0 : Math.max(0, Math.min(centerX - left, right - centerX));
}

/**
 * Tillgänglig halvbredd på höjden `y0…y1` inuti konturen indragen `inset`.
 * Alla former är konvexa, så den smalaste punkten ligger i bandets kant.
 */
export function availableHalfWidth(doc: BadgeDocument, inset: Mm, y0: Mm, y1: Mm): Mm {
  const outline = badgeOutline(doc, inset);
  if (!outline) return 0;
  const centerX = doc.size.widthMm / 2;
  return Math.min(halfWidthAt(outline, y0, centerX), halfWidthAt(outline, y1, centerX));
}
