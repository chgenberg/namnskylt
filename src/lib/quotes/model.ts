import type { BadgeDocument } from "@/engine";
import type { Customer } from "@/lib/orders/model";
import type { Pricing } from "@/lib/orders/pricing";

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined", "cancelled"] as const;
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

export interface QuoteEvent {
  status: QuoteStatus;
  note: string | null;
  at: string;
}

export interface StoredQuote {
  id: string;
  /** 3D-skylten som stillbild (WebP-data-URL). Läses bara när en enskild offert hämtas. */
  badgeShot: string | null;
  quoteNo: string;
  customer: Customer;
  status: QuoteStatus;
  badges: BadgeDocument[];
  pricing: Pricing | null;
  totalSek: number;
  totalInclVatSek: number;
  message: string | null;
  /** Sista giltiga dag, `YYYY-MM-DD` i svensk tid. */
  validUntil: string;
  token: string;
  orderNo: string | null;
  declineReason: string | null;
  demo: boolean;
  createdAt: string;
  sentAt: string | null;
  decidedAt: string | null;
  events: QuoteEvent[];
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
