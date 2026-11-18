import "server-only";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { companyFooter } from "@/lib/company/profile";
import { isRealEmailSend } from "@/lib/email";
import { ResendEmailSender, type FetchLike } from "@/lib/email/resend-sender";
import { sellerBrand } from "@/lib/email/seller-brand";
import { publicOrigin } from "@/lib/http/public-url";
import { shippingMethodOf } from "@/lib/orders/delivery";
import { isErasedCustomer } from "@/lib/orders/erase-model";
import { getSellerProfile } from "@/lib/orders/repository";
import { accountEmail } from "@/lib/reseller-auth/accounts";
import { displayStatus, type StoredQuote } from "./model";
import { composeQuoteEmail, quoteEmailSettings, quotePictureCaption, type QuoteEmailSettings } from "./quote-email";
import { markEmailed, markSent } from "./repository";

const HOUR_MS = 60 * 60 * 1000;
/** Så många offertmejl får en säljare skicka per timme. Skyddar mot att kontot används för utskick. */
const perSeller = createRateLimiter({ limit: 60, windowMs: HOUR_MS });
/** Samma mottagare får högst så här många offertmejl per timme, hur många offerter det än gäller. */
const perRecipient = createRateLimiter({ limit: 10, windowMs: HOUR_MS });
/** Taket för hela sajten per dygn. Offertmejl är ett mejl i taget, aldrig ett utskick. */
const perDay = createRateLimiter({ limit: 500, windowMs: 24 * HOUR_MS });

export interface QuoteSendResult {
  quote: StoredQuote;
  /** Offertmejlet är påslaget i driften. */
  emailOn: boolean;
  /** Resend har tagit emot mejlet. */
  emailed: boolean;
  /** Varför mejlet inte gick iväg, skrivet för säljaren. `null` när det gick eller när mejlet är avstängt. */
  emailError: string | null;
}

/** Sant när offertmejlet är påslaget (`quoteEmailSettings`). */
export function quoteEmailOn(): boolean {
  return quoteEmailSettings() !== null;
}

function senderFor(settings: QuoteEmailSettings, fetchImpl?: FetchLike): ResendEmailSender {
  // På datorn kan en låtsasmottagare stå i stället för Resend, så att flödet går att prova utan att mejla någon.
  const target: FetchLike | undefined = settings.apiUrl ? (_url, init) => fetch(settings.apiUrl as string, init) : fetchImpl;
  return new ResendEmailSender(settings.apiKey, target);
}

/**
 * Skickar offerten: kundens länk låses upp, och offerten mejlas till kunden
 * när offertmejlet är påslaget. Mejlet får aldrig stoppa utskicket: går det
 * inte iväg är offerten ändå skickad, och säljaren får veta att länken ska
 * skickas för hand. `null` när offerten inte finns eller redan är besvarad.
 */
export async function sendQuote(tenant: string, quoteNo: string, fetchImpl?: FetchLike): Promise<QuoteSendResult | null> {
  const quote = await markSent(tenant, quoteNo);
  if (!quote) return null;
  const settings = quoteEmailSettings();
  const off = (emailError: string | null = null): QuoteSendResult => ({ quote, emailOn: settings !== null, emailed: false, emailError });
  // En demooffert går aldrig till en riktig brevlåda.
  if (!settings || quote.demo || isErasedCustomer(quote.customer)) return off();
  // Knapparna i mejlet skulle leda till en offert som inte går att svara på.
  if (displayStatus(quote) === "expired") return off("Offerten har gått ut. Förläng giltigheten och mejla den sedan igen.");
  const allowed = perSeller.take(tenant) && perRecipient.take(quote.customer.email) && perDay.take("alla");
  if (!allowed) return off("För många offertmejl den senaste timmen. Skicka länken själv, eller vänta en stund.");
  try {
    // Säljaren som kunden möter: hos namnskylt.com är det Skylt & Gravyrteknik, dit också svaren går.
    const company = await getSellerProfile(tenant);
    const replyTo = company.email.trim() || (await accountEmail(tenant)) || settings.fromAddress;
    // Länkarna och bilderna byggs på sajtens publika adress, aldrig på förfrågans värdnamn.
    const origin = publicOrigin();
    const url = `${origin}/offert/${quote.token}`;
    const message = composeQuoteEmail(
      {
        quoteNo: quote.quoteNo,
        project: quote.project,
        customerName: quote.customer.name,
        customerEmail: quote.customer.email,
        quantity: quote.badges.reduce((sum, badge) => sum + badge.quantity, 0),
        totalSek: quote.totalSek,
        totalInclVatSek: quote.totalInclVatSek,
        shippingPending: shippingMethodOf(quote.delivery) === "express",
        validUntil: quote.validUntil,
        message: quote.message,
        url,
        sentAt: quote.sentAt ?? new Date().toISOString(),
        // Bilden av skylten och säljarens logga hämtas från offertens egen adress, som är öppen för den som har länken.
        picture: quote.badges.length > 0 ? { url: `${url}/skylt.png`, caption: quotePictureCaption(quote.badges) } : null,
      },
      {
        sellerName: company.name,
        replyTo,
        fromAddress: settings.fromAddress,
        footer: companyFooter(company),
        brand: await sellerBrand(company, origin, `${url}/logga.png`),
      },
    );
    const result = await senderFor(settings, fetchImpl).send(message);
    if (!isRealEmailSend(result)) {
      console.error("Offertmejlet kunde inte skickas", result.status, result.error);
      return off("Mejlet gick inte iväg. Skicka länken själv, eller försök igen.");
    }
    // Mejlet är skickat. Går det inte att spara det får säljaren ändå veta att mejlet gick: annars
    // skickades samma offert en gång till.
    await markEmailed(quote.id).catch((error: unknown) => console.error("Offertmejlet är skickat men kunde inte sparas", error));
    return { quote: { ...quote, emailedAt: new Date().toISOString() }, emailOn: true, emailed: true, emailError: null };
  } catch (error) {
    console.error("Offertmejlet kunde inte skickas", error);
    return off("Mejlet gick inte iväg. Skicka länken själv, eller försök igen.");
  }
}
