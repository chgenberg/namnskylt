import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { invoiceCsv, ordersCsv } from "@/lib/orders/csv";
import { databaseConfigured, listOrders } from "@/lib/orders/repository";
import { resellerPass } from "@/lib/reseller-auth/session";

export const runtime = "nodejs";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const querySchema = z.object({
  type: z.enum(["orders", "invoice"]),
  from: day.optional().or(z.literal("")),
  to: day.optional().or(z.literal("")),
});

/** Datumen gäller svensk tid; `to` tar med hela dagen. */
function inRange(iso: string, from: string | undefined, to: string | undefined): boolean {
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm" }).format(new Date(iso));
  return (!from || local >= from) && (!to || local <= to);
}

export async function GET(request: Request) {
  if (!(await resellerPass.verify((await cookies()).get(resellerPass.cookie)?.value))) {
    return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  }
  if (!databaseConfigured()) return NextResponse.json({ error: "Databasen är inte kopplad" }, { status: 503 });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 });

  const { type, from, to } = parsed.data;
  const orders = (await listOrders()).filter((o) => inRange(o.placedAt, from || undefined, to || undefined));
  const csv = type === "invoice" ? invoiceCsv(orders) : ordersCsv(orders);
  const name = `namnskylt-${type === "invoice" ? "fakturaunderlag" : "ordrar"}-${from || "start"}-${to || "idag"}.csv`;
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
