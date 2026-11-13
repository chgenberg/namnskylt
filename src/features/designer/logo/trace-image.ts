import { inkMask, traceLogoMask, type TracedLogo } from "@/engine";
import { isBrandColor, toHex } from "@/lib/brand/color";

/** Längsta sida på bilden som spåras — skarpt nog för en logga på 5–40 mm. */
const TRACE_MAX_PX = 520;
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
