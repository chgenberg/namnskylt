import type { BadgeDocument, PriceTable } from "@/engine";
import { priceWithPricing, type Pricing } from "@/lib/orders/pricing";
import type { QuoteOptions, QuoteShot, StoredQuote } from "./model";

/** Kunden som den står på en offert som inte är sparad än. */
export interface DraftCustomer {
  company: string;
  name: string;
  email: string;
  phone: string;
  orgNumber: string;
}

export interface QuoteDraftInput {
  badges: readonly BadgeDocument[];
  /** Slutkundens prislista: offerten görs till listpris. */
  priceList: PriceTable;
  /** Frakten, när den är känd. */
  shippingSek: number | null;
  customer: DraftCustomer | null;
  /** Kundens eget inköpsnummer, när säljaren har fyllt i det. */
  customerPo?: string;
  /** Offerten sparas som utkast, utan kund: dokumentet ritas då utan kundens rader. */
  noCustomer?: boolean;
  project: string;
  message: string;
  /** Sista giltiga dag, `YYYY-MM-DD`. */
  validUntil: string;
  options: QuoteOptions;
  /** Stillbilden av skylten, när offerten har en enda design. */
  badgeShot: string | null;
  /** Bilderna ur 3D-vyn, en plats per design. `null` där bilderna inte är tagna än. */
  shots?: (QuoteShot | null)[];
  /** Säljarens egna à-priser, satta med marginalen, eller butikens priser. Utelämnad = listpris. */
  pricing?: Pricing | null;
  /** Kunden gör offerten själv: dokumentet säger att den godkänns via länken i PDF:en. */
  byCustomer?: boolean;
  /** Dagen offerten görs. */
  now: Date;
}

/** Numret som står på dokumentet tills offerten har sparats och fått sitt eget. */
export const DRAFT_QUOTE_NO = "Utkast";

const text = (value: string): string | null => value.trim() || null;

/**
 * Offerten som den kommer att se ut, innan den finns i databasen: underlaget till
 * förhandsvisningen i skyltmotorn (knappen Offert, beslut av ägaren 2026-11-19).
 * `quoteHtml` ritar samma dokument ur den här som PDF:en sedan ritas ur den sparade
 * offerten, så att säljaren ser det kunden får. Priset är listpris, som när offerten
 * sparas, om säljaren inte har ändrat sin marginal, och leveransen går till kunden, som fyller i
 * adressen senare.
 */
export function draftQuote(input: QuoteDraftInput): StoredQuote {
  const badges = [...input.badges];
  const shippingSek = input.shippingSek ?? 0;
  const pricing = input.pricing ?? null;
  const priced = priceWithPricing(badges, pricing, input.priceList, shippingSek);
  const customer = input.customer;
  return {
    id: "draft",
    badgeShot: input.badgeShot,
    project: text(input.project),
    customerPo: text(input.customerPo ?? ""),
    resellerId: "",
    quoteNo: DRAFT_QUOTE_NO,
    customer: {
      id: "draft",
      // Utan vald kund står en platshållare där kundens namn kommer.
      name: text(customer?.name ?? "") ?? ((customer && text(customer.company)) || input.noCustomer ? "" : "Kunden"),
      company: text(customer?.company ?? ""),
      email: customer?.email.trim() ?? "",
      phone: text(customer?.phone ?? ""),
      orgNumber: text(customer?.orgNumber ?? ""),
      address: null,
      demo: false,
    },
    ...(input.noCustomer && { noCustomer: true }),
    ...(input.byCustomer && { byCustomer: true }),
    status: "draft",
    badges,
    pricing,
    priceList: input.priceList,
    shippingSek,
    totalSek: priced.totalSek,
    totalInclVatSek: priced.totalInclVatSek,
    message: text(input.message),
    validUntil: input.validUntil,
    token: "",
    orderNo: null,
    declineReason: null,
    delivery: { to: "customer", address: null },
    demo: false,
    createdAt: input.now.toISOString(),
    sentAt: null,
    // Offerten mejlas inte härifrån: säljaren skickar PDF:en själv, och dokumentet säger det.
    emailedAt: null,
    decidedAt: null,
    events: [],
    options: input.options,
    shots: input.shots ?? [],
  };
}
