import { createHash } from "node:crypto";
import sharp from "sharp";
import { darkPlate, isLightPixels, LOGO_SAMPLE_PX } from "./logo-plate";

export { darkPlate };

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
      .resize(LOGO_SAMPLE_PX, LOGO_SAMPLE_PX, { fit: "inside" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    light = isLightPixels(data, info.channels);
  } catch {
    light = false;
  }

  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value ?? "");
  cache.set(key, light);
  return light;
}
