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
 * Delarna i offertens dokument som säljaren kan slå av och på med ikonraden bredvid offerten
 * (beslut av ägaren 2026-11-19). Alla visas om inget annat är valt.
 */
export const QUOTE_ELEMENTS = ["logo", "pictures", "angles", "promises", "accept", "vat", "terms", "seller"] as const;
export type QuoteElement = (typeof QUOTE_ELEMENTS)[number];

/** Längsta avslutande text på en offert. */
export const QUOTE_CLOSING_MAX = 1000;

/**
 * Hur offertens dokument ska se ut. Säljaren väljer det när offerten görs med knappen Offert i
 * skyltmotorn (beslut av ägaren 2026-11-19). Tomt = som förut, med allt synligt.
 *
 * - `logo`: säljarens logga överst. Utan den står säljarens namn där.
 * - `pictures`: bilderna av skyltarna. `angles`: de tre små bilderna ur andra vinklar.
 * - `promises`: raden med de tre löftena. `accept`: rutan om hur offerten godkänns.
 * - `vat`: raderna med moms och belopp inklusive moms.
 * - `terms`: villkoren i foten. `seller`: säljarens uppgifter i foten.
 */
export type QuoteOptions = Partial<Record<QuoteElement, boolean>> & {
  /** Avslutande text under summan. */
  closing?: string;
};

/** Offertens val som de lästes ur databasen eller ett anrop. Det som inte går att läsa räknas som inget val. */
export function parseQuoteOptions(value: unknown): QuoteOptions {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const options: QuoteOptions = {};
  for (const element of QUOTE_ELEMENTS) {
    const chosen = raw[element];
    if (typeof chosen === "boolean") options[element] = chosen;
  }
  if (typeof raw.closing === "string" && raw.closing.trim()) options.closing = raw.closing.trim().slice(0, QUOTE_CLOSING_MAX);
  return options;
}

/** Valen som de sparas: bara det som avviker från förvalet, så att en vanlig offert inte bär några val. */
export function storedQuoteOptions(options: QuoteOptions | null | undefined): QuoteOptions | null {
  const parsed = parseQuoteOptions(options);
  const kept: QuoteOptions = {};
  for (const element of QUOTE_ELEMENTS) if (parsed[element] === false) kept[element] = false;
  if (parsed.closing) kept.closing = parsed.closing;
  return Object.keys(kept).length > 0 ? kept : null;
}

/** Delen visas på offerten, om säljaren inte har valt bort den. */
export function showsElement(quote: { options?: QuoteOptions }, element: QuoteElement): boolean {
  return quote.options?.[element] !== false;
}

/** Säljarens logga visas på offerten, om säljaren inte har valt bort den. */
export function showsSellerLogo(quote: { options?: QuoteOptions }): boolean {
  return showsElement(quote, "logo");
}

/** Så många designer får bilder ur 3D-vyn på en offert. Fler visas som ritningar. */
export const QUOTE_SHOT_DESIGNS = 4;
/** Så många små bilder ur andra vinklar har varje design. */
export const QUOTE_SHOT_ANGLES = 3;

/** Bilderna av en design på offerten: en stor, och små ur andra vinklar. Data-URL:er ur 3D-vyn. */
export interface QuoteShot {
  main: string;
  angles: string[];
}

const SHOT_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;

/**
 * Offertens bilder som de lästes ur databasen: en plats per design, i den ordning designerna
 * står i offerten (`orderDesigns`). `null` där en design saknar bilder och ritas som ritning.
 */
export function parseQuoteShots(value: unknown): (QuoteShot | null)[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, QUOTE_SHOT_DESIGNS).map((entry) => {
    if (!entry || typeof entry !== "object") return null;
    const { main, angles } = entry as { main?: unknown; angles?: unknown };
    if (typeof main !== "string" || !SHOT_URL.test(main)) return null;
    const kept = Array.isArray(angles) ? angles.filter((angle): angle is string => typeof angle === "string" && SHOT_URL.test(angle)) : [];
    return { main, angles: kept.slice(0, QUOTE_SHOT_ANGLES) };
  });
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
  /** Bilderna ur 3D-vyn, en plats per design. Läses bara när en enskild offert hämtas. */
  shots?: (QuoteShot | null)[];
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
