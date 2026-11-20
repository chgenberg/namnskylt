"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { siteOrigin } from "@/lib/http/origin";
import { deliveryPhoneIssue, quoteDeliverySchema, type QuoteDelivery } from "@/lib/orders/delivery";
import { DIRECT_PRICING_ERROR, isLineInvoiceable, pricingSchema, type Pricing } from "@/lib/orders/pricing";
import { customerPoSchema } from "@/lib/orders/customer-po";
import { quoteCustomerFields, resolveOrderCustomer } from "@/lib/orders/order-customer";
import { saveResellerDeliveryAddress } from "@/lib/orders/repository";
import { acceptQuote } from "@/lib/quotes/accept";
import { isOwner } from "@/lib/tenants/model";
import { NO_CUSTOMER_ERROR } from "@/lib/quotes/model";
import { assignQuoteCustomer, cancelQuote, declineQuoteForCustomer, deleteQuote, getQuote, updateQuote, updateQuoteDelivery } from "@/lib/quotes/repository";
import { sendQuote } from "@/lib/quotes/send";
import { requireReseller } from "@/lib/reseller-auth/session";
import type { ActionResult } from "./actions";

const quoteNoSchema = z.string().regex(/^OF-\d{1,9}$/);

function fail(error: unknown, fallback: string): ActionResult {
  if (error instanceof z.ZodError) return { ok: false, error: "Ogiltiga uppgifter" };
  console.error(fallback, error);
  return { ok: false, error: fallback };
}

function done(result: Extract<ActionResult, { ok: true }> = { ok: true }): ActionResult {
  revalidatePath("/admin", "layout");
  return result;
}

export async function updateQuotePricingAction(quoteNo: string, pricing: Pricing): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    const parsed = pricingSchema.parse(pricing);
    // En offert hos namnskylt.com blir en direktorder, som verkstaden fakturerar kunden rad för rad.
    // En demooffert blir en demoorder, som aldrig går till verkstaden.
    if (isOwner(tenant) && !isLineInvoiceable(parsed)) {
      const quote = await getQuote(tenant, quoteNoSchema.parse(quoteNo));
      if (quote && !quote.demo) return { ok: false, error: DIRECT_PRICING_ERROR };
    }
    const ok = await updateQuote(tenant, quoteNoSchema.parse(quoteNo), { pricing: parsed });
    return ok ? done() : { ok: false, error: "Offerten går inte att ändra längre" };
  } catch (error) {
    return fail(error, "Priserna kunde inte sparas");
  }
}

const termsSchema = z.object({
  project: z.string().trim().max(120),
  message: z.string().trim().max(2000),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Kundens eget inköpsnummer. Utelämnat = det som står på offerten rörs inte. */
  customerPo: customerPoSchema,
});

export async function updateQuoteTermsAction(quoteNo: string, input: z.input<typeof termsSchema>): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    const { project, message, validUntil, customerPo } = termsSchema.parse(input);
    const ok = await updateQuote(tenant, quoteNoSchema.parse(quoteNo), {
      project: project || null,
      message: message || null,
      validUntil,
      ...(customerPo !== undefined && { customerPo: customerPo || null }),
    });
    return ok ? done() : { ok: false, error: "Offerten går inte att ändra längre" };
  } catch (error) {
    return fail(error, "Villkoren kunde inte sparas");
  }
}

/**
 * Vart offertens skyltar ska. Till kunden får adressen lämnas tom, då fyller
 * kunden i den när offerten godkänns. Till återförsäljaren krävs adressen.
 */
export async function updateQuoteDeliveryAction(quoteNo: string, delivery: QuoteDelivery): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    const parsed = quoteDeliverySchema.parse(delivery);
    if (parsed.to === "reseller" && !parsed.address) return { ok: false, error: "Fyll i adressen skyltarna ska skickas till" };
    // Till kunden fyller kunden i telefonen när offerten godkänns. Till återförsäljaren frågas ingen mer.
    const phoneIssue = parsed.to === "reseller" ? deliveryPhoneIssue(parsed.address, parsed.method) : null;
    if (phoneIssue) return { ok: false, error: phoneIssue };
    const ok = await updateQuoteDelivery(tenant, quoteNoSchema.parse(quoteNo), parsed);
    if (!ok) return { ok: false, error: "Offerten går inte att ändra längre" };
    if (parsed.to === "reseller" && parsed.address) await saveResellerDeliveryAddress(tenant, parsed.address);
    return done();
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Ogiltig adress" };
    return fail(error, "Leveransen kunde inte sparas");
  }
}

/**
 * Skickar offerten: kundens länk låses upp, och offerten mejlas till kunden
 * när offertmejlet är påslaget. Annars skickar säljaren länken själv.
 */
export async function sendQuoteAction(quoteNo: string): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    // Ett utkast utan kund har ingen att skickas till.
    if ((await getQuote(tenant, quoteNoSchema.parse(quoteNo)))?.noCustomer) return { ok: false, error: NO_CUSTOMER_ERROR };
    const sent = await sendQuote(tenant, quoteNoSchema.parse(quoteNo));
    if (!sent) return { ok: false, error: "Offerten kan inte skickas" };
    return done({ ok: true, url: `${await siteOrigin()}/offert/${sent.quote.token}`, emailed: sent.emailed, notice: sent.emailError });
  } catch (error) {
    return fail(error, "Offerten kunde inte skickas");
  }
}

const quoteCustomerSchema = z.strictObject(quoteCustomerFields);

/**
 * Väljer kund till ett utkast som sparades utan kund (besked via ägaren 2026-11-20): en av säljarens
 * kunder, eller en ny. Reglerna är dem som gäller när offerten sparas med kund i skyltmotorn: hos en
 * återförsäljare räcker ett företagsnamn, hos namnskylt.com krävs det verkstaden behöver för fakturan.
 */
export async function assignQuoteCustomerAction(quoteNo: string, input: z.input<typeof quoteCustomerSchema>): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    const parsed = quoteCustomerSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ogiltiga uppgifter" };
    const quote = await getQuote(tenant, quoteNoSchema.parse(quoteNo));
    if (!quote?.noCustomer) return { ok: false, error: "Offerten har redan en kund" };
    const found = await resolveOrderCustomer(tenant, parsed.data, { minimal: true });
    if (!found.ok) return { ok: false, error: found.error };
    // Hos namnskylt.com blir offerten en direktorder, som verkstaden fakturerar kunden rad för rad.
    if (isOwner(tenant) && !found.customer.demo && !isLineInvoiceable(quote.pricing)) return { ok: false, error: DIRECT_PRICING_ERROR };
    const ok = await assignQuoteCustomer(tenant, quote.quoteNo, found.customer);
    return ok ? done() : { ok: false, error: "Offerten går inte att ändra längre" };
  } catch (error) {
    return fail(error, "Kunden kunde inte sparas");
  }
}

/** Kunden har sagt ja på annat sätt (telefon, mejl) — återförsäljaren gör om offerten till order. */
export async function acceptQuoteForCustomerAction(quoteNo: string): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    const result = await acceptQuote(tenant, quoteNoSchema.parse(quoteNo), true);
    return result.ok ? done({ ok: true, orderNo: result.orderNo }) : { ok: false, error: result.error };
  } catch (error) {
    return fail(error, "Ordern kunde inte läggas");
  }
}

/** Kunden har sagt nej på annat sätt (telefon, mejl) — återförsäljaren nekar offerten åt kunden. */
export async function declineQuoteForCustomerAction(quoteNo: string): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    const ok = await declineQuoteForCustomer(tenant, quoteNoSchema.parse(quoteNo));
    return ok ? done() : { ok: false, error: "Offerten går inte att neka längre" };
  } catch (error) {
    return fail(error, "Offerten kunde inte nekas");
  }
}

export async function cancelQuoteAction(quoteNo: string): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    const ok = await cancelQuote(tenant, quoteNoSchema.parse(quoteNo));
    return ok ? done() : { ok: false, error: "Offerten kan inte makuleras" };
  } catch (error) {
    return fail(error, "Offerten kunde inte makuleras");
  }
}

/** Tar bort offerten för gott. En offert som har blivit en order går inte att ta bort. */
export async function deleteQuoteAction(quoteNo: string): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    const ok = await deleteQuote(tenant, quoteNoSchema.parse(quoteNo));
    return ok ? done() : { ok: false, error: "Offerten har blivit en order och kan inte tas bort." };
  } catch (error) {
    return fail(error, "Offerten kunde inte tas bort");
  }
}
