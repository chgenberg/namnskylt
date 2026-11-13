import { NextResponse } from "next/server";
import { LOGO_IMAGE_REF_PATTERN, logoImageRef } from "@/engine";
import { getLogoImage } from "@/lib/logo-images/repository";

/** Bilden ändras aldrig: id:t är dess SHA-256. */
const IMMUTABLE = "public, max-age=31536000, immutable";

/** En sparad logga i färg. Adressen är den som skyltarna pekar på. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!LOGO_IMAGE_REF_PATTERN.test(logoImageRef(id))) return new NextResponse(null, { status: 404 });
  const png = await getLogoImage(id).catch(() => null);
  if (!png) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": IMMUTABLE, "x-content-type-options": "nosniff" },
  });
}
