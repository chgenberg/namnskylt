import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_ORDER_BADGES, badgeDocumentSchema } from "@/engine";
import { deliverySchema } from "@/lib/orders/delivery";
import { ERASED_CUSTOMER_ERROR, isErasedCustomer } from "@/lib/orders/erase-model";
import { NOT_OFFERED_ERROR, allOffered } from "@/lib/orders/model";
import { placeOrder } from "@/lib/orders/place-order";
import { badgeShotUploadSchema, normalizeBadgeShot } from "@/lib/images/badge-shot";
import { databaseConfigured, getCustomer, getOrder, saveResellerDeliveryAddress } from "@/lib/orders/repository";
import { currentTenant } from "@/lib/reseller-auth/session";

export const runtime = "nodejs";

const requestSchema = z.object({
  customerId: z.uuid(),
  badges: z.array(badgeDocumentSchema).min(1).max(MAX_ORDER_BADGES),
  badgeShot: badgeShotUploadSchema,
  project: z.string().trim().max(120).optional(),
  delivery: deliverySchema,
  /** Ordern som öppnades för ändring i skyltmotorn ("Beställ igen" med andra namn eller antal). */
  copyOf: z.string().regex(/^NS-\d{1,9}$/).optional(),
});

/** Återförsäljaren lägger en order åt en kund — samma väg till tillverkningen som webbshoppen. */
export async function POST(request: Request) {
  const tenant = await currentTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  }
  if (!databaseConfigured()) return NextResponse.json({ error: "Databasen är inte kopplad" }, { status: 503 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // Adressens fel är skrivna för den som fyller i formuläret.
    return NextResponse.json({ error: issue?.path[0] === "delivery" ? issue.message : "Ogiltig order" }, { status: 400 });
  }
  if (!allOffered(parsed.data.badges)) return NextResponse.json({ error: NOT_OFFERED_ERROR }, { status: 400 });

  const customer = await getCustomer(tenant, parsed.data.customerId);
  if (!customer) return NextResponse.json({ error: "Kunden finns inte" }, { status: 404 });
  if (isErasedCustomer(customer)) return NextResponse.json({ error: ERASED_CUSTOMER_ERROR }, { status: 409 });
  // Länken tillbaka gäller bara återförsäljarens egen order till samma kund. Annars läggs ordern utan den.
  const original = parsed.data.copyOf ? await getOrder(tenant, parsed.data.copyOf) : null;
  const copied = original && original.customer.id === customer.id ? original : null;
  try {
    const receipt = await placeOrder({
      tenant,
      customer,
      badges: parsed.data.badges,
      source: copied ? "repeat" : "reseller",
      repeatOf: copied?.id ?? null,
      note: copied ? `Beställd igen från ${copied.orderNo}, med ändringar` : "Lagd av återförsäljaren",
      demo: customer.demo,
      badgeShot: await normalizeBadgeShot(parsed.data.badgeShot),
      project: parsed.data.project || null,
      delivery: parsed.data.delivery,
    });
    // Nästa gång skyltarna ska "till oss" är adressen redan ifylld.
    if (parsed.data.delivery.to === "reseller") await saveResellerDeliveryAddress(tenant, parsed.data.delivery.address);
    return NextResponse.json(receipt, { status: 201 });
  } catch (error) {
    console.error("Återförsäljarens order kunde inte läggas", error);
    return NextResponse.json({ error: "Tillverkningen kunde inte ta emot ordern" }, { status: 502 });
  }
}
