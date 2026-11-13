import { NextResponse } from "next/server";
import { z } from "zod";
import { LOGO_IMAGE_PATTERN, LOGO_LIMITS } from "@/engine";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { storeLogoImage } from "@/lib/logo-images/repository";

const HOUR_MS = 60 * 60 * 1000;
/** En kund provar några loggor; hundratals i timmen är något annat. */
const perClient = createRateLimiter({ limit: 60, windowMs: HOUR_MS });
const site = createRateLimiter({ limit: 2000, windowMs: HOUR_MS });

const uploadSchema = z.strictObject({ src: z.string().max(LOGO_LIMITS.maxImageChars).regex(LOGO_IMAGE_PATTERN) });

/**
 * Sparar en logga i färg från skyltmotorn och svarar med adressen som skylten
 * ska peka på. Skylten bär då bara adressen, inte bilden.
 */
export async function POST(request: Request) {
  const parsed = uploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ogiltig bild" }, { status: 400 });
  if (!perClient.take(clientKey(request)) || !site.take("site")) {
    return NextResponse.json({ error: "För många bilder just nu. Försök igen om en stund." }, { status: 429 });
  }
  try {
    const src = await storeLogoImage(parsed.data.src);
    // Utan databas, eller med en bild som inte är en PNG, får bilden ligga kvar i skylten.
    return src ? NextResponse.json({ src }) : NextResponse.json({ error: "Bilden gick inte att spara" }, { status: 422 });
  } catch (error) {
    console.error("Loggans bild kunde inte sparas", error);
    return NextResponse.json({ error: "Bilden gick inte att spara" }, { status: 503 });
  }
}
