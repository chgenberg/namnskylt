import "server-only";
import type { ShippingMethod } from "@/engine";
import { deliveryPhoneIssue, shippingMethodOf, type Delivery, type DeliveryAddress } from "@/lib/orders/delivery";
import { isOwner } from "@/lib/tenants/model";
import { customerLabel } from "@/lib/notices/model";
import { notify } from "@/lib/notices/notify";
import { cleanCustomerPo } from "@/lib/orders/customer-po";
import { NOT_OFFERED_ERROR, allOffered } from "@/lib/orders/model";
import { placeOrder } from "@/lib/orders/place-order";
import { NO_CUSTOMER_ERROR, type StoredQuote } from "./model";
import { quoteShippingMethods } from "./shipping";
import {
  claimForAcceptance,
  completeAcceptance,
  declineQuote,
  getQuote,
  quotePriceModel,
  releaseAcceptance,
  reorderAccountId,
  saveAcceptedDelivery,
} from "./repository";

/** `orderPath` är kundens egen ordersida, när ordern har en. */
/** `customerNumber` är numret kunden ser: verkstadens när de har tagit emot en order de själva säljer, annars vårt. */
export type AcceptResult = { ok: true; orderNo: string; customerNumber: string; orderPath: string | null } | { ok: false; error: string };

export const MISSING_DELIVERY_ERROR = "Fyll i leveransadressen innan offerten godkänns.";
export const MISSING_PHONE_ERROR = "Fyll i telefon på leveransen innan offerten godkänns. Transportören aviserar på den.";

/**
 * Vart den godkända offertens skyltar ska. Ska de till kunden gäller adressen
 * kunden nyss fyllt i, annars den som redan står på offerten. Ska de till
 * återförsäljaren gäller offertens adress, och kunden kan inte ändra den.
 * `chosen` är leveranssättet kunden valde när den godkände; det gäller bara
 * när skyltarna ska till kunden. Annars följer offertens fraktsätt med.
 */
export function acceptedDelivery(
  quote: Pick<StoredQuote, "delivery">,
  fromCustomer: DeliveryAddress | null,
  chosen: ShippingMethod | null = null,
): Delivery | null {
  const toCustomer = quote.delivery.to === "customer";
  const address = toCustomer ? (fromCustomer ?? quote.delivery.address) : quote.delivery.address;
  const method = (toCustomer ? chosen : null) ?? shippingMethodOf(quote.delivery);
  return address ? { to: quote.delivery.to, address, ...(method !== "standard" && { method }) } : null;
}

/**
 * Det som stoppar ett godkännande på grund av leveransen, eller `null`. Utan
 * adress går offerten aldrig att godkänna. Godkänner återförsäljaren åt kunden
 * frågas ingen om telefonen, så numret ska då stå på offerten när skyltarna
 * fraktas. Kunden fyller i det själv i sitt formulär.
 */
export function acceptanceIssue(delivery: Delivery | null, byReseller: boolean): string | null {
  if (!delivery) return MISSING_DELIVERY_ERROR;
  return byReseller && deliveryPhoneIssue(delivery.address, delivery.method) ? MISSING_PHONE_ERROR : null;
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
  /** Leveranssättet kunden valde när den godkände. Utelämnat = det som står på offerten. */
  method: ShippingMethod | null = null,
  /** Inköpsnumret kunden skrev när den godkände. Utelämnat eller tomt = det som står på offerten. */
  customerPo: string | null = null,
): Promise<AcceptResult> {
  const before = await getQuote(tenant, quoteNo);
  if (!before) return { ok: false, error: "Offerten finns inte" };
  // Ett utkast utan kund kan inte bli en order: ordern ska höra till en kund.
  if (before.noCustomer) return { ok: false, error: NO_CUSTOMER_ERROR };
  // En äldre offert kan gälla ett material eller mått som inte säljs längre.
  if (!allOffered(before.badges)) return { ok: false, error: NOT_OFFERED_ERROR };
  if (method && !quoteShippingMethods(isOwner(tenant), shippingMethodOf(before.delivery)).includes(method)) {
    return { ok: false, error: "Leveranssättet går inte att välja för den här offerten." };
  }
  const delivery = acceptedDelivery(before, address, method);
  const issue = acceptanceIssue(delivery, byReseller);
  if (!delivery || issue) return { ok: false, error: issue ?? MISSING_DELIVERY_ERROR };
  const quote = await claimForAcceptance(tenant, quoteNo, byReseller);
  if (!quote) return { ok: false, error: "Offerten kan inte godkännas längre" };
  try {
    const placed = await placeOrder({
      customer: quote.customer,
      // Ordern hör till offertens kund, också när kunden saknar e-post.
      customerId: quote.customer.id,
      badges: quote.badges,
      pricing: quote.pricing,
      // Ordern får det pris kunden godkände, även om prismodellen ändrats sedan dess.
      priceModel: await quotePriceModel(quote.id),
      source: "quote",
      note: `Från offert ${quote.quoteNo}`,
      demo: quote.demo,
      badgeShot: quote.badgeShot,
      project: quote.project,
      // Kundens eget nummer vid godkännandet gäller före det säljaren skrev på offerten.
      customerPo: cleanCustomerPo(customerPo) ?? quote.customerPo ?? null,
      delivery,
      // Fler skyltar beställda från en order på ett kundkonto hamnar på samma konto.
      accountId: await reorderAccountId(quote.id),
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
    const theirs = isOwner(tenant) && !quote.demo && placed.status === "received" ? placed.supplierOrderNumber : undefined;
    return {
      ok: true,
      orderNo: placed.orderNumber,
      customerNumber: theirs || placed.orderNumber,
      orderPath: placed.customerToken ? `/order/${placed.customerToken}` : null,
    };
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
      // En offert som kunden laddade ner själv utan att skriva något om sig har inget namn att nämna.
      who: customerLabel(quote.customer) || "En besökare",
      detail: reason,
      quoteId: quote.id,
    });
  }
  return declined;
}
