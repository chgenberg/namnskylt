import { darkPlate, isLightLogo } from "@/lib/images/logo-tone";
import { renderShopMockup } from "@/lib/outreach/shop-mockup";
import { databaseConfigured } from "@/lib/orders/repository";
import { SHOP_SLUG } from "@/lib/shops/model";
import { getShop } from "@/lib/shops/repository";

export const runtime = "nodejs";

/** Bilden i mejlet till återförsäljaren. Öppen adress — mejlklienter hämtar utan inloggning. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!databaseConfigured() || !SHOP_SLUG.test(slug)) return new Response("Hittades inte", { status: 404 });
  const shop = await getShop(slug);
  if (!shop) return new Response("Hittades inte", { status: 404 });
  const plate = (await isLightLogo(shop.profile.logo)) ? darkPlate(shop.profile.primaryColor) : null;
  const png = await renderShopMockup(shop, plate);
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
  });
}
