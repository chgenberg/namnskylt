import { ORDER_STATUS_LABEL, TIMELINE_STEPS, type OrderEvent, type OrderStatus } from "./model";

/** Rubriken och meningen kunden möts av på sin ordersida, per status. */
const HEAD: Record<OrderStatus, { title: string; text: string }> = {
  received: { title: "Vi har tagit emot din order", text: "Skyltarna går till tillverkningen. Du ser här när de skickas." },
  "proof-sent": { title: "Korrekturet väntar på dig", text: "Du har fått en egen länk till korrekturet. Tillverkningen börjar när du har godkänt det." },
  approved: { title: "Korrekturet är godkänt", text: "Skyltarna går till tillverkningen. Du ser här när de skickas." },
  "in-production": { title: "Dina skyltar tillverkas", text: "De skickas så snart de är klara." },
  shipped: { title: "Dina skyltar är skickade", text: "De är på väg till adressen nedan." },
  delivered: { title: "Dina skyltar är levererade", text: "Tack för din beställning." },
  cancelled: { title: "Ordern är avbruten", text: "Hör av dig om det inte stämmer." },
};

export function customerHead(status: OrderStatus): { title: string; text: string } {
  return HEAD[status];
}

export interface TimelineStep {
  status: OrderStatus;
  label: string;
  /** När steget nåddes; `null` för ett steg som passerats utan egen händelse eller inte nåtts än. */
  at: string | null;
  done: boolean;
  current: boolean;
}

/**
 * Orderns väg som kunden ser den. Korrekturen är valfri: stegen för den visas
 * bara när ett korrektur faktiskt skickades. En avbruten order har ingen
 * tidslinje.
 */
export function customerTimeline(status: OrderStatus, events: readonly OrderEvent[]): TimelineStep[] {
  if (status === "cancelled") return [];
  const reached = new Map<OrderStatus, string>();
  for (const event of events) if (!reached.has(event.status)) reached.set(event.status, event.at);
  const withProof = reached.has("proof-sent") || status === "proof-sent";
  const steps = TIMELINE_STEPS.filter((step) => withProof || (step !== "proof-sent" && step !== "approved"));
  const currentIndex = steps.indexOf(status);
  return steps.map((step, index) => ({
    status: step,
    label: ORDER_STATUS_LABEL[step],
    at: reached.get(step) ?? null,
    done: index <= currentIndex,
    current: index === currentIndex,
  }));
}
