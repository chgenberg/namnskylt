import { NextResponse } from "next/server";
import { z } from "zod";
import { badgeDocumentSchema, type BadgeDocument } from "@/engine";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { decodeShareCode } from "@/lib/share/share-link";
import { renderShareImage } from "@/lib/share/share-image";

export const runtime = "nodejs";

const HOUR_MS = 60 * 60 * 1000;
/** Renderingen är billig men inte gratis; länkförhandsvisningar hämtar från samma få servrar. */
const perClient = createRateLimiter({ limit: 300, windowMs: HOUR_MS });
const site = createRateLimiter({ limit: 6000, windowMs: HOUR_MS });

const postSchema = z.object({ badge: badgeDocumentSchema });

async function respond(request: Request, doc: BadgeDocument | null, cacheable: boolean) {
  if (!doc) return NextResponse.json({ error: "Ogiltig skylt" }, { status: 400 });
  if (!perClient.take(clientKey(request)) || !site.take("site")) {
    return NextResponse.json({ error: "För många bilder på kort tid" }, { status: 429 });
  }
  const png = await renderShareImage(doc);
  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      // Koden i adressen är hela innehållet, så bilden ändras aldrig för samma adress.
      "cache-control": cacheable ? "public, max-age=31536000, immutable" : "no-store",
    },
  });
}

/** Delningsbilden för en länk — det som visas i chattar och sociala medier. */
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("d");
  return respond(request, await decodeShareCode(code), true);
}

/** Delningsbilden för skylten i designern, med logga oavsett länkens längd. */
export async function POST(request: Request) {
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  return respond(request, parsed.success ? parsed.data.badge : null, false);
}
