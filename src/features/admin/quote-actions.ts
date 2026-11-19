"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { siteOrigin } from "@/lib/http/origin";
import { deliveryPhoneIssue, quoteDeliverySchema, type QuoteDelivery } from "@/lib/orders/delivery";
import { DIRECT_PRICING_ERROR, isLineInvoiceable, pricingSchema, type Pricing } from "@/lib/orders/pricing";
import { saveResellerDeliveryAddress } from "@/lib/orders/repository";
import { acceptQuote } from "@/lib/quotes/accept";
import { isOwner } from "@/lib/tenants/model";
import { cancelQuote, declineQuoteForCustomer, getQuote, updateQuote, updateQuoteDelivery } from "@/lib/quotes/repository";
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
});

export async function updateQuoteTermsAction(quoteNo: string, input: z.input<typeof termsSchema>): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    const { project, message, validUntil } = termsSchema.parse(input);
    const ok = await updateQuote(tenant, quoteNoSchema.parse(quoteNo), { project: project || null, message: message || null, validUntil });
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
    const sent = await sendQuote(tenant, quoteNoSchema.parse(quoteNo));
    if (!sent) return { ok: false, error: "Offerten kan inte skickas" };
    return done({ ok: true, url: `${await siteOrigin()}/offert/${sent.quote.token}`, emailed: sent.emailed, notice: sent.emailError });
  } catch (error) {
    return fail(error, "Offerten kunde inte skickas");
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
