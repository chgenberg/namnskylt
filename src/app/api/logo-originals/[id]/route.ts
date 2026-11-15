import { NextResponse } from "next/server";
import { attachmentDisposition, downloadFileName } from "@/lib/logo-images/original-model";
import { getLogoOriginal } from "@/lib/logo-images/originals";
import { databaseConfigured } from "@/lib/orders/repository";
import { currentTenant } from "@/lib/reseller-auth/session";

export const runtime = "nodejs";

/**
 * Loggans originalfil, för den som är inloggad i panelen. Filen skickas alltid
 * som en nedladdning och aldrig med sin egen typ: en SVG kan innehålla skript
 * och får inte öppnas som en sida på sajten.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tenant = databaseConfigured() ? await currentTenant() : null;
  if (!tenant) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  const { id } = await params;
  const file = await getLogoOriginal(id).catch(() => null);
  if (!file) return NextResponse.json({ error: "Filen finns inte" }, { status: 404 });
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": attachmentDisposition(downloadFileName(file.id, file.name, file.mime)),
      "content-length": String(file.bytes.length),
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, no-store",
    },
  });
}
