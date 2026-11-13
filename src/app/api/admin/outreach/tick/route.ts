import { NextResponse } from "next/server";
import { databaseConfigured } from "@/lib/orders/repository";
import { runOutreachTickNow } from "@/lib/outreach/run-tick";
import { currentTenant } from "@/lib/reseller-auth/session";
import { isOwner } from "@/lib/tenants/model";

export const runtime = "nodejs";

/** «Kör ett tick» i admin. Bara ägaren; samma spärrar som cron. */
export async function POST() {
  const tenant = await currentTenant();
  if (!tenant || !isOwner(tenant)) return NextResponse.json({ error: "Bara ägaren" }, { status: 403 });
  if (!databaseConfigured()) return NextResponse.json({ error: "Databasen är inte kopplad" }, { status: 503 });
  const result = await runOutreachTickNow("admin");
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
