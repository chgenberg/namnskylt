import sharp from "sharp";
import { inkMask, otsuThreshold, traceLogoMask, type RgbaPixels, type TracedLogo } from "@/engine";

/** Samma upplösning som designerns spårning, så loggan blir likadan i mejlet och i butiken. */
const TRACE_MAX_PX = 520;
const MAX_INPUT_PIXELS = 40_000_000;
/** Mer bläck än så är ett foto eller en färgplatta, inte en logga som går att gravera. */
const MAX_INK_SHARE = 0.6;
const ALPHA_INK = 128;
/** Så olika måste ljus detalj och mörk yta vara för att detaljen ska bli hål i gravyren. */
const MIN_DETAIL_CONTRAST = 90;
const MIN_DETAIL_SHARE = 0.03;
const MAX_DETAIL_SHARE = 0.45;

const luminanceAt = (data: ArrayLike<number>, i: number) =>
  0.2126 * (data[i * 4] ?? 0) + 0.7152 * (data[i * 4 + 1] ?? 0) + 0.0722 * (data[i * 4 + 2] ?? 0);

/**
 * En genomskinlig logga med text i en annan ton inuti en färgad form (sköld,
 * cirkel) blir annars en massiv form. Detalj som ligger helt inne i formen
 * blir hål, så texten syns i gravyren. Detalj som rör genomskinligheten är
 * en egen del av loggan (ett ord i en annan färg) och förblir bläck.
 */
export function enclosedDetailMask({ data, width, height }: RgbaPixels): Uint8Array | null {
  const count = width * height;
  const opaque = new Uint8Array(count);
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    if ((data[i * 4 + 3] ?? 0) >= ALPHA_INK) {
      opaque[i] = 1;
      values.push(luminanceAt(data, i));
    }
  }
  if (values.length === 0 || values.length === count) return null;

  const threshold = otsuThreshold(values);
  let lightSum = 0;
  let light = 0;
  let darkSum = 0;
  for (const v of values) {
    if (v > threshold) {
      lightSum += v;
      light++;
    } else darkSum += v;
  }
  const dark = values.length - light;
  if (light === 0 || dark === 0) return null;
  const minorityIsLight = light <= dark;
  const minority = minorityIsLight ? light : dark;
  const share = minority / values.length;
  if (lightSum / light - darkSum / dark < MIN_DETAIL_CONTRAST || share < MIN_DETAIL_SHARE || share > MAX_DETAIL_SHARE) {
    return null;
  }

  const isDetail = (i: number) => opaque[i] === 1 && luminanceAt(data, i) > threshold === minorityIsLight;
  const mask = new Uint8Array(opaque);
  const seen = new Uint8Array(count);
  let holes = 0;
  for (let start = 0; start < count; start++) {
    if (seen[start] || !isDetail(start)) continue;
    const component: number[] = [];
    let enclosed = true;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop() ?? 0;
      component.push(i);
      const x = i % width;
      const y = (i - x) / width;
      const neighbours = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1];
      for (const n of neighbours) {
        if (n < 0 || !opaque[n]) {
          enclosed = false;
          continue;
        }
        if (!seen[n] && isDetail(n)) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (!enclosed) continue;
    holes++;
    for (const i of component) mask[i] = 0;
  }
  return holes > 0 ? mask : null;
}

/** Loggan som graverbar kontur. `null` = bilden går inte att läsa eller ger ingen logga. */
export async function traceLogoBuffer(bytes: Buffer): Promise<TracedLogo | null> {
  try {
    const { data, info } = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .resize({ width: TRACE_MAX_PX, height: TRACE_MAX_PX, fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = { data, width: info.width, height: info.height };
    const mask = enclosedDetailMask(pixels) ?? inkMask(pixels);
    const ink = mask.reduce((sum, v) => sum + v, 0);
    if (ink / mask.length > MAX_INK_SHARE) return null;
    return traceLogoMask(mask, info.width, info.height);
  } catch {
    return null;
  }
}

/** Loggan ur en data-URL, som butikens profil sparar den. */
export function dataUrlBytes(dataUrl: string | null | undefined): Buffer | null {
  const base64 = dataUrl?.match(/^data:image\/[a-z+]+;base64,(.+)$/)?.[1];
  return base64 ? Buffer.from(base64, "base64") : null;
}
