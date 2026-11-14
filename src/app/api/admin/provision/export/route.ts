import { NextResponse } from "next/server";
import { requireDb } from "@/lib/db/client";
import { inPeriod, PERIOD_PATTERN, provisionCsv } from "@/lib/orders/provision";
import { listResellerOrders } from "@/lib/orders/provision-store";
import { databaseConfigured, getPriceModel } from "@/lib/orders/repository";
import { currentTenant } from "@/lib/reseller-auth/session";
import { isOwner } from "@/lib/tenants/model";

export const runtime = "nodejs";

/** Periodens underlag som CSV: vad varje återförsäljare betalar, frakten, provisionen och verkstadens del. Bara admin. */
export async function GET(request: Request) {
  const tenant = databaseConfigured() ? await currentTenant() : null;
  if (!tenant || !isOwner(tenant)) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  const asked = new URL(request.url).searchParams.get("period");
  const period = asked && PERIOD_PATTERN.test(asked) ? asked : null;
  const rows = inPeriod(await listResellerOrders(requireDb(), await getPriceModel()), period);
  return new NextResponse(provisionCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="underlag-${period ?? "alla"}.csv"`,
      "cache-control": "no-store",
    },
  });
}
