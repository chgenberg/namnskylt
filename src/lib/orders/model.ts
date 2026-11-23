import { isOfferedDocument, type BadgeDocument, type PriceTable } from "@/engine";
import type { OrderPayment } from "@/lib/payments/model";
import { isOwner } from "@/lib/tenants/model";
import type { Delivery } from "./delivery";
import type { Pricing } from "./pricing";
import type { SupplierDelivery } from "@/lib/supplier/types";

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
  /** Beställarens eget inköpsnummer, som ska stå på fakturan. `null` när inget angavs. */
  customerPo: string | null;
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
  /** Leveranserna när verkstaden har delat ordern på flera adresser; tom när allt går till en adress. */
  supplierDeliveries: SupplierDelivery[];
  /** Frakten för leveranserna utöver den första, hela kronor exkl. moms. */
  extraDeliverySek: number;
  /** Koden i den hemliga länken till kundens ordersida. */
  customerToken: string;
  /** Koden i följesedelns korta länk, som verkstaden öppnar från sitt orderpapper (`packing-slip.ts`). */
  packingCode: string;
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

/** En order kunden själv har lagt, i webbshoppen eller i en butik: ingen i panelen har gjort något. */
export function isPlacedByCustomer(source: OrderSource): boolean {
  return source === "web" || source === "shop";
}

/**
 * Om kunden får sajtens egna mejl om ordern: orderbekräftelsen och beskedet om att den är
 * skickad (beslut av ägaren 2026-11-21: de ska gå ut för butiksordrar). Det gäller en order som
 * kunden själv har lagt och som verkstaden inte sköter mot kunden, alltså i en återförsäljares
 * butik: där går verkstadens bekräftelse till återförsäljaren, och kunden fick förut inget mejl.
 *
 * En direktorder får aldrig mejl härifrån: Skylt & Gravyrtekniks system bekräftar och aviserar
 * den, och kunden skulle annars få två mejl om samma sak. En order som återförsäljaren har lagt
 * åt kunden, eller en godkänd offert, ger inte heller något: där har säljaren själv kontakten.
 */
export function customerGetsSiteMail(order: { resellerId: string; payment?: unknown; source: OrderSource; demo?: boolean }): boolean {
  return !order.demo && isPlacedByCustomer(order.source) && !isDirectOrder(order);
}

/** Ordernumret kunden ser, och vårt eget som referens när de skiljer sig. */
export interface CustomerOrderNumber {
  number: string;
  reference: string | null;
}

/**
 * Numret kunden ser på sin order (beslut av ägaren 2026-11-19: ordrarna ska följa Skylt &
 * Gravyrtekniks ordernummer). På en direktorder som verkstaden har tagit emot är det
 * verkstadens nummer, ur deras egen serie: samma nummer som står i deras orderbekräftelse
 * och på fakturan. Vårt eget nummer, NS-…, står då kvar som referens. Det är IO-numret hos dem.
 *
 * Innan verkstaden har tagit emot ordern är numret vårt eget, eftersom deras inte finns än.
 * En återförsäljares order visar alltid vårt nummer: återförsäljarens kund ska inte möta
 * verkstaden. En demoorder går aldrig dit och har inget nummer där.
 */
export function customerOrderNumber(order: {
  orderNo: string;
  resellerId: string;
  payment?: unknown;
  demo: boolean;
  supplierOrderNo: string | null;
  supplierSentAt: string | null;
}): CustomerOrderNumber {
  const theirs = isDirectOrder(order) && !order.demo && order.supplierSentAt ? order.supplierOrderNo?.trim() : null;
  return theirs ? { number: theirs, reference: order.orderNo } : { number: order.orderNo, reference: null };
}
