import sharp from "sharp";
import { decodeImageDataUrl } from "@/lib/images/badge-shot";
import { darkPlate, isLightLogo } from "@/lib/images/logo-tone";
import { databaseConfigured } from "@/lib/orders/repository";
import { SHOP_SLUG } from "@/lib/shops/model";
import { getShop } from "@/lib/shops/repository";

export const runtime = "nodejs";

const ICON_PX = 256;
const INSET_PX = 28;
/** Bredare loggor än så blir oläsliga i en flik — då används symbolen längst till vänster. */
const MAX_ICON_ASPECT = 1.6;

/** Butikens fliksymbol: loggan (eller dess vänstra symbol) på en kvadrat. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!databaseConfigured() || !SHOP_SLUG.test(slug)) return new Response("Hittades inte", { status: 404 });
  const shop = await getShop(slug);
  const image = shop?.profile.logo ? decodeImageDataUrl(shop.profile.logo) : null;
  if (!shop || !image) return new Response("Hittades inte", { status: 404 });

  try {
    const trimmed = await sharp(image.body).ensureAlpha().trim().png().toBuffer({ resolveWithObject: true });
    const { width, height } = trimmed.info;
    const mark =
      width / height > MAX_ICON_ASPECT
        ? sharp(trimmed.data).extract({ left: 0, top: 0, width: Math.min(width, height), height })
        : sharp(trimmed.data);
    const inner = ICON_PX - INSET_PX * 2;
    const logo = await mark.resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const background = (await isLightLogo(shop.profile.logo)) ? darkPlate(shop.profile.primaryColor) : "#ffffff";
    const png = await sharp({ create: { width: ICON_PX, height: ICON_PX, channels: 4, background } })
      .composite([{ input: logo, left: INSET_PX, top: INSET_PX }])
      .png()
      .toBuffer();
    return new Response(new Uint8Array(png), {
      headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
    });
  } catch {
    return new Response("Hittades inte", { status: 404 });
  }
}
