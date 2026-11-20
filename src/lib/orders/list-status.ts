import type { OrderStatus } from "./model";

/**
 * Orderns läge som det visas i panelens listor (besked via ägaren 2026-11-20: "räcker väl att ha
 * I produktion, lila som nu, och Skickad, grön, ta bort resten"). Listan skiljer bara på om
 * skyltarna är på väg att tillverkas eller har skickats. Stegen däremellan (mottagen, korrektur,
 * godkänd, levererad) står kvar på orderns egen sida, i tidslinjen.
 *
 * Två lägen är inga steg utan undantag, och har inget eget filter:
 * - `waiting`: ordern har inte gått till tillverkningen än, till exempel för att en uppgift
 *   saknas. Den får aldrig kallas "I produktion": då väntar säljaren på skyltar som ingen gör.
 * - `cancelled`: ordern är avbruten.
 */
export type OrderListStatus = "waiting" | "in-production" | "shipped" | "cancelled";

export const ORDER_LIST_STATUS_LABEL: Record<OrderListStatus, string> = {
  waiting: "Väntar",
  "in-production": "I produktion",
  shipped: "Skickad",
  cancelled: "Avbruten",
};

/** Det som står när muspekaren hålls över märket. */
export const ORDER_LIST_STATUS_HINT: Partial<Record<OrderListStatus, string>> = {
  waiting: "Ordern har inte gått till tillverkningen än. Öppna den för att se varför.",
};

export function orderListStatus(
  status: OrderStatus,
  /** En demoorder skickas aldrig till tillverkningen och visas som om den hade gjort det. */
  { demo, atWorkshop }: { demo: boolean; atWorkshop: boolean },
): OrderListStatus {
  if (status === "cancelled") return "cancelled";
  if (status === "shipped" || status === "delivered") return "shipped";
  // Tillverkningen kan ha börjat utan att ordern gick genom kopplingen, när statusen sattes för hand.
  if (status === "in-production" || demo || atWorkshop) return "in-production";
  return "waiting";
}

/** Listans två filter. Utan valt filter visas alla ordrar, också avbrutna. */
export const ORDER_LIST_FILTERS = ["in-production", "shipped"] as const;
export type OrderListFilter = (typeof ORDER_LIST_FILTERS)[number];

export function isOrderListFilter(value: string | undefined): value is OrderListFilter {
  return (ORDER_LIST_FILTERS as readonly string[]).includes(value ?? "");
}

/**
 * En order som väntar hör till "I produktion": filtret är det som inte har skickats än, och en
 * order som har fastnat ska inte försvinna ur det.
 */
export function inOrderListFilter(status: OrderListStatus, filter: OrderListFilter | null): boolean {
  if (filter === null) return true;
  return filter === "shipped" ? status === "shipped" : status === "in-production" || status === "waiting";
}
