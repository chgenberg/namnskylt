import { decodeImageDataUrl } from "@/lib/images/badge-shot";
import { databaseConfigured, getBadgeShot } from "@/lib/orders/repository";
import { currentTenant } from "@/lib/reseller-auth/session";

export const runtime = "nodejs";

/** Orderns stillbild för korten i panelen — egen adress så att listan inte bär bilderna. */
export async function GET(_request: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  const tenant = await currentTenant();
  if (!tenant) {
    return new Response("Inte inloggad", { status: 401 });
  }
  const { orderNo } = await params;
  if (!databaseConfigured() || !/^NS-\d{1,9}$/.test(orderNo)) return new Response("Hittades inte", { status: 404 });
  const shot = await getBadgeShot(tenant, orderNo);
  const image = shot ? decodeImageDataUrl(shot) : null;
  if (!image) return new Response("Hittades inte", { status: 404 });
  return new Response(new Uint8Array(image.body), {
    headers: { "content-type": image.type, "cache-control": "private, max-age=86400, immutable" },
  });
}
