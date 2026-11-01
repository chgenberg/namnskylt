import { NextResponse } from "next/server";
import sharp from "sharp";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { databaseConfigured } from "@/lib/orders/repository";
import { currentTenant } from "@/lib/reseller-auth/session";
import { canManageShop, countImages, MAX_SHOP_IMAGES, saveImage } from "@/lib/shops/editor-repository";
import { SHOP_SLUG } from "@/lib/shops/model";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_EDGE_PX = 1800;
const uploads = createRateLimiter({ limit: 120, windowMs: 60 * 60 * 1000 });

/** En bild till butiken: roteras rätt, krymps och sparas som WebP. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const tenant = await currentTenant();
  const { slug } = await params;
  if (!databaseConfigured() || !SHOP_SLUG.test(slug) || !(await canManageShop(tenant, slug))) {
    return NextResponse.json({ error: "Inte behörig" }, { status: 403 });
  }
  if (!uploads.take(tenant ?? "okänd")) return NextResponse.json({ error: "Många bilder på kort tid. Vänta en stund." }, { status: 429 });
  if ((await countImages(slug)) >= MAX_SHOP_IMAGES) {
    return NextResponse.json({ error: `Butiken har redan ${MAX_SHOP_IMAGES} bilder. Ta bort några först.` }, { status: 400 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Välj en bild" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Bilden är större än 12 MB" }, { status: 400 });
  try {
    const { data, info } = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const image = await saveImage(slug, { mime: "image/webp", bytes: data, width: info.width, height: info.height });
    return NextResponse.json(image, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Filen gick inte att läsa som bild. Prova JPG, PNG eller WebP." }, { status: 400 });
  }
}
