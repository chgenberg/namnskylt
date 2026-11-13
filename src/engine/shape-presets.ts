import type { Point } from "./shape";
import type { Mm } from "./types";

/**
 * Formförslag till "Egen form". Punkterna ligger i en enhetsruta (0–1, y nedåt)
 * och skalas till skyltens mått. Kunden väljer ett förslag och ändrar det sedan.
 */
export interface ShapePreset {
  id: string;
  name: string;
  /** Måttet förslaget får när det väljs. */
  widthMm: Mm;
  heightMm: Mm;
  cornerRadiusMm: Mm;
  points: readonly Point[];
}

const p = (x: number, y: number): Point => ({ x, y });

/** Stjärna med `tips` uddar; `inner` är inbuktningens andel av radien. */
function star(tips: number, inner: number): Point[] {
  return Array.from({ length: tips * 2 }, (_, i) => {
    const radius = i % 2 === 0 ? 0.5 : 0.5 * inner;
    const angle = (Math.PI * i) / tips - Math.PI / 2;
    return p(0.5 + radius * Math.cos(angle), 0.5 + radius * Math.sin(angle));
  });
}

/** Kortaste avståndet mellan två grannpunkter i hjärtat, i enhetsrutan — kurvan klumpar annars ihop punkter i klykan. */
const HEART_MIN_STEP = 0.06;

/** Hjärta ur den klassiska kurvan, normaliserad till enhetsrutan. */
function heart(): Point[] {
  const samples = 40;
  const curve = normalize(
    Array.from({ length: samples }, (_, i) => {
      const t = (Math.PI * 2 * i) / samples;
      return p(16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)));
    }),
  );
  const far = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) >= HEART_MIN_STEP;
  const kept = curve.reduce<Point[]>((list, q) => (list.every((r, i) => i < list.length - 1 || far(r, q)) ? [...list, q] : list), []);
  const first = kept[0];
  const last = kept[kept.length - 1];
  return first && last && !far(first, last) ? kept.slice(0, -1) : kept;
}

/** Sträcker ut punkterna så att de fyller enhetsrutan kant i kant. */
function normalize(points: readonly Point[]): Point[] {
  const minX = Math.min(...points.map((q) => q.x));
  const minY = Math.min(...points.map((q) => q.y));
  const spanX = Math.max(...points.map((q) => q.x)) - minX || 1;
  const spanY = Math.max(...points.map((q) => q.y)) - minY || 1;
  return points.map((q) => p((q.x - minX) / spanX, (q.y - minY) / spanY));
}

export const SHAPE_PRESETS: readonly ShapePreset[] = [
  { id: "shield", name: "Sköld", widthMm: 60, heightMm: 70, cornerRadiusMm: 4, points: [p(0, 0), p(1, 0), p(1, 0.55), p(0.5, 1), p(0, 0.55)] },
  { id: "star", name: "Stjärna", widthMm: 80, heightMm: 80, cornerRadiusMm: 2, points: normalize(star(5, 0.5)) },
  { id: "heart", name: "Hjärta", widthMm: 75, heightMm: 68, cornerRadiusMm: 0, points: heart() },
  {
    id: "bubble",
    name: "Pratbubbla",
    widthMm: 85,
    heightMm: 55,
    cornerRadiusMm: 6,
    points: [p(0, 0), p(1, 0), p(1, 0.72), p(0.42, 0.72), p(0.24, 1), p(0.24, 0.72), p(0, 0.72)],
  },
  { id: "house", name: "Hus", widthMm: 70, heightMm: 60, cornerRadiusMm: 2, points: [p(0.5, 0), p(1, 0.42), p(1, 1), p(0, 1), p(0, 0.42)] },
  {
    id: "arrow",
    name: "Pil",
    widthMm: 95,
    heightMm: 45,
    cornerRadiusMm: 2,
    points: [p(0, 0.22), p(0.64, 0.22), p(0.64, 0), p(1, 0.5), p(0.64, 1), p(0.64, 0.78), p(0, 0.78)],
  },
  { id: "tag", name: "Etikett", widthMm: 90, heightMm: 40, cornerRadiusMm: 3, points: [p(0.16, 0), p(1, 0), p(1, 1), p(0.16, 1), p(0, 0.5)] },
  {
    id: "banner",
    name: "Banderoll",
    widthMm: 100,
    heightMm: 35,
    cornerRadiusMm: 1,
    points: [p(0, 0), p(1, 0), p(0.92, 0.5), p(1, 1), p(0, 1), p(0.08, 0.5)],
  },
  { id: "pennant", name: "Vimpel", widthMm: 95, heightMm: 40, cornerRadiusMm: 2, points: [p(0, 0), p(1, 0), p(0.84, 0.5), p(1, 1), p(0, 1)] },
  {
    id: "ticket",
    name: "Biljett",
    widthMm: 90,
    heightMm: 40,
    cornerRadiusMm: 2,
    points: [p(0, 0), p(1, 0), p(1, 0.32), p(0.94, 0.5), p(1, 0.68), p(1, 1), p(0, 1), p(0, 0.68), p(0.06, 0.5), p(0, 0.32)],
  },
  {
    id: "plaque",
    name: "Plakett",
    widthMm: 85,
    heightMm: 45,
    cornerRadiusMm: 1,
    points: [p(0.1, 0), p(0.9, 0), p(1, 0.2), p(1, 0.8), p(0.9, 1), p(0.1, 1), p(0, 0.8), p(0, 0.2)],
  },
  { id: "hexagon", name: "Sexkant", widthMm: 85, heightMm: 45, cornerRadiusMm: 2, points: [p(0.18, 0), p(0.82, 0), p(1, 0.5), p(0.82, 1), p(0.18, 1), p(0, 0.5)] },
  { id: "diamond", name: "Romb", widthMm: 90, heightMm: 55, cornerRadiusMm: 3, points: [p(0.5, 0), p(1, 0.5), p(0.5, 1), p(0, 0.5)] },
  { id: "burst", name: "Sol", widthMm: 80, heightMm: 80, cornerRadiusMm: 1, points: normalize(star(12, 0.82)) },
];

export function getShapePreset(id: string): ShapePreset {
  return SHAPE_PRESETS.find((preset) => preset.id === id) ?? SHAPE_PRESETS[0]!;
}

/** Förslagets kontur i mm för ett givet mått. */
export function presetOutline(preset: ShapePreset, widthMm: Mm = preset.widthMm, heightMm: Mm = preset.heightMm): Point[] {
  return preset.points.map((q) => ({
    x: Math.round(q.x * widthMm * 100) / 100,
    y: Math.round(q.y * heightMm * 100) / 100,
  }));
}
