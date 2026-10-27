import sharp from "sharp";
import { z } from "zod";

/**
 * Stillbilden av 3D-skylten som skyltmotorn skickar med en order eller offert.
 * Den är bara en bild, men kommer från klienten: avkodas och kodas om här, så
 * att inget annat än pixlar sparas.
 */
export const MAX_SHOT_UPLOAD_CHARS = 6_000_000;
const SHOT_WIDTH_PX = 1000;
/** Luft runt skylten efter beskärningen, andel av bredden. */
const SHOT_PADDING = 0.06;
const MAX_SHOT_BYTES = 400_000;

export const badgeShotUploadSchema = z
  .string()
  .max(MAX_SHOT_UPLOAD_CHARS)
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/)
  .optional();

/** Beskuren WebP med transparent bakgrund, eller `null` om bilden inte går att använda. */
export async function normalizeBadgeShot(dataUrl: string | undefined | null): Promise<string | null> {
  const base64 = dataUrl?.split(",")[1];
  if (!base64) return null;
  try {
    const trimmed = await sharp(Buffer.from(base64, "base64"), { limitInputPixels: 25_000_000 })
      .ensureAlpha()
      .trim({ threshold: 4 })
      .toBuffer({ resolveWithObject: true });
    const pad = Math.round(trimmed.info.width * SHOT_PADDING);
    const webp = await sharp(trimmed.data)
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize({ width: SHOT_WIDTH_PX, withoutEnlargement: true })
      .webp({ quality: 86, alphaQuality: 90 })
      .toBuffer();
    return webp.length <= MAX_SHOT_BYTES ? `data:image/webp;base64,${webp.toString("base64")}` : null;
  } catch {
    return null;
  }
}

export function decodeBadgeShot(dataUrl: string): { type: string; body: Buffer } | null {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl);
  return match?.[1] && match[2] ? { type: match[1], body: Buffer.from(match[2], "base64") } : null;
}
