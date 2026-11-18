import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { databaseConfigured } from "@/lib/orders/repository";
import { renderMailBadge } from "@/lib/quotes/mail-image";
import { getQuoteByToken } from "@/lib/quotes/repository";

export const runtime = "nodejs";

/** Bilden hämtas av e-postklienter, ofta genom en mellanserver som många delar. Taket skyddar bara mot rena missbruk. */
const perClient = createRateLimiter({ limit: 600, windowMs: 60 * 60 * 1000 });

/**
 * Bilden av offertens första skylt, till offertmejlet. Koden i adressen är
 * behörigheten, som för offerten själv: bilden visar inget som offertsidan
 * inte redan visar.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!databaseConfigured()) return new Response("Hittades inte", { status: 404 });
  const quote = await getQuoteByToken((await params).token);
  const badge = quote?.badges[0];
  if (!quote || quote.status === "cancelled" || !badge) return new Response("Hittades inte", { status: 404 });
  if (!perClient.take(clientKey(request))) return new Response("För många förfrågningar", { status: 429 });
  try {
    const png = await renderMailBadge(badge);
    return new Response(new Uint8Array(png), {
      headers: { "content-type": "image/png", "cache-control": "public, max-age=3600", "x-robots-tag": "noindex" },
    });
  } catch (error) {
    console.error("Offertmejlets bild kunde inte ritas", error);
    return new Response("Bilden kunde inte ritas", { status: 500 });
  }
}
