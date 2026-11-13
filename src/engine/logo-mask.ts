import type { RgbaPixels } from "./logo";

/**
 * Detaljer inuti en fylld logga. En logga med text eller symbol i en annan färg
 * inuti en platta, sköld eller cirkel blir annars en massiv klump när den
 * graveras i en färg. Här delas förgrunden i två färger: den som ligger ytterst
 * är plattan och graveras, och det som ligger helt inneslutet i den andra
 * färgen blir urtag, så att texten syns.
 *
 * Delar som når ut till loggans kant (ett ord i en annan färg, halvan av en
 * toning) är egna delar av loggan och förblir gravyr.
 */

/** Så olika måste de två färgerna vara (avstånd i RGB) för att räknas som platta och detalj. */
const MIN_COLOR_DISTANCE = 70;
/** Mindre andel än så av förgrunden är brus, inte en detalj. */
const MIN_CLASS_SHARE = 0.02;
/** Inneslutna fläckar mindre än så (px) är brus i bilden. */
const MIN_DETAIL_PX = 6;
const CLUSTER_ROUNDS = 6;

type Rgb = [number, number, number];

function colorAt(data: ArrayLike<number>, i: number): Rgb {
  return [data[i * 4] ?? 0, data[i * 4 + 1] ?? 0, data[i * 4 + 2] ?? 0];
}

function distance(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Pixelns grannar till vänster, höger, över och under; −1 utanför bilden. */
function neighbours(i: number, width: number, height: number): number[] {
  const x = i % width;
  const y = (i - x) / width;
  return [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1];
}

/**
 * Delar förgrundens pixlar i två färggrupper (k-medel med två centrum).
 * `null` när förgrunden i praktiken har en enda färg.
 */
function twoColors({ data }: RgbaPixels, foreground: ArrayLike<number>, indices: readonly number[]): Uint8Array | null {
  const first = colorAt(data, indices[0] ?? 0);
  // Börja med två färger långt ifrån varandra: den första pixeln och den som ligger längst bort.
  let far = first;
  for (const i of indices) if (distance(colorAt(data, i), first) > distance(far, first)) far = colorAt(data, i);
  let centers: [Rgb, Rgb] = [first, far];
  const group = new Uint8Array(foreground.length);

  for (let round = 0; round < CLUSTER_ROUNDS; round++) {
    const sums: [number[], number[]] = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    for (const i of indices) {
      const color = colorAt(data, i);
      const g = distance(color, centers[0]) <= distance(color, centers[1]) ? 0 : 1;
      group[i] = g;
      const sum = sums[g];
      sum[0] = (sum[0] ?? 0) + color[0];
      sum[1] = (sum[1] ?? 0) + color[1];
      sum[2] = (sum[2] ?? 0) + color[2];
      sum[3] = (sum[3] ?? 0) + 1;
    }
    const [a, b] = sums;
    const countA = a[3] ?? 0;
    const countB = b[3] ?? 0;
    if (countA === 0 || countB === 0) return null;
    centers = [
      [(a[0] ?? 0) / countA, (a[1] ?? 0) / countA, (a[2] ?? 0) / countA],
      [(b[0] ?? 0) / countB, (b[1] ?? 0) / countB, (b[2] ?? 0) / countB],
    ];
    const smallest = Math.min(countA, countB) / indices.length;
    if (round === CLUSTER_ROUNDS - 1 && (distance(centers[0], centers[1]) < MIN_COLOR_DISTANCE || smallest < MIN_CLASS_SHARE)) {
      return null;
    }
  }
  return group;
}

/**
 * Förgrunden med inneslutna detaljer urtagna, eller `null` när loggan inte har
 * någon detalj inuti en fylld form. `foreground` är masken före urtag
 * (1 = logga, 0 = botten).
 */
export function carveEnclosedDetail(pixels: RgbaPixels, foreground: ArrayLike<number>): Uint8Array | null {
  const { width, height } = pixels;
  const indices: number[] = [];
  for (let i = 0; i < foreground.length; i++) if (foreground[i]) indices.push(i);
  if (indices.length === 0) return null;
  const group = twoColors(pixels, foreground, indices);
  if (!group) return null;

  // Plattan är färgen som ligger ytterst: den som de flesta kantpixlar har.
  const edge = [0, 0];
  for (const i of indices) {
    if (neighbours(i, width, height).some((n) => n < 0 || !foreground[n])) edge[group[i] ?? 0] = (edge[group[i] ?? 0] ?? 0) + 1;
  }
  const detail = (edge[0] ?? 0) >= (edge[1] ?? 0) ? 1 : 0;

  const mask = Uint8Array.from(foreground, (v) => (v ? 1 : 0));
  const seen = new Uint8Array(foreground.length);
  let carved = 0;
  for (const start of indices) {
    if (seen[start] || group[start] !== detail) continue;
    const component: number[] = [];
    let enclosed = true;
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const i = stack.pop() ?? 0;
      component.push(i);
      for (const n of neighbours(i, width, height)) {
        if (n < 0 || !foreground[n]) {
          enclosed = false;
          continue;
        }
        if (!seen[n] && group[n] === detail) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (!enclosed || component.length < MIN_DETAIL_PX) continue;
    carved++;
    for (const i of component) mask[i] = 0;
  }
  return carved > 0 ? mask : null;
}
