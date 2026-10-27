import { createHash } from "node:crypto";
import sharp from "sharp";

/** Andel genomskinliga pixlar som gör att loggan saknar egen bakgrund. */
const TRANSPARENT_SHARE = 0.15;
/** Medelljushet (0–1) på loggans synliga pixlar som räknas som vit logga. */
const LIGHT_LUMINANCE = 0.8;
const SAMPLE_PX = 64;
const CACHE_LIMIT = 2_000;

const cache = new Map<string, boolean>();

/**
 * `true` när loggan är ljus på genomskinlig botten — den försvinner på vitt och
 * behöver en mörk platta. En logga med egen bakgrund syns alltid.
 */
export async function isLightLogo(dataUrl: string | null | undefined): Promise<boolean> {
  const base64 = dataUrl?.split(",")[1];
  if (!base64) return false;
  const key = createHash("sha1").update(base64).digest("hex");
  const known = cache.get(key);
  if (known !== undefined) return known;

  let light = false;
  try {
    const { data, info } = await sharp(Buffer.from(base64, "base64"))
      .ensureAlpha()
      .resize(SAMPLE_PX, SAMPLE_PX, { fit: "inside" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    let transparent = 0;
    let visible = 0;
    let luminance = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const alpha = (data[i + 3] ?? 0) / 255;
      if (alpha < 0.125) {
        transparent++;
        continue;
      }
      const [r, g, b] = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
      luminance += ((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) * alpha;
      visible += alpha;
    }
    const pixels = data.length / info.channels;
    light = visible > 0 && transparent / pixels >= TRANSPARENT_SHARE && luminance / visible >= LIGHT_LUMINANCE;
  } catch {
    light = false;
  }

  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value ?? "");
  cache.set(key, light);
  return light;
}

/** Plattan bakom en ljus logga: butikens färg när den är mörk nog, annars nästan svart. */
export function darkPlate(primaryColor: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(primaryColor.slice(i, i + 2), 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45 ? primaryColor : "#111418";
}
