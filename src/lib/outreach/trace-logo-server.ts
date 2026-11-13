import sharp from "sharp";
import { inkMask, traceLogoMask, type TracedLogo } from "@/engine";

/** Samma upplösning som designerns spårning, så loggan blir likadan i mejlet och i butiken. */
const TRACE_MAX_PX = 520;
const MAX_INPUT_PIXELS = 40_000_000;
/** Mer bläck än så är ett foto eller en färgplatta, inte en logga som går att gravera. */
const MAX_INK_SHARE = 0.6;

/** Loggan som graverbar kontur. `null` = bilden går inte att läsa eller ger ingen logga. */
export async function traceLogoBuffer(bytes: Buffer): Promise<TracedLogo | null> {
  try {
    const { data, info } = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .resize({ width: TRACE_MAX_PX, height: TRACE_MAX_PX, fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Samma mask som designern: detaljer inuti en fylld form blir urtag.
    const mask = inkMask({ data, width: info.width, height: info.height });
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
