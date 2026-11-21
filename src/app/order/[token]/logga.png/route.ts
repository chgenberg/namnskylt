import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { sellerMailLogo } from "@/lib/email/seller-brand";
import { databaseConfigured, getOrderByCustomerToken, getSellerProfile } from "@/lib/orders/repository";
import { getShop } from "@/lib/shops/repository";

export const runtime = "nodejs";

const perClient = createRateLimiter({ limit: 600, windowMs: 60 * 60 * 1000 });

/**
 * Säljarens logga som PNG, till orderbekräftelsen och mejlet om att ordern är skickad. För en
 * order i en butik är det butikens logga, som kunden såg när den beställde. Koden i adressen är
 * behörigheten: loggan står redan överst på kundens ordersida för den som har länken.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!databaseConfigured()) return new Response("Hittades inte", { status: 404 });
  const order = await getOrderByCustomerToken((await params).token);
  if (!order) return new Response("Hittades inte", { status: 404 });
  if (!perClient.take(clientKey(request))) return new Response("För många förfrågningar", { status: 429 });
  const shop = order.shopSlug ? await getShop(order.shopSlug) : null;
  const logo = await sellerMailLogo(shop ? shop.profile : await getSellerProfile(order.resellerId));
  if (!logo) return new Response("Hittades inte", { status: 404 });
  return new Response(new Uint8Array(logo.png), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=86400", "x-robots-tag": "noindex" },
  });
}
