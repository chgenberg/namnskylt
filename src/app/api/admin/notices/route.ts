import { NextResponse } from "next/server";
import { countUnreadNotices } from "@/lib/notices/repository";
import { databaseConfigured } from "@/lib/orders/repository";
import { currentTenant } from "@/lib/reseller-auth/session";

export const runtime = "nodejs";

/** Antalet olästa besked för den inloggade. Panelen frågar medan den är öppen, så att siffran i menyn stämmer. */
export async function GET() {
  const tenant = databaseConfigured() ? await currentTenant() : null;
  if (!tenant) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  return NextResponse.json({ unread: await countUnreadNotices(tenant) }, { headers: { "cache-control": "no-store" } });
}
