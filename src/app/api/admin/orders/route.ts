import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_ORDER_BADGES, badgeDocumentSchema } from "@/engine";
import { deliveryPhoneIssue, deliverySchema } from "@/lib/orders/delivery";
import { customerPoSchema } from "@/lib/orders/customer-po";
import { NOT_OFFERED_ERROR, allOffered } from "@/lib/orders/model";
import { orderCustomerFields, resolveOrderCustomer } from "@/lib/orders/order-customer";
import { placeOrder } from "@/lib/orders/place-order";
import { badgeShotUploadSchema, normalizeBadgeShot } from "@/lib/images/badge-shot";
import { databaseConfigured, getOrder, saveResellerDeliveryAddress } from "@/lib/orders/repository";
import { currentTenant } from "@/lib/reseller-auth/session";

export const runtime = "nodejs";

const requestSchema = z.object({
  /** Kunden ordern gäller: en befintlig, eller en ny som fylls i i varukorgen. */
  ...orderCustomerFields,
  badges: z.array(badgeDocumentSchema).min(1).max(MAX_ORDER_BADGES),
  badgeShot: badgeShotUploadSchema,
  project: z.string().trim().max(120).optional(),
  /** Beställarens eget inköpsnummer, som ska stå på fakturan. */
  customerPo: customerPoSchema,
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
    // Adressens och kundens fel är skrivna för den som fyller i formuläret.
    const field = String(issue?.path[0]);
    return NextResponse.json({ error: issue && (field === "delivery" || field === "customer") ? issue.message : "Ogiltig order" }, { status: 400 });
  }
  if (!allOffered(parsed.data.badges)) return NextResponse.json({ error: NOT_OFFERED_ERROR }, { status: 400 });
  // En leverans som fraktas behöver mottagarens telefon. Formuläret kräver den; här gäller samma regel.
  const phoneIssue = deliveryPhoneIssue(parsed.data.delivery.address, parsed.data.delivery.method);
  if (phoneIssue) return NextResponse.json({ error: phoneIssue }, { status: 400 });

  const found = await resolveOrderCustomer(tenant, parsed.data);
  if (!found.ok) return NextResponse.json({ error: found.error }, { status: found.status });
  const { customer } = found;
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
      customerPo: parsed.data.customerPo ?? null,
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
