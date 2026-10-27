import type { BadgeDocument } from "@/engine";

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

export const ORDER_SOURCES = ["web", "repeat", "staff", "template"] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const ORDER_SOURCE_LABEL: Record<OrderSource, string> = {
  web: "Webbshop",
  repeat: "Beställd igen",
  staff: "Ny personal",
  template: "Från mall",
};

export interface Customer {
  id: string;
  name: string;
  company: string | null;
  email: string;
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
  totalSek: number;
  totalInclVatSek: number;
  supplierOrderNo: string | null;
  partnerRequestNo: string | null;
  trackingUrl: string | null;
  source: OrderSource;
  repeatOfOrderNo: string | null;
  placedAt: string;
  events: OrderEvent[];
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
