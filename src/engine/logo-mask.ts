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

/** En kantzon vars färg ligger så nära linjen mellan bottnen och kärnan (avstånd i RGB) är en blandning av de två. */
const BLEND_TOLERANCE = 45;
/** Kantzonen räknas som en egen yta först när så stor andel av den ligger djupare än zonens bredd. */
const DEEP_PLATE_SHARE = 0.1;
/** Kantzonens största bredd, som andel av bildens längsta sida. Minst två pixlar. */
const RIM_SHARE = 1 / 80;

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
 * Sant när "plattan" bara är en suddig kant: en smal zon runt loggan vars färg är en blandning av
 * bottnen och loggans egen färg. Så ser en liten eller hårt komprimerad bild ut när den förstoras:
 * en mörk bokstav får en grå rand. Utan den här kontrollen togs randen för en platta och bokstavens
 * kärna för en detalj i den, och loggan spårades som ihåliga konturer (funnet 2026-11-20, när
 * ägaren hade fått en hackig logga från en hemsida).
 *
 * En riktig platta är antingen bred, eller har en färg som inte ligger mellan bottnen och detaljen,
 * som en mörk kontur kring vita bokstäver.
 */
function isBlurredRim(pixels: RgbaPixels, foreground: ArrayLike<number>, indices: readonly number[], group: Uint8Array, detail: number): boolean {
  const { data, width, height } = pixels;
  const sums = { plate: [0, 0, 0, 0], detail: [0, 0, 0, 0], ground: [0, 0, 0, 0] };
  const add = (sum: number[], i: number) => {
    sum[0] = (sum[0] ?? 0) + (data[i * 4] ?? 0);
    sum[1] = (sum[1] ?? 0) + (data[i * 4 + 1] ?? 0);
    sum[2] = (sum[2] ?? 0) + (data[i * 4 + 2] ?? 0);
    sum[3] = (sum[3] ?? 0) + 1;
  };
  for (const i of indices) add(group[i] === detail ? sums.detail : sums.plate, i);
  // Bottnen: det som syns men inte hör till loggan. En frilagd bild har ingen, och då går frågan inte att avgöra.
  for (let i = 0; i < foreground.length; i++) if (!foreground[i] && (data[i * 4 + 3] ?? 0) >= 128) add(sums.ground, i);
  const mean = (sum: number[]): Rgb | null => ((sum[3] ?? 0) > 0 ? [(sum[0] ?? 0) / sum[3]!, (sum[1] ?? 0) / sum[3]!, (sum[2] ?? 0) / sum[3]!] : null);
  const plate = mean(sums.plate);
  const core = mean(sums.detail);
  const ground = mean(sums.ground);
  if (!plate || !core || !ground) return false;

  // Ligger plattans färg mellan bottnens och kärnans, nära linjen mellan dem?
  const line: Rgb = [core[0] - ground[0], core[1] - ground[1], core[2] - ground[2]];
  const length2 = line[0] ** 2 + line[1] ** 2 + line[2] ** 2;
  if (length2 < 1) return false;
  const offset: Rgb = [plate[0] - ground[0], plate[1] - ground[1], plate[2] - ground[2]];
  const along = (offset[0] * line[0] + offset[1] * line[1] + offset[2] * line[2]) / length2;
  const off = Math.hypot(offset[0] - along * line[0], offset[1] - along * line[1], offset[2] - along * line[2]);
  if (along <= 0.05 || along >= 0.95 || off > BLEND_TOLERANCE) return false;

  // Hur djupt in i loggan ligger plattans pixlar? Avståndet till närmaste botten, räknat i två svep.
  const depth = new Uint16Array(foreground.length);
  const FAR = 65_535;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!foreground[i]) continue;
      const left = x > 0 ? (depth[i - 1] ?? 0) : 0;
      const up = y > 0 ? (depth[i - width] ?? 0) : 0;
      depth[i] = Math.min(FAR, Math.min(left, up) + 1);
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (!foreground[i]) continue;
      const right = x < width - 1 ? (depth[i + 1] ?? 0) : 0;
      const down = y < height - 1 ? (depth[i + width] ?? 0) : 0;
      depth[i] = Math.min(depth[i] ?? 0, Math.min(right, down) + 1);
    }
  }
  const rim = Math.max(2, Math.round(Math.max(width, height) * RIM_SHARE));
  let deep = 0;
  for (const i of indices) if (group[i] !== detail && (depth[i] ?? 0) > rim) deep++;
  return deep / (sums.plate[3] ?? 1) < DEEP_PLATE_SHARE;
}

/**
 * Förgrunden med inneslutna detaljer urtagna, eller `null` när loggan inte har
 * någon detalj inuti en fylld form. `foreground` är masken före urtag
 * (1 = logga, 0 = botten). `grain` är hur många gånger finare bilden är än den reglerna är
 * inställda för: en fläck som är brus är det i samma storlek på loggan, hur många pixlar den än blir.
 */
export function carveEnclosedDetail(pixels: RgbaPixels, foreground: ArrayLike<number>, grain = 1): Uint8Array | null {
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
  // En suddig kant kring loggan är ingen platta: då finns inget att ta ur.
  if (isBlurredRim(pixels, foreground, indices, group, detail)) return null;

  const mask = Uint8Array.from(foreground, (v) => (v ? 1 : 0));
  const seen = new Uint8Array(foreground.length);
  const minDetail = Math.round(MIN_DETAIL_PX * grain * grain);
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
    if (!enclosed || component.length < minDetail) continue;
    carved++;
    for (const i of component) mask[i] = 0;
  }
  return carved > 0 ? mask : null;
}
