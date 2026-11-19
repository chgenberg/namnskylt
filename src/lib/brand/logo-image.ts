import sharp from "sharp";

const MAX_INPUT_PIXELS = 40_000_000;
/** Loggan spåras till vektor i webbläsaren; längre sida än så ger inget mer. */
const LOGO_MAX_PX = 1200;
const PREVIEW_PX = 384;

const open = (buf: Buffer) => sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS, density: 300, animated: false });

/** Valfri bild (även SVG utan text) som PNG med bevarad transparens. */
export async function logoPng(buf: Buffer): Promise<Buffer> {
  return open(buf).resize(LOGO_MAX_PX, LOGO_MAX_PX, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
}

/** Platt grafik har få färger; `top3` = andel pixlar i de tre vanligaste. */
async function flatness(buf: Buffer): Promise<{ colours: number; top3: number }> {
  const { data, info } = await open(buf)
    .flatten({ background: "#FFFFFF" })
    .resize(48, 48, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const counts = new Map<number, number>();
  for (let k = 0; k + 2 < data.length; k += info.channels) {
    const key = (((data[k] ?? 0) >> 5) << 6) | (((data[k + 1] ?? 0) >> 5) << 3) | ((data[k + 2] ?? 0) >> 5);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const top = [...counts.values()].sort((a, b) => b - a);
  const px = data.length / info.channels;
  return { colours: counts.size, top3: ((top[0] ?? 0) + (top[1] ?? 0) + (top[2] ?? 0)) / px };
}

interface AlphaStats {
  /** Andel täckta pixlar inom de täckta pixlarnas ram. */
  fill: number;
  aspect: number;
  saturated: number;
  /** Medelluminans 0–255 för täckta pixlar. */
  luminance: number;
}

async function alphaStats(png: Buffer): Promise<AlphaStats | null> {
  const { data, info } = await open(png)
    .ensureAlpha()
    .resize(96, 96, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, opaque = 0, saturated = 0, luminance = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if ((data[i + 3] ?? 0) <= 128) continue;
      const r = data[i] ?? 0, g = data[i + 1] ?? 0, b = data[i + 2] ?? 0;
      opaque++;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max > 60 && (max - min) / max > 0.45) saturated++;
      luminance += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
  }
  if (x1 < 0) return null;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  return { fill: opaque / (bw * bh), aspect: bw / bh, saturated: saturated / opaque, luminance: luminance / opaque };
}

/** Flaggor, runda språkväljare och platta ikoner: få färger, helt fyllda, kvadrat till 3:2. */
export async function flagLike(png: Buffer): Promise<boolean> {
  const stats = await alphaStats(png);
  if (!stats) return false;
  const { top3 } = await flatness(png);
  return stats.fill > 0.72 && stats.aspect > 0.85 && stats.aspect < 2.1 && top3 > 0.88 && stats.saturated > 0.35;
}

/**
 * Längsta sidan när en bild prövas som tom ruta: en logga i spårningens storlek läses som den är.
 * En större bild glesas ut med närmaste pixel, så att tunna linjer inte tonas bort.
 */
const BLANK_SAMPLE_PX = LOGO_MAX_PX;
/** Från den här andelen täckta pixlar har bilden ingen genomskinlighet som skiljer loggan från bottnen. */
const BLANK_OPAQUE_SHARE = 0.99;
/** Så många tonsteg (av 255) ska en pixel skilja sig från bildens vanligaste ton för att räknas som innehåll. */
const BLANK_TONE_DISTANCE = 64;
/** Under den här andelen innehåll finns ingenting att spåra. */
const BLANK_CONTENT_SHARE = 0.002;

/**
 * En heltäckt ruta i nästan en enda ton är ingen logga (ägaren fick 2026-11-19 en svart ruta
 * bland loggorna från en hemsida, och en skylt med bara streck när den valdes). Så ser en
 * genomskinlig logga ut när en bildtjänst har gjort om den till JPEG: bottnen blir svart, och
 * en svart logga syns inte mot den. En logga på genomskinlig botten är aldrig tom, hur
 * enfärgad den än är: där skiljer genomskinligheten loggan från bottnen.
 */
export async function blankLike(buf: Buffer): Promise<boolean> {
  const { data, info } = await open(buf)
    .ensureAlpha()
    .resize(BLANK_SAMPLE_PX, BLANK_SAMPLE_PX, { fit: "inside", withoutEnlargement: true, kernel: "nearest" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const tones = new Array<number>(256).fill(0);
  let opaque = 0;
  for (let k = 0; k + 3 < data.length; k += 4) {
    if ((data[k + 3] ?? 0) <= 128) continue;
    opaque++;
    const tone = Math.round(0.2126 * (data[k] ?? 0) + 0.7152 * (data[k + 1] ?? 0) + 0.0722 * (data[k + 2] ?? 0));
    tones[tone] = (tones[tone] ?? 0) + 1;
  }
  if (opaque < info.width * info.height * BLANK_OPAQUE_SHARE) return false;
  const common = tones.indexOf(Math.max(...tones));
  const content = tones.reduce((sum, count, tone) => sum + (Math.abs(tone - common) > BLANK_TONE_DISTANCE ? count : 0), 0);
  return content < opaque * BLANK_CONTENT_SHARE;
}

/** En vit logga syns inte på ljus bakgrund — då visas den på mörkt för modellen. */
const LIGHT_LOGO_LUMINANCE = 200;

/** Liten JPEG som data-URL för visionsmodellen. */
export async function previewJpeg(buf: Buffer, size = PREVIEW_PX, background?: string): Promise<string> {
  const light = background ? false : ((await alphaStats(buf).catch(() => null))?.luminance ?? 0) > LIGHT_LOGO_LUMINANCE;
  const jpg = await open(buf)
    .flatten({ background: background ?? (light ? "#3A3A3C" : "#E8E8ED") })
    .resize(size, size, { fit: "inside" })
    .jpeg({ quality: 80 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpg.toString("base64")}`;
}

/**
 * Loggan att använda: modellens val om den svarat (−1 = ingen av kandidaterna),
 * annars den bäst placerade som inte ser ut som en flagga.
 */
export function chooseLogo(modelChoice: number | null, flags: readonly boolean[]): number | null {
  if (modelChoice !== null) return modelChoice >= 0 && modelChoice < flags.length ? modelChoice : null;
  const index = flags.findIndex((flag) => !flag);
  return index >= 0 ? index : null;
}

export const MAX_LOGO_OPTIONS = 4;

/**
 * Kandidaterna kunden kan välja mellan, den valda först. Med modellens svar
 * bara de den kände igen som företagets loggor; utan, alla som inte liknar flaggor.
 */
export function logoOptionOrder(
  chosen: number | null,
  alternatives: readonly number[] | null,
  flags: readonly boolean[],
  max = MAX_LOGO_OPTIONS,
): number[] {
  const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < flags.length;
  const rest = alternatives ?? flags.flatMap((flag, i) => (flag ? [] : [i]));
  const first = chosen !== null && inRange(chosen) ? [chosen] : [];
  return [...new Set([...first, ...rest.filter(inRange)])].slice(0, max);
}
