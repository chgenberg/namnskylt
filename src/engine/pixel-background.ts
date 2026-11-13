import type { RgbaPixels } from "./logo";

/** 4 bitar per kanal räcker för att hitta kantens vanligaste färg. */
const COLOR_BUCKET_SHIFT = 4;

/** Index för pixlarna längs bildens fyra kanter. */
export function* edgePixels(width: number, height: number): Generator<number> {
  for (let x = 0; x < width; x++) {
    yield x;
    yield (height - 1) * width + x;
  }
  for (let y = 0; y < height; y++) {
    yield y * width;
    yield y * width + width - 1;
  }
}

/** Kantens vanligaste färg — bottnen i en bild utan genomskinlighet. */
export function edgeColor({ data, width, height }: RgbaPixels): [number, number, number] {
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (const pixel of edgePixels(width, height)) {
    const i = pixel * 4;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const key = ((r >> COLOR_BUCKET_SHIFT) << 8) | ((g >> COLOR_BUCKET_SHIFT) << 4) | (b >> COLOR_BUCKET_SHIFT);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  let best = { count: 0, r: 255, g: 255, b: 255 };
  for (const bucket of buckets.values()) if (bucket.count > best.count) best = bucket;
  const count = Math.max(1, best.count);
  return [best.r / count, best.g / count, best.b / count];
}
