import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_ORDER_BADGES, badgeDocumentSchema } from "@/engine";
import { badgeShotUploadSchema, normalizeBadgeShot } from "@/lib/images/badge-shot";
import { defaultQuoteDelivery } from "@/lib/orders/delivery-options";
import { NOT_OFFERED_ERROR, allOffered } from "@/lib/orders/model";
import { orderCustomerFields, resolveOrderCustomer } from "@/lib/orders/order-customer";
import { databaseConfigured } from "@/lib/orders/repository";
import { isValidUntil, swedishDay } from "@/lib/quotes/model";
import { createQuote } from "@/lib/quotes/repository";
import { quoteEmailOn, sendQuote } from "@/lib/quotes/send";
import { currentTenant } from "@/lib/reseller-auth/session";

export const runtime = "nodejs";

const requestSchema = z.object({
  /** Kunden offerten gäller: en befintlig, eller en ny som fylls i i varukorgen. */
  ...orderCustomerFields,
  badges: z.array(badgeDocumentSchema).min(1).max(MAX_ORDER_BADGES),
  badgeShot: badgeShotUploadSchema,
  project: z.string().trim().max(120).optional(),
  /** Hälsningen överst på offerten. */
  message: z.string().trim().max(2000).optional(),
  /** Sista giltiga dag, `YYYY-MM-DD`. Utelämnad = 30 dagar. */
  validUntil: z.string().optional(),
  /** Hur dokumentet ska se ut, till exempel utan säljarens logga. */
  options: z.object({ logo: z.boolean().optional() }).optional(),
  /**
   * `false` = offerten mejlas inte härifrån. Säljaren har sparat den med knappen Offert i skyltmotorn,
   * skickar PDF:en själv och svarar åt kunden i panelen.
   */
  send: z.boolean().optional(),
});

/**
 * Skyltmotorn i offertläge: samma skyltar som en order, men inget skickas till
 * tillverkningen förrän kunden har godkänt. Med offertmejlet påslaget skickas
 * offerten direkt till kunden (beslut av ägaren 2026-11-17). Annars sparas den
 * som utkast, och säljaren skickar länken själv från panelen.
 *
 * Med `send: false` mejlas ingenting (beslut av ägaren 2026-11-19, knappen Offert i
 * skyltmotorn): offerten sparas som väntande, säljaren laddar ner PDF:en, skickar den
 * själv och godkänner eller nekar åt kunden i panelen. Svaret bär då PDF:ens adress.
 */
export async function POST(request: Request) {
  const tenant = await currentTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  }
  if (!databaseConfigured()) return NextResponse.json({ error: "Databasen är inte kopplad" }, { status: 503 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // Kundens fel är skrivna för den som fyller i varukorgen.
    return NextResponse.json({ error: issue?.path[0] === "customer" ? issue.message : "Ogiltig offert" }, { status: 400 });
  }
  if (!allOffered(parsed.data.badges)) return NextResponse.json({ error: NOT_OFFERED_ERROR }, { status: 400 });

  const { validUntil } = parsed.data;
  if (validUntil !== undefined && !isValidUntil(validUntil, swedishDay(new Date()))) {
    return NextResponse.json({ error: "Välj en dag som offerten gäller till, från i dag och högst ett år fram." }, { status: 400 });
  }
  const manual = parsed.data.send === false;

  const found = await resolveOrderCustomer(tenant, parsed.data);
  if (!found.ok) return NextResponse.json({ error: found.error }, { status: found.status });
  const { customer } = found;
  try {
    const { quoteNo, token } = await createQuote({
      tenant,
      customerId: customer.id,
      badges: parsed.data.badges,
      demo: customer.demo,
      badgeShot: await normalizeBadgeShot(parsed.data.badgeShot),
      project: parsed.data.project || null,
      delivery: await defaultQuoteDelivery(tenant, customer),
      message: parsed.data.message || null,
      validUntil: validUntil ?? null,
      options: parsed.data.options ?? null,
      manual,
    });
    // Säljaren skickar PDF:en själv. Den hämtas med offertens kod, som säljaren ändå ser i panelen.
    if (manual) return NextResponse.json({ quoteNo, emailed: false, pdfPath: `/offert/${token}/pdf` }, { status: 201 });
    // Offerten går direkt till kunden när offertmejlet är på. En demooffert mejlas aldrig.
    // Offerten finns redan: går utskicket inte får säljaren mejla den från panelen, inte skapa en till.
    const sent =
      quoteEmailOn() && !customer.demo
        ? await sendQuote(tenant, quoteNo).catch((error: unknown) => {
            console.error("Offerten skapades men kunde inte skickas", error);
            return null;
          })
        : null;
    return NextResponse.json({ quoteNo, emailed: sent?.emailed ?? false }, { status: 201 });
  } catch (error) {
    console.error("Offerten kunde inte skapas", error);
    return NextResponse.json({ error: "Offerten kunde inte sparas" }, { status: 500 });
  }
}
