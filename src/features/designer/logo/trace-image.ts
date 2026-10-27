import { otsuThreshold, traceLogoMask, type TracedLogo } from "@/engine";
import { isBrandColor, toHex } from "@/lib/brand/color";

/** Längsta sida på bilden som spåras — skarpt nog för en logga på 5–40 mm. */
const TRACE_MAX_PX = 520;
/** Andel genomskinliga pixlar som gör att alfakanalen avgör vad som är bläck. */
const TRANSPARENT_SHARE = 0.02;
const ALPHA_INK = 128;
/** 4 bitar per kanal räcker för att hitta loggans huvudfärg. */
const COLOR_BUCKET_SHIFT = 4;

export interface LogoTrace extends TracedLogo {
  /** Loggans mest använda varumärkesfärg, om den har någon. */
  inkColor: string | null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Bilden gick inte att läsa"));
    image.src = src;
  });
}

function pixels(image: HTMLImageElement): ImageData {
  const naturalW = image.naturalWidth || TRACE_MAX_PX;
  const naturalH = image.naturalHeight || TRACE_MAX_PX;
  const scale = TRACE_MAX_PX / Math.max(naturalW, naturalH);
  const width = Math.max(1, Math.round(naturalW * scale));
  const height = Math.max(1, Math.round(naturalH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Webbläsaren kan inte läsa bilden");
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

/**
 * Bläck eller botten per pixel. Genomskinlig bild: allt synligt är bläck.
 * Ogenomskinlig: ljusheten delas med Otsus tröskel, och den klass som
 * dominerar kanten räknas som botten — så både mörk logga på vitt och vit
 * logga på färg blir rätt.
 */
function inkMask({ data, width, height }: ImageData, invert: boolean): Uint8Array {
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
  if (invert) for (let i = 0; i < count; i++) mask[i] = mask[i] ? 0 : 1;
  return mask;
}

function dominantInkColor({ data }: ImageData, mask: Uint8Array): string | null {
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    if (!isBrandColor([r, g, b])) continue;
    const key = ((r >> COLOR_BUCKET_SHIFT) << 8) | ((g >> COLOR_BUCKET_SHIFT) << 4) | (b >> COLOR_BUCKET_SHIFT);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const bucket of buckets.values()) if (!best || bucket.count > best.count) best = bucket;
  // Några enstaka färgade kantpixlar i en svart logga är inte en varumärkesfärg.
  if (!best || best.count < mask.length * 0.002) return null;
  return toHex([best.r / best.count, best.g / best.count, best.b / best.count]);
}

/** Spårar en bild (data- eller objekt-URL) till en graverbar logga. `null` = inget att gravera. */
export async function traceImage(src: string, invert = false): Promise<LogoTrace | null> {
  const image = await loadImage(src);
  const imageData = pixels(image);
  const mask = inkMask(imageData, invert);
  const traced = traceLogoMask(mask, imageData.width, imageData.height);
  return traced ? { ...traced, inkColor: dominantInkColor(imageData, mask) } : null;
}
