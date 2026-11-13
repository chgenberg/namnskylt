import type { Wave } from "./model";

export const FUNNEL_STAGES = ["sent", "delivered", "landed", "demoOpened", "attributed", "firstOrder"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const FUNNEL_LABELS: Record<FunnelStage, string> = {
  sent: "Skickade",
  delivered: "Levererade",
  landed: "Landade",
  demoOpened: "Öppnade butiken",
  attributed: "Aktiverade",
  firstOrder: "Första order",
};

export interface FunnelInput {
  wave: Wave | null;
  sent: boolean;
  delivered: boolean;
  landed: boolean;
  demoOpened: boolean;
  attributed: boolean;
  orders: readonly { isDemo: boolean; source: string }[];
}

export type Funnel = Record<FunnelStage, number>;

/** Kundens egen order: demo och sådant återförsäljaren lagt in själv säger inget om kanalen. */
function isCustomerOrder(order: { isDemo: boolean; source: string }): boolean {
  return !order.isDemo && order.source !== "reseller";
}

/** Den interna vågen är våra egna adresser och hålls utanför. */
export function funnelFromRows(rows: readonly FunnelInput[]): Funnel {
  const funnel: Funnel = { sent: 0, delivered: 0, landed: 0, demoOpened: 0, attributed: 0, firstOrder: 0 };
  for (const row of rows) {
    if (row.wave === "internal") continue;
    if (row.sent) funnel.sent += 1;
    if (row.delivered) funnel.delivered += 1;
    if (row.landed) funnel.landed += 1;
    if (row.demoOpened) funnel.demoOpened += 1;
    if (row.attributed) funnel.attributed += 1;
    if (row.attributed && row.orders.some(isCustomerOrder)) funnel.firstOrder += 1;
  }
  return funnel;
}

/** Andel av föregående steg, avrundat till hela procent; `null` när steget före är tomt. */
export function stageRate(funnel: Funnel, stage: FunnelStage): number | null {
  const index = FUNNEL_STAGES.indexOf(stage);
  const previous = index > 0 ? FUNNEL_STAGES[index - 1] : undefined;
  if (!previous || funnel[previous] === 0) return null;
  return Math.round((funnel[stage] / funnel[previous]) * 100);
}
