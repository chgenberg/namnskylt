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
export async function flatness(buf: Buffer): Promise<{ colours: number; top3: number }> {
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
