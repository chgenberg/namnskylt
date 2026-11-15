import "server-only";
import type { Delivery, DeliveryAddress } from "@/lib/orders/delivery";
import { customerLabel } from "@/lib/notices/model";
import { notify } from "@/lib/notices/notify";
import { NOT_OFFERED_ERROR, allOffered } from "@/lib/orders/model";
import { placeOrder } from "@/lib/orders/place-order";
import type { StoredQuote } from "./model";
import {
  claimForAcceptance,
  completeAcceptance,
  declineQuote,
  getQuote,
  quotePriceModel,
  releaseAcceptance,
  saveAcceptedDelivery,
} from "./repository";

export type AcceptResult = { ok: true; orderNo: string } | { ok: false; error: string };

export const MISSING_DELIVERY_ERROR = "Fyll i leveransadressen innan offerten godkänns.";

/**
 * Vart den godkända offertens skyltar ska. Ska de till kunden gäller adressen
 * kunden nyss fyllt i, annars den som redan står på offerten. Ska de till
 * återförsäljaren gäller offertens adress, och kunden kan inte ändra den.
 */
export function acceptedDelivery(quote: Pick<StoredQuote, "delivery">, fromCustomer: DeliveryAddress | null): Delivery | null {
  const address = quote.delivery.to === "customer" ? (fromCustomer ?? quote.delivery.address) : quote.delivery.address;
  // Fraktsättet följer med från offerten till ordern.
  return address ? { to: quote.delivery.to, address, ...(quote.delivery.method && { method: quote.delivery.method }) } : null;
}

/**
 * Godkänd offert blir en order med offertens priser. `byReseller` tillåter även
 * utkast (kunden har godkänt muntligt) och utgångna offerter. `address` är
 * leveransadressen kunden fyllde i när den godkände.
 */
export async function acceptQuote(
  tenant: string,
  quoteNo: string,
  byReseller: boolean,
  address: DeliveryAddress | null = null,
): Promise<AcceptResult> {
  const before = await getQuote(tenant, quoteNo);
  if (!before) return { ok: false, error: "Offerten finns inte" };
  // En äldre offert kan gälla ett material eller mått som inte säljs längre.
  if (!allOffered(before.badges)) return { ok: false, error: NOT_OFFERED_ERROR };
  const delivery = acceptedDelivery(before, address);
  if (!delivery) return { ok: false, error: MISSING_DELIVERY_ERROR };
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
      delivery,
      tenant,
    });
    await saveAcceptedDelivery(quote.id, delivery);
    await completeAcceptance(quote.id, placed.orderNumber, byReseller ? "Godkänd av återförsäljaren" : "Godkänd av kunden");
    // Återförsäljaren får besked när kunden själv har godkänt, inte när den gjorde det åt kunden.
    if (!byReseller) {
      await notify({
        tenant,
        kind: "quote-accepted",
        who: customerLabel(quote.customer),
        quoteId: quote.id,
        orderNo: placed.orderNumber,
      });
    }
    return { ok: true, orderNo: placed.orderNumber };
  } catch (error) {
    await releaseAcceptance(quote.id, before.status);
    console.error(`Offert ${quoteNo} kunde inte bli order`, error);
    return { ok: false, error: "Ordern kunde inte läggas. Försök igen." };
  }
}

/** Kunden tackar nej via sin länk, och återförsäljaren får besked. `false` när offerten redan är besvarad. */
export async function declineByCustomer(
  quote: Pick<StoredQuote, "id" | "token" | "resellerId" | "customer">,
  reason: string | null,
): Promise<boolean> {
  const declined = await declineQuote(quote.token, reason);
  if (declined) {
    await notify({
      tenant: quote.resellerId,
      kind: "quote-declined",
      who: customerLabel(quote.customer),
      detail: reason,
      quoteId: quote.id,
    });
  }
  return declined;
}
