import type { BadgeDocument, PriceTable } from "@/engine";
import type { QuoteDelivery } from "@/lib/orders/delivery";
import type { Customer } from "@/lib/orders/model";
import type { Pricing } from "@/lib/orders/pricing";

const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined", "cancelled"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
/** `expired` lagras inte — en skickad offert vars sista dag passerat. */
export type QuoteDisplayStatus = QuoteStatus | "expired";

export const QUOTE_STATUS_LABEL: Record<QuoteDisplayStatus, string> = {
  draft: "Utkast",
  sent: "Skickad",
  accepted: "Godkänd",
  declined: "Nekad",
  cancelled: "Makulerad",
  expired: "Utgången",
};

export const QUOTE_VALID_DAYS = 30;
/** Så långt fram får en offert som längst gälla när säljaren själv väljer dagen. */
const QUOTE_VALID_MAX_DAYS = 365;

/**
 * Hur offertens dokument ska se ut. Säljaren väljer det när offerten görs med knappen Offert i
 * skyltmotorn (beslut av ägaren 2026-11-19). Tomt = som förut.
 */
export interface QuoteOptions {
  /** Säljarens logga står överst. `false` = bara säljarens namn. */
  logo?: boolean;
}

/** Offertens val som de lästes ur databasen eller ett anrop. Det som inte går att läsa räknas som inget val. */
export function parseQuoteOptions(value: unknown): QuoteOptions {
  if (!value || typeof value !== "object") return {};
  const { logo } = value as { logo?: unknown };
  return typeof logo === "boolean" ? { logo } : {};
}

/** Säljarens logga visas på offerten, om säljaren inte har valt bort den. */
export function showsSellerLogo(quote: { options?: QuoteOptions }): boolean {
  return quote.options?.logo !== false;
}

/** Dagen offerten gäller till är en riktig dag, inte passerad och inte orimligt långt fram. */
export function isValidUntil(day: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T12:00:00Z`))) return false;
  return day >= today && day <= addDays(today, QUOTE_VALID_MAX_DAYS);
}

export interface QuoteEvent {
  status: QuoteStatus;
  note: string | null;
  at: string;
}

export interface StoredQuote {
  id: string;
  /** 3D-skylten som stillbild (WebP-data-URL). Läses bara när en enskild offert hämtas. */
  badgeShot: string | null;
  /** Projektets namn — offertens rubrik. */
  project: string | null;
  /** Återförsäljaren offerten tillhör — dess logga och uppgifter står på offerten. */
  resellerId: string;
  quoteNo: string;
  customer: Customer;
  status: QuoteStatus;
  badges: BadgeDocument[];
  pricing: Pricing | null;
  /** Slutkundens prislista som gällde när offerten skapades — priset kunden fått ändras inte i efterhand. */
  priceList: PriceTable;
  /** Återförsäljarens prislista från samma tillfälle. Finns bara i panelen, aldrig på kundens offertsida. */
  purchaseList?: PriceTable;
  /** Offertens frakt. Den är samma för kunden och återförsäljaren och räknas på det återförsäljaren betalar för varorna. */
  shippingSek: number;
  totalSek: number;
  totalInclVatSek: number;
  message: string | null;
  /** Sista giltiga dag, `YYYY-MM-DD` i svensk tid. */
  validUntil: string;
  token: string;
  orderNo: string | null;
  declineReason: string | null;
  /** Vart skyltarna ska skickas. Adressen får saknas när de ska till kunden: då fyller kunden i den vid godkännandet. */
  delivery: QuoteDelivery;
  demo: boolean;
  createdAt: string;
  sentAt: string | null;
  /** När offerten senast mejlades till kunden. `null` när den aldrig har mejlats härifrån. */
  emailedAt: string | null;
  decidedAt: string | null;
  events: QuoteEvent[];
  /** Hur dokumentet ska se ut. Saknas på offerter som byggs utanför lagringen: då gäller förvalen. */
  options?: QuoteOptions;
}

export function isQuoteStatus(value: string): value is QuoteStatus {
  return (QUOTE_STATUSES as readonly string[]).includes(value);
}

export function swedishDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm" }).format(date);
}

export function displayStatus(quote: Pick<StoredQuote, "status" | "validUntil">, now: Date = new Date()): QuoteDisplayStatus {
  return quote.status === "sent" && quote.validUntil < swedishDay(now) ? "expired" : quote.status;
}

/** Kunden kan svara på en skickad offert som fortfarande gäller. */
export function canCustomerAnswer(quote: Pick<StoredQuote, "status" | "validUntil">, now: Date = new Date()): boolean {
  return displayStatus(quote, now) === "sent";
}

/** Priser och villkor går att ändra tills offerten är besvarad. */
export function canEditQuote(quote: Pick<StoredQuote, "status">): boolean {
  return quote.status === "draft" || quote.status === "sent" || quote.status === "declined";
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
