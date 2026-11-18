import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { sellerMailLogo } from "@/lib/email/seller-brand";
import { databaseConfigured, getSellerProfile } from "@/lib/orders/repository";
import { getQuoteByToken } from "@/lib/quotes/repository";

export const runtime = "nodejs";

const perClient = createRateLimiter({ limit: 600, windowMs: 60 * 60 * 1000 });

/**
 * Säljarens logga som PNG, till offertmejlet. Koden i adressen är behörigheten:
 * loggan står redan överst på offertsidan för den som har länken.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!databaseConfigured()) return new Response("Hittades inte", { status: 404 });
  const quote = await getQuoteByToken((await params).token);
  if (!quote || quote.status === "cancelled") return new Response("Hittades inte", { status: 404 });
  if (!perClient.take(clientKey(request))) return new Response("För många förfrågningar", { status: 429 });
  const logo = await sellerMailLogo(await getSellerProfile(quote.resellerId));
  if (!logo) return new Response("Hittades inte", { status: 404 });
  return new Response(new Uint8Array(logo.png), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=86400", "x-robots-tag": "noindex" },
  });
}
