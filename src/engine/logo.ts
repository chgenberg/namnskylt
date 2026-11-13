import { LOGO_LIMITS } from "./catalog";
import { carveEnclosedDetail } from "./logo-mask";

/**
 * Loggor graveras i en färg, så en uppladdad bild blir en mask (bläck/botten)
 * som spåras till konturer. Konturerna fylls med evenodd — hål i bokstäver
 * blir hål oavsett i vilken riktning de spårats.
 */

export interface TracedLogo {
  d: string;
  viewWidth: number;
  viewHeight: number;
}

export interface TraceOptions {
  /** Hur långt (px) en förenklad kontur får avvika från pixelkanten. */
  tolerancePx?: number;
  /** Fläckar mindre än så (px²) är brus, inte logga. */
  minAreaPx?: number;
  /**
   * Behåll maskens ruta i stället för att beskära till bläcket. För en logga
   * i färg, där banorna ska ligga exakt över bilden.
   */
  keepFrame?: boolean;
}

type Point = readonly [number, number];

const DEFAULT_TOLERANCE_PX = 0.7;
const DEFAULT_MIN_AREA_PX = 6;
/** Varje försök med grövre förenkling multiplicerar toleransen så här. */
const TOLERANCE_STEP = 1.8;
const MAX_SIMPLIFY_ATTEMPTS = 6;

/**
 * Otsus tröskel på värden 0–255: den gräns som bäst skiljer två grupper.
 * Fungerar för både mörk logga på ljust och ljus logga på mörkt.
 */
export function otsuThreshold(values: ArrayLike<number>): number {
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < values.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round(values[i] ?? 0)));
    histogram[v] = (histogram[v] ?? 0) + 1;
  }
  const total = values.length;
  let sumAll = 0;
  for (let v = 0; v < 256; v++) sumAll += v * (histogram[v] ?? 0);

  let sumBelow = 0;
  let countBelow = 0;
  let best = 127;
  let bestVariance = -1;
  for (let t = 0; t < 256; t++) {
    countBelow += histogram[t] ?? 0;
    if (countBelow === 0) continue;
    const countAbove = total - countBelow;
    if (countAbove === 0) break;
    sumBelow += t * (histogram[t] ?? 0);
    const meanBelow = sumBelow / countBelow;
    const meanAbove = (sumAll - sumBelow) / countAbove;
    const variance = countBelow * countAbove * (meanBelow - meanAbove) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = t;
    }
  }
  return best;
}

/** Kantmittpunkter i dubblerade heltalskoordinater, så nycklarna blir exakta. */
function pointKey(x2: number, y2: number, stride: number): number {
  return (y2 + 2) * stride + (x2 + 2);
}

/**
 * Marching squares över masken (utanför bilden = botten). Varje kantmittpunkt
 * delas av exakt två segment, så konturerna kan följas utan riktningstabell.
 */
function contours(mask: ArrayLike<number>, width: number, height: number): Point[][] {
  const inked = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && (mask[y * width + x] ?? 0) > 0;
  const stride = 2 * width + 6;
  const neighbours = new Map<number, number[]>();
  const coords = new Map<number, Point>();

  const adjacent = (key: number, point: Point): number[] => {
    let list = neighbours.get(key);
    if (!list) {
      list = [];
      neighbours.set(key, list);
      coords.set(key, point);
    }
    return list;
  };
  const link = (a: Point, b: Point) => {
    const ka = pointKey(a[0], a[1], stride);
    const kb = pointKey(b[0], b[1], stride);
    adjacent(ka, a).push(kb);
    adjacent(kb, b).push(ka);
  };

  for (let cy = -1; cy < height; cy++) {
    for (let cx = -1; cx < width; cx++) {
      const tl = inked(cx, cy);
      const tr = inked(cx + 1, cy);
      const br = inked(cx + 1, cy + 1);
      const bl = inked(cx, cy + 1);
      const top: Point = [2 * cx + 1, 2 * cy];
      const right: Point = [2 * cx + 2, 2 * cy + 1];
      const bottom: Point = [2 * cx + 1, 2 * cy + 2];
      const left: Point = [2 * cx, 2 * cy + 1];

      if (tl === br && tr === bl && tl !== tr) {
        // Sadel: hörnen med bläck hålls isär, så två diagonala pixlar blir två öar.
        if (tl) {
          link(left, top);
          link(right, bottom);
        } else {
          link(top, right);
          link(bottom, left);
        }
        continue;
      }
      const crossings: Point[] = [];
      if (tl !== tr) crossings.push(top);
      if (tr !== br) crossings.push(right);
      if (bl !== br) crossings.push(bottom);
      if (tl !== bl) crossings.push(left);
      if (crossings.length === 2) link(crossings[0]!, crossings[1]!);
    }
  }

  const loops: Point[][] = [];
  const visited = new Set<number>();
  for (const start of neighbours.keys()) {
    if (visited.has(start)) continue;
    const loop: Point[] = [];
    let previous = -1;
    let current = start;
    while (!visited.has(current)) {
      visited.add(current);
      const point = coords.get(current);
      if (point) loop.push([point[0] / 2, point[1] / 2]);
      const next = (neighbours.get(current) ?? []).find((k) => k !== previous && !visited.has(k));
      if (next === undefined) break;
      previous = current;
      current = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function signedArea(loop: readonly Point[]): number {
  let area = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x0, y0] = loop[i]!;
    const [x1, y1] = loop[(i + 1) % loop.length]!;
    area += x0 * y1 - x1 * y0;
  }
  return area / 2;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Ramer–Douglas–Peucker på en öppen kedja, iterativt så långa konturer inte spränger stacken. */
function simplifyChain(points: readonly Point[], tolerance: number): Point[] {
  if (points.length < 3) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  for (let range = stack.pop(); range; range = stack.pop()) {
    const [first, last] = range;
    let farthest = -1;
    let farthestDistance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i]!, points[first]!, points[last]!);
      if (d > farthestDistance) {
        farthest = i;
        farthestDistance = d;
      }
    }
    if (farthest >= 0) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** En sluten kontur delas i punkten längst från starten och förenklas som två kedjor. */
function simplifyLoop(loop: readonly Point[], tolerance: number): Point[] {
  const [sx, sy] = loop[0]!;
  let split = 0;
  let farthest = -1;
  loop.forEach(([x, y], i) => {
    const d = Math.hypot(x - sx, y - sy);
    if (d > farthest) {
      farthest = d;
      split = i;
    }
  });
  const first = simplifyChain(loop.slice(0, split + 1), tolerance);
  const second = simplifyChain([...loop.slice(split), loop[0]!], tolerance);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

function formatNumber(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function loopsToPath(loops: readonly Point[][], offsetX: number, offsetY: number): string {
  return loops
    .map(
      (loop) =>
        loop
          .map(([x, y], i) => `${i === 0 ? "M" : "L"}${formatNumber(x - offsetX)} ${formatNumber(y - offsetY)}`)
          .join("") + "Z",
    )
    .join("");
}

/** RGBA-pixlar rad för rad, som `ImageData` eller sharps `raw`. */
export interface RgbaPixels {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

/** Andel genomskinliga pixlar som gör att alfakanalen avgör vad som är bläck. */
const TRANSPARENT_SHARE = 0.02;
const ALPHA_INK = 128;

/**
 * Bläck eller botten per pixel. Genomskinlig bild: allt synligt är loggan.
 * Ogenomskinlig: ljusheten delas med Otsus tröskel, och den klass som
 * dominerar kanten räknas som botten — så både mörk logga på vitt och vit
 * logga på färg blir rätt. Text eller symbol i en annan färg inuti en fylld
 * form blir urtag (`carveEnclosedDetail`), annars graveras loggan som en klump.
 */
export function inkMask(pixels: RgbaPixels, invert = false): Uint8Array {
  const foreground = foregroundMask(pixels);
  const mask = carveEnclosedDetail(pixels, foreground) ?? foreground;
  if (invert) for (let i = 0; i < mask.length; i++) mask[i] = mask[i] ? 0 : 1;
  return mask;
}

/** Loggan mot botten, före urtag: allt synligt, eller det som skiljer sig från bildens kant. */
function foregroundMask({ data, width, height }: RgbaPixels): Uint8Array {
  const count = width * height;
  const mask = new Uint8Array(count);
  let transparent = 0;
  for (let i = 0; i < count; i++) if ((data[i * 4 + 3] ?? 0) < ALPHA_INK) transparent++;

  if (transparent / count > TRANSPARENT_SHARE) {
    for (let i = 0; i < count; i++) mask[i] = (data[i * 4 + 3] ?? 0) >= ALPHA_INK ? 1 : 0;
  } else {
    const luminance = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      luminance[i] = 0.2126 * (data[i * 4] ?? 0) + 0.7152 * (data[i * 4 + 1] ?? 0) + 0.0722 * (data[i * 4 + 2] ?? 0);
    }
    const threshold = otsuThreshold(luminance);
    let darkEdge = 0;
    let edge = 0;
    for (let x = 0; x < width; x++) {
      for (const y of [0, height - 1]) {
        edge++;
        if ((luminance[y * width + x] ?? 0) <= threshold) darkEdge++;
      }
    }
    for (let y = 0; y < height; y++) {
      for (const x of [0, width - 1]) {
        edge++;
        if ((luminance[y * width + x] ?? 0) <= threshold) darkEdge++;
      }
    }
    const darkIsInk = darkEdge <= edge / 2;
    for (let i = 0; i < count; i++) {
      const dark = (luminance[i] ?? 0) <= threshold;
      mask[i] = dark === darkIsInk ? 1 : 0;
    }
  }
  return mask;
}

/**
 * Spårar en mask (bredd × höjd, >0 = bläck) till en logga. Rutan beskärs till
 * bläckets utbredning, om inte `keepFrame` är satt. Förenklingen grovnar tills
 * banan ryms under taket i `LOGO_LIMITS`. `null` = ingen synlig logga i bilden.
 */
export function traceLogoMask(
  mask: ArrayLike<number>,
  width: number,
  height: number,
  options: TraceOptions = {},
): TracedLogo | null {
  const minArea = options.minAreaPx ?? DEFAULT_MIN_AREA_PX;
  const raw = contours(mask, width, height).filter((loop) => Math.abs(signedArea(loop)) >= minArea);
  if (raw.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const loop of raw) {
    for (const [x, y] of loop) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (options.keepFrame) {
    minX = 0;
    minY = 0;
    maxX = width;
    maxY = height;
  }

  let tolerance = options.tolerancePx ?? DEFAULT_TOLERANCE_PX;
  for (let attempt = 0; attempt < MAX_SIMPLIFY_ATTEMPTS; attempt++) {
    const simplified = raw
      .map((loop) => simplifyLoop(loop, tolerance))
      .filter((loop) => loop.length >= 3 && Math.abs(signedArea(loop)) >= minArea);
    const d = loopsToPath(simplified, minX, minY);
    if (d.length <= LOGO_LIMITS.maxPathChars && simplified.length > 0) {
      return {
        d,
        viewWidth: Math.max(1, Math.round((maxX - minX) * 10) / 10),
        viewHeight: Math.max(1, Math.round((maxY - minY) * 10) / 10),
      };
    }
    tolerance *= TOLERANCE_STEP;
  }
  return null;
}

const LOGO_PATH_TOKEN = /[MLZ]|-?\d+(?:\.\d+)?/g;

/** Det enda banformat loggan får ha — valideras på servern innan något ritas. */
export const LOGO_PATH_PATTERN = /^(?:[MLZ]|-?\d+(?:\.\d+)?|\s)+$/;

/**
 * En logga i färg som ligger i själva skylten: en PNG som base64 i en data-URL.
 * Bilden skrivs rakt in i SVG:n, så inget annat än de tecknen släpps igenom.
 */
export const LOGO_IMAGE_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

const LOGO_IMAGE_REF_PREFIX = "/api/logo-images/";

/**
 * En logga i färg som sparats på servern: skylten bär bara bildens adress på
 * sajten, där namnet är bildens SHA-256. Bilden sparas då en gång, hur många
 * skyltar som än delar den, och skylten ryms i en delad länk.
 */
export const LOGO_IMAGE_REF_PATTERN = /^\/api\/logo-images\/[0-9a-f]{64}$/;

/** Adressen till en sparad bild. */
export function logoImageRef(id: string): string {
  return `${LOGO_IMAGE_REF_PREFIX}${id}`;
}

/** Den sparade bildens id ur adressen, eller `null` när bilden ligger i skylten. */
export function logoImageRefId(src: string): string | null {
  return LOGO_IMAGE_REF_PATTERN.test(src) ? src.slice(LOGO_IMAGE_REF_PREFIX.length) : null;
}

/**
 * Loggans banor flyttade från egen ruta till skyltens mm: skalas `scale` och
 * förskjuts till (offsetX, offsetY). Koordinaterna kommer alltid i par.
 */
export function placeLogoPath(d: string, scale: number, offsetX: number, offsetY: number): string {
  const tokens = d.match(LOGO_PATH_TOKEN) ?? [];
  let out = "";
  let coordinate = 0;
  for (const token of tokens) {
    if (token === "M" || token === "L" || token === "Z") {
      out += token;
      coordinate = 0;
      continue;
    }
    const value = Number(token) * scale + (coordinate % 2 === 0 ? offsetX : offsetY);
    out += `${/[MLZ]$/.test(out) || out === "" ? "" : " "}${Number(value.toFixed(3))}`;
    coordinate++;
  }
  return out;
}
