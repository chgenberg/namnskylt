import "server-only";
import { NOT_OFFERED_ERROR, allOffered } from "@/lib/orders/model";
import { placeOrder } from "@/lib/orders/place-order";
import { claimForAcceptance, completeAcceptance, getQuote, quotePriceModel, releaseAcceptance } from "./repository";

export type AcceptResult = { ok: true; orderNo: string } | { ok: false; error: string };

/**
 * Godkänd offert blir en order med offertens priser. `byReseller` tillåter även
 * utkast (kunden har godkänt muntligt) och utgångna offerter.
 */
export async function acceptQuote(tenant: string, quoteNo: string, byReseller: boolean): Promise<AcceptResult> {
  const before = await getQuote(tenant, quoteNo);
  if (!before) return { ok: false, error: "Offerten finns inte" };
  // En äldre offert kan gälla ett material eller mått som inte säljs längre.
  if (!allOffered(before.badges)) return { ok: false, error: NOT_OFFERED_ERROR };
  const quote = await claimForAcceptance(tenant, quoteNo, byReseller);
  if (!quote) return { ok: false, error: "Offerten kan inte godkännas längre" };
  try {
    const placed = await placeOrder({
      customer: quote.customer,
      badges: quote.badges,
      pricing: quote.pricing,
      // Ordern får det pris kunden godkände, även om prismodellen ändrats sedan dess.
      priceModel: await quotePriceModel(quote.id),
      source: "quote",
      note: `Från offert ${quote.quoteNo}`,
      demo: quote.demo,
      badgeShot: quote.badgeShot,
      project: quote.project,
      tenant,
    });
    await completeAcceptance(quote.id, placed.orderNumber, byReseller ? "Godkänd av återförsäljaren" : "Godkänd av kunden");
    return { ok: true, orderNo: placed.orderNumber };
  } catch (error) {
    await releaseAcceptance(quote.id, before.status);
    console.error(`Offert ${quoteNo} kunde inte bli order`, error);
    return { ok: false, error: "Ordern kunde inte läggas. Försök igen." };
  }
}
