import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_ORDER_BADGES, badgeDocumentSchema } from "@/engine";
import { badgeShotUploadSchema, normalizeBadgeShot } from "@/lib/images/badge-shot";
import { customerPoSchema } from "@/lib/orders/customer-po";
import { defaultQuoteDelivery } from "@/lib/orders/delivery-options";
import { NOT_OFFERED_ERROR, allOffered } from "@/lib/orders/model";
import { quoteCustomerFields, resolveOrderCustomer } from "@/lib/orders/order-customer";
import { DIRECT_PRICING_ERROR, isLineInvoiceable, pricingSchema } from "@/lib/orders/pricing";
import { isOwner } from "@/lib/tenants/model";
import { databaseConfigured, unassignedCustomerId } from "@/lib/orders/repository";
import { isValidUntil, parseQuoteOptions, swedishDay } from "@/lib/quotes/model";
import { createQuote } from "@/lib/quotes/repository";
import { normalizeQuoteShots, quoteShotsUploadSchema } from "@/lib/quotes/shots";
import { quoteEmailOn, sendQuote } from "@/lib/quotes/send";
import { currentTenant } from "@/lib/reseller-auth/session";

export const runtime = "nodejs";

const requestSchema = z.object({
  /** Kunden offerten gäller: en befintlig, eller en ny. Vad en ny kund ska ha avgörs när kunden slås upp. */
  ...quoteCustomerFields,
  badges: z.array(badgeDocumentSchema).min(1).max(MAX_ORDER_BADGES),
  badgeShot: badgeShotUploadSchema,
  project: z.string().trim().max(120).optional(),
  /** Kundens eget inköpsnummer, när säljaren redan har det. */
  customerPo: customerPoSchema,
  /** Hälsningen överst på offerten. */
  message: z.string().trim().max(2000).optional(),
  /** Sista giltiga dag, `YYYY-MM-DD`. Utelämnad = 30 dagar. */
  validUntil: z.string().optional(),
  /** Hur dokumentet ska se ut: vilka delar som visas, och en avslutande text. Läses med `parseQuoteOptions`. */
  options: z.record(z.string(), z.unknown()).optional(),
  /** Bilderna ur 3D-vyn, en plats per design: en stor och små ur andra vinklar. `null` = designen ritas som ritning. */
  shots: quoteShotsUploadSchema,
  /** Säljarens egna à-priser, satta med marginalen i offertvyn. Utelämnad = listpris. */
  pricing: pricingSchema.optional(),
  /**
   * `true` = offerten sparas som utkast, utan kund (valet Utkast i offertvyn, besked via ägaren
   * 2026-11-20). Kunden väljs i panelen innan offerten skickas eller godkänns. Mejlas aldrig.
   */
  noCustomer: z.boolean().optional(),
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
 * Sedan samma dag är det den enda vägen sidorna använder: varukorgens knapp öppnar
 * offertvyn i stället för att mejla. Mejlet skickas från offertsidan i panelen.
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
  const unassigned = parsed.data.noCustomer === true;
  // Ett utkast utan kund har ingen att mejlas till: det räknas alltid som sparat av säljaren.
  const manual = parsed.data.send === false || unassigned;
  const pricing = parsed.data.pricing ?? null;
  if (pricing && pricing.unitOverrides.length > parsed.data.badges.length) return NextResponse.json({ error: "Ogiltig offert" }, { status: 400 });

  // En offert som säljaren skickar själv behöver ingen e-post till kunden: då räcker ett företagsnamn.
  // Ett utkast utan kund pekar på säljarens platshållare tills kunden har valts i panelen.
  const found = unassigned ? null : await resolveOrderCustomer(tenant, parsed.data, { minimal: manual });
  if (found && !found.ok) return NextResponse.json({ error: found.error }, { status: found.status });
  const customer = found?.ok ? found.customer : null;
  const demo = customer?.demo ?? false;
  // En offert hos namnskylt.com blir en direktorder, som verkstaden fakturerar kunden rad för rad.
  if (isOwner(tenant) && !demo && !isLineInvoiceable(pricing)) return NextResponse.json({ error: DIRECT_PRICING_ERROR }, { status: 400 });
  try {
    const { quoteNo, token } = await createQuote({
      tenant,
      customerId: customer?.id ?? (await unassignedCustomerId(tenant)),
      badges: parsed.data.badges,
      demo,
      badgeShot: await normalizeBadgeShot(parsed.data.badgeShot),
      project: parsed.data.project || null,
      customerPo: parsed.data.customerPo ?? null,
      // Utan kund finns ingen känd adress: leveransen fylls i när kunden är vald.
      delivery: customer ? await defaultQuoteDelivery(tenant, customer) : { to: "customer", address: null },
      message: parsed.data.message || null,
      validUntil: validUntil ?? null,
      pricing,
      options: parseQuoteOptions(parsed.data.options),
      shots: await normalizeQuoteShots(parsed.data.shots),
      manual,
      unassigned,
    });
    // Säljaren skickar PDF:en själv. Den hämtas med offertens kod, som säljaren ändå ser i panelen.
    if (manual) return NextResponse.json({ quoteNo, emailed: false, pdfPath: `/offert/${token}/pdf` }, { status: 201 });
    // Offerten går direkt till kunden när offertmejlet är på. En demooffert mejlas aldrig.
    // Offerten finns redan: går utskicket inte får säljaren mejla den från panelen, inte skapa en till.
    const sent =
      quoteEmailOn() && !demo
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
