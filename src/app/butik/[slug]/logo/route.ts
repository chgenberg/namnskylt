import { decodeImageDataUrl } from "@/lib/images/badge-shot";
import { databaseConfigured } from "@/lib/orders/repository";
import { SHOP_SLUG } from "@/lib/shops/model";
import { getShop } from "@/lib/shops/repository";

export const runtime = "nodejs";

/** Butikens logga som fil — listan i panelen bär annars hundratals data-URL:er. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!databaseConfigured() || !SHOP_SLUG.test(slug)) return new Response("Hittades inte", { status: 404 });
  const logo = (await getShop(slug))?.profile.logo;
  const image = logo ? decodeImageDataUrl(logo) : null;
  if (!image) return new Response("Hittades inte", { status: 404 });
  return new Response(new Uint8Array(image.body), {
    headers: { "content-type": image.type, "cache-control": "public, max-age=3600" },
  });
}
