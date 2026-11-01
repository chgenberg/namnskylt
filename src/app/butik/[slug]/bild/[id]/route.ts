import { IMAGE_ID } from "@/lib/shops/content";
import { getImage } from "@/lib/shops/editor-repository";
import { databaseConfigured } from "@/lib/orders/repository";
import { SHOP_SLUG } from "@/lib/shops/model";

export const runtime = "nodejs";

/** Butikens uppladdade bilder. Id:t byts när bilden byts, så den får cachas länge. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!databaseConfigured() || !SHOP_SLUG.test(slug) || !IMAGE_ID.test(id)) return new Response("Hittades inte", { status: 404 });
  const image = await getImage(slug, id);
  if (!image) return new Response("Hittades inte", { status: 404 });
  return new Response(new Uint8Array(image.bytes), {
    headers: { "content-type": image.mime, "cache-control": "public, max-age=31536000, immutable" },
  });
}
