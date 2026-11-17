import { isOfferedDocument, type BadgeDocument, type PriceTable } from "@/engine";
import type { OrderPayment } from "@/lib/payments/model";
import { isOwner } from "@/lib/tenants/model";
import type { Delivery } from "./delivery";
import type { Pricing } from "./pricing";

export const ORDER_STATUSES = [
  "received",
  "proof-sent",
  "approved",
  "in-production",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  received: "Mottagen",
  "proof-sent": "Korrektur skickad",
  approved: "Godkänd",
  "in-production": "I produktion",
  shipped: "Skickad",
  delivered: "Levererad",
  cancelled: "Avbruten",
};

/** Stegen i tidslinjen. Korrekturen är valfri och hoppas över om den aldrig skickades. */
export const TIMELINE_STEPS: readonly OrderStatus[] = [
  "received",
  "proof-sent",
  "approved",
  "in-production",
  "shipped",
  "delivered",
];

/** Svaret när en order eller offert innehåller en skylt som inte säljs längre. */
export const NOT_OFFERED_ERROR =
  "Skylten finns inte längre i sortimentet. Öppna den i skyltmotorn och välj yta och form på nytt.";

/** Sant när alla skyltar går att beställa i dag. Servern litar inte på att klienten bara visar sortimentet. */
export function allOffered(badges: readonly BadgeDocument[]): boolean {
  return badges.every(isOfferedDocument);
}

export const ORDER_SOURCES = ["web", "reseller", "quote", "repeat", "staff", "template", "shop"] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const ORDER_SOURCE_LABEL: Record<OrderSource, string> = {
  web: "Webbshop",
  reseller: "Lagd av dig",
  quote: "Från offert",
  repeat: "Beställd igen",
  staff: "Ny personal",
  template: "Från mall",
  shop: "Från butik",
};

export interface Customer {
  id: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  orgNumber: string | null;
  address: string | null;
  /** Påhittad kund från demodatan. */
  demo: boolean;
}

export interface OrderEvent {
  status: OrderStatus;
  note: string | null;
  at: string;
}

export interface StoredOrder {
  id: string;
  orderNo: string;
  customer: Customer;
  status: OrderStatus;
  badges: BadgeDocument[];
  /** Återförsäljarens egna priser; `null` = listpris. */
  pricing: Pricing | null;
  /** Slutkundens prislista som gällde när ordern lades — listpris och minsta ordervärde räknas ur den. */
  priceList: PriceTable;
  /**
   * Återförsäljarens prislista från samma tillfälle, för inköp och marginal.
   * Finns bara när ordern lästs åt den inloggade återförsäljaren — aldrig på kundens sidor.
   */
  purchaseList?: PriceTable;
  /** Orderns frakt. Den är samma för kunden och återförsäljaren och räknas på det återförsäljaren betalar för varorna. */
  shippingSek: number;
  totalSek: number;
  totalInclVatSek: number;
  supplierOrderNo: string | null;
  partnerRequestNo: string | null;
  trackingUrl: string | null;
  source: OrderSource;
  repeatOfOrderNo: string | null;
  placedAt: string;
  events: OrderEvent[];
  /** Senast statusen stämdes av mot leverantören. */
  supplierSyncedAt: string | null;
  /** Det finns en stillbild av 3D-skylten (hämtas separat, den är tung). */
  hasBadgeShot: boolean;
  /** Demobutiken ordern lades i; `null` = vår egen sajt eller panelen. */
  shopSlug: string | null;
  /** Återförsäljarens namn på beställningen, t.ex. "Nya skyltar till receptionen". */
  project: string | null;
  /** Återförsäljaren ordern tillhör. */
  resellerId: string;
  /** Demoorder — skickas aldrig till tillverkningen, inte heller om den beställs igen. */
  demo: boolean;
  /** Vart skyltarna skickas. Saknas på ordrar från före leveransadressen; då går ordern inte att skicka till verkstaden. */
  delivery: Delivery | null;
  /** När ordern skickades till verkstaden; `null` medan den väntar. */
  supplierSentAt: string | null;
  /** Felet från senaste försöket att skicka ordern till verkstaden. */
  supplierError: string | null;
  /** Antal försök att skicka ordern till verkstaden. */
  supplierAttempts: number;
  /** Betalningen när ordern är betald med kort; `null` = ordern faktureras. */
  payment: OrderPayment | null;
  /** Expressfraktens pris när verkstaden har satt det; `null` = inte satt, eller ordern har ett annat fraktsätt. */
  expressShippingSek: number | null;
  /** Koden i den hemliga länken till kundens ordersida. */
  customerToken: string;
}

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

export function isOrderSource(value: string): value is OrderSource {
  return (ORDER_SOURCES as readonly string[]).includes(value);
}

export function badgeCount(order: Pick<StoredOrder, "badges">): number {
  return order.badges.reduce((sum, badge) => sum + badge.quantity, 0);
}

export function isOpen(order: Pick<StoredOrder, "status">): boolean {
  return order.status !== "delivered" && order.status !== "cancelled";
}

/** När varje steg nåddes — senaste händelsen per status vinner. */
export function stepTimes(events: readonly OrderEvent[]): Partial<Record<OrderStatus, string>> {
  const times: Partial<Record<OrderStatus, string>> = {};
  for (const event of events) times[event.status] = event.at;
  return times;
}

/**
 * Direktorder: lagd hos namnskylt.com utan återförsäljare, och inte redan
 * betald med kort. Den sköter Skylt & Gravyrteknik helt mot kunden: kunden är
 * beställaren och faktureras sitt eget pris (beslut av ägaren 2026-11-17). En
 * återförsäljares order faktureras alltid återförsäljaren. En order som kunden
 * har betalat med kort till namnskylt.com faktureras inte kunden en gång till.
 */
export function isDirectOrder(order: { resellerId: string; payment?: unknown }): boolean {
  return isOwner(order.resellerId) && !order.payment;
}
