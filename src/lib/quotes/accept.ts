import "server-only";
import { placeOrder } from "@/lib/orders/place-order";
import { claimForAcceptance, completeAcceptance, getQuote, releaseAcceptance } from "./repository";

export type AcceptResult = { ok: true; orderNo: string } | { ok: false; error: string };

/**
 * Godkänd offert blir en order med offertens priser. `byReseller` tillåter även
 * utkast (kunden har godkänt muntligt) och utgångna offerter.
 */
export async function acceptQuote(quoteNo: string, byReseller: boolean): Promise<AcceptResult> {
  const before = await getQuote(quoteNo);
  if (!before) return { ok: false, error: "Offerten finns inte" };
  const quote = await claimForAcceptance(quoteNo, byReseller);
  if (!quote) return { ok: false, error: "Offerten kan inte godkännas längre" };
  try {
    const placed = await placeOrder({
      customer: quote.customer,
      badges: quote.badges,
      pricing: quote.pricing,
      source: "quote",
      note: `Från offert ${quote.quoteNo}`,
      demo: quote.demo,
      badgeShot: quote.badgeShot,
    });
    await completeAcceptance(quote.id, placed.orderNumber, byReseller ? "Godkänd av återförsäljaren" : "Godkänd av kunden");
    return { ok: true, orderNo: placed.orderNumber };
  } catch (error) {
    await releaseAcceptance(quote.id, before.status);
    console.error(`Offert ${quoteNo} kunde inte bli order`, error);
    return { ok: false, error: "Ordern kunde inte läggas. Försök igen." };
  }
}
