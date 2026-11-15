import type { Delivery, DeliveryAddress } from "./delivery";

/**
 * Reglerna för radering, utan databas och utan Node-moduler, så att både
 * servern och dialogerna i panelen kan läsa dem.
 *
 * En kund tas bort på begäran (GDPR) eller för att städa bort testdata. Ordrar
 * som hör till bokföringen behålls, men utan personuppgifter: då står kundraden
 * kvar avidentifierad, eftersom ordern pekar på den.
 */

/** Namnet på en kund vars uppgifter är borttagna. */
export const ERASED_CUSTOMER_NAME = "Borttagen kund";
/** Texten som ersätter det som stod på en skylt eller i en adress. */
export const ERASED_TEXT = "Borttaget";

const ERASED_EMAIL = /^borttagen-[0-9a-f-]{36}@borttagen\.invalid$/;

/** Adressen en avidentifierad kund får. Den är unik per kund och går aldrig att mejla till. */
export function erasedCustomerEmail(customerId: string): string {
  return `borttagen-${customerId}@borttagen.invalid`;
}

/** Sant för en kund som är borttagen men står kvar för bokföringens skull. Den får inga nya ordrar eller offerter. */
export function isErasedCustomer(customer: { email: string }): boolean {
  return ERASED_EMAIL.test(customer.email);
}

export const ERASED_CUSTOMER_ERROR = "Kunden är borttagen";

export interface BookkeepingFacts {
  demo: boolean;
  status: string;
  /** Ordern har gått till verkstaden, som tillverkar och fakturerar. */
  sentToWorkshop: boolean;
  /** Ordern är betald med kort. */
  paid: boolean;
}

/** Statusar där skyltarna tillverkas eller redan är levererade. */
const PRODUCED: readonly string[] = ["in-production", "shipped", "delivered"];

/**
 * Sant när ordern hör till bokföringen och därför behålls vid en radering:
 * den har gått till verkstaden, är i produktion eller levererad, eller är
 * betald. Demoordrar och avbrutna ordrar hör aldrig dit.
 */
export function isBookkeepingOrder(order: BookkeepingFacts): boolean {
  if (order.demo || order.status === "cancelled") return false;
  return order.sentToWorkshop || order.paid || PRODUCED.includes(order.status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Skyltarna utan det som stod på dem. Namnen på skyltarna är personuppgifter;
 * material, form, fäste, logga och antal står kvar, så priset är detsamma.
 * Första raden med text får en platshållare, eftersom en skylt utan text inte
 * är ett giltigt dokument. Läser sparad JSON som den är, även äldre dokument.
 */
export function erasedBadges(badges: unknown): unknown {
  if (!Array.isArray(badges)) return badges;
  return badges.map((badge: unknown) => {
    if (!isRecord(badge) || !Array.isArray(badge.rows)) return badge;
    let placed = false;
    const rows = badge.rows.map((row: unknown) => {
      if (!isRecord(row) || typeof row.text !== "string") return row;
      if (placed || row.text.trim().length === 0) return { ...row, text: "" };
      placed = true;
      return { ...row, text: ERASED_TEXT };
    });
    return { ...badge, rows };
  });
}

/**
 * Leveransen utan personuppgifter. Kontaktpersonen och telefonnumret tas
 * alltid bort. Gick skyltarna till en kund utan företag är hela adressen en
 * privatpersons och ersätts; fraktsättet står kvar, så att frakten räknas lika.
 */
export function erasedDelivery(delivery: Delivery | null, hasCompany: boolean): Delivery | null {
  if (!delivery) return null;
  const address: DeliveryAddress =
    delivery.to === "customer" && !hasCompany
      ? { name: ERASED_CUSTOMER_NAME, contactName: null, line1: ERASED_TEXT, line2: null, zip: "000 00", city: ERASED_TEXT, country: "SE", phone: null }
      : { ...delivery.address, contactName: null, phone: null };
  return { ...delivery, address };
}

/** Vad en radering av en kund tar bort och behåller. */
export interface CustomerErasure {
  quotes: number;
  /** Sparade mallar i kundens designbibliotek. */
  designs: number;
  ordersRemoved: number;
  /** Ordrar som hör till bokföringen och står kvar utan personuppgifter. */
  ordersKept: number;
}

/** Vad en radering av ett återförsäljarkonto tar bort och behåller. */
export interface AccountErasure extends CustomerErasure {
  customers: number;
  shops: number;
}

const counted = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "a", "a och b", "a, b och c". */
function listed(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} och ${parts[parts.length - 1]}`;
}

function removedParts(plan: CustomerErasure): string[] {
  return [
    plan.quotes > 0 ? counted(plan.quotes, "offert", "offerter") : null,
    plan.designs > 0 ? counted(plan.designs, "mall", "mallar") : null,
    plan.ordersRemoved > 0 ? counted(plan.ordersRemoved, "order", "ordrar") : null,
  ].filter((part): part is string => part !== null);
}

function keptSentence(ordersKept: number): string | null {
  if (ordersKept === 0) return null;
  return `${counted(ordersKept, "order", "ordrar")} behålls utan personuppgifter, eftersom ${ordersKept === 1 ? "den" : "de"} hör till bokföringen.`;
}

/** Meningen i bekräftelsen innan en kund tas bort, och i svaret efteråt. */
export function customerErasureSummary(plan: CustomerErasure): string {
  const removed = `${listed(["Kunden", ...removedParts(plan)])} tas bort.`;
  return [removed, keptSentence(plan.ordersKept)].filter(Boolean).join(" ");
}

/** Meningen i bekräftelsen innan ett återförsäljarkonto tas bort. */
export function accountErasureSummary(plan: AccountErasure): string {
  const parts = [
    "Kontot med inloggning och företagsuppgifter",
    plan.customers > 0 ? counted(plan.customers, "kund", "kunder") : null,
    ...removedParts(plan),
    plan.shops > 0 ? counted(plan.shops, "butik", "butiker") : null,
  ].filter((part): part is string => part !== null);
  return [`${listed(parts)} tas bort.`, keptSentence(plan.ordersKept)].filter(Boolean).join(" ");
}
