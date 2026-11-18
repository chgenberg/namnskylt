import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";

/** Säljarens logga får högst ta så här stor plats överst i mejlet. */
const MAX_WIDTH = 180;
const MAX_HEIGHT = 44;
/** Filen är dubbelt så stor som loggan visas. */
const SCALE = 2;
/** Luft runt en ljus logga på sin mörka platta. */
const PLATE_PAD = 8;
const CACHE_LIMIT = 200;

export interface MailLogo {
  png: Buffer;
  /** Måtten loggan visas i. */
  width: number;
  height: number;
}

const cache = new Map<string, MailLogo | null>();

/**
 * Säljarens logga gjord för mejl: en PNG i lagom storlek. I företagsuppgifterna
 * ligger loggan som en data-URL, ofta i WebP, och det visar varken Gmail eller
 * Outlook. En ljus logga på genomskinlig botten får sin mörka platta, som på
 * offerten. `null` när loggan saknas eller inte går att läsa: då står namnet.
 */
export async function mailLogo(dataUrl: string | null | undefined, plate: string | null): Promise<MailLogo | null> {
  const base64 = dataUrl?.split(",")[1];
  if (!base64) return null;
  const key = createHash("sha1").update(base64).update(plate ?? "").digest("hex");
  const known = cache.get(key);
  if (known !== undefined) return known;

  let logo: MailLogo | null = null;
  try {
    const source = Buffer.from(base64, "base64");
    const { width: w = 0, height: h = 0 } = await sharp(source).metadata();
    if (w > 0 && h > 0) {
      const pad = plate ? PLATE_PAD : 0;
      const fit = Math.min((MAX_WIDTH - pad * 2) / w, (MAX_HEIGHT - pad * 2) / h);
      const width = Math.max(1, Math.round(w * fit));
      const height = Math.max(1, Math.round(h * fit));
      const sized = sharp(source).resize(width * SCALE, height * SCALE, { fit: "fill" });
      // sharp lägger loggan på plattan först och bygger sedan ut bilden, vilken ordning anropen än står i: kanten får därför plattans färg direkt.
      const png = plate
        ? await sized
            .flatten({ background: plate })
            .extend({ top: pad * SCALE, bottom: pad * SCALE, left: pad * SCALE, right: pad * SCALE, background: plate })
            .png()
            .toBuffer()
        : await sized.png().toBuffer();
      logo = { png, width: width + pad * 2, height: height + pad * 2 };
    }
  } catch {
    logo = null;
  }

  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value ?? "");
  cache.set(key, logo);
  return logo;
}
