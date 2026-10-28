import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_ORDER_BADGES, badgeDocumentSchema } from "@/engine";
import { placeOrder } from "@/lib/orders/place-order";
import { badgeShotUploadSchema, normalizeBadgeShot } from "@/lib/images/badge-shot";
import { databaseConfigured, getCustomer } from "@/lib/orders/repository";
import { currentTenant } from "@/lib/reseller-auth/session";

export const runtime = "nodejs";

const requestSchema = z.object({
  customerId: z.uuid(),
  badges: z.array(badgeDocumentSchema).min(1).max(MAX_ORDER_BADGES),
  badgeShot: badgeShotUploadSchema,
});

/** Återförsäljaren lägger en order åt en kund — samma väg till tillverkningen som webbshoppen. */
export async function POST(request: Request) {
  const tenant = await currentTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  }
  if (!databaseConfigured()) return NextResponse.json({ error: "Databasen är inte kopplad" }, { status: 503 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ogiltig order" }, { status: 400 });

  const customer = await getCustomer(tenant, parsed.data.customerId);
  if (!customer) return NextResponse.json({ error: "Kunden finns inte" }, { status: 404 });
  try {
    const receipt = await placeOrder({
      tenant,
      customer,
      badges: parsed.data.badges,
      source: "reseller",
      note: "Lagd av återförsäljaren",
      demo: customer.demo,
      badgeShot: await normalizeBadgeShot(parsed.data.badgeShot),
    });
    return NextResponse.json(receipt, { status: 201 });
  } catch (error) {
    console.error("Återförsäljarens order kunde inte läggas", error);
    return NextResponse.json({ error: "Tillverkningen kunde inte ta emot ordern" }, { status: 502 });
  }
}
