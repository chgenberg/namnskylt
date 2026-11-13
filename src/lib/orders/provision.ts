import "server-only";
import { resellerOrder, type BadgeDocument } from "@/engine";
import { provisionSplit, resellerPriceTable, type PriceModel } from "@/engine/price-model";
import type { OrderStatus } from "./model";

/**
 * Hur en återförsäljares order delas mellan parterna. Bara för admin:
 * provisionen får aldrig nå en återförsäljare eller en kund.
 */
export interface OrderShare {
  quantity: number;
  /** Det återförsäljaren betalar, exkl. moms, med minsta ordervärde inräknat. */
  resellerSek: number;
  provisionPercent: number;
  /** Plattformens del av det återförsäljaren betalar. */
  provisionSek: number;
  /** Skylt & Gravyrtekniks del. */
  supplierSek: number;
}

/** Fördelningen för en order, räknad med modellen som gällde när ordern lades. */
export function orderShare(badges: readonly BadgeDocument[], model: PriceModel): OrderShare {
  const purchase = resellerOrder(badges, resellerPriceTable(model));
  return {
    quantity: purchase.quantity,
    resellerSek: purchase.totalSek,
    ...provisionSplit(model, purchase.totalSek, purchase.quantity),
  };
}

export interface ShareTotals {
  orders: number;
  quantity: number;
  /** Det kunderna betalar återförsäljarna. */
  customerSek: number;
  resellerSek: number;
  provisionSek: number;
  supplierSek: number;
}

export interface ResellerOrderRow {
  orderNo: string;
  placedAt: string;
  status: OrderStatus;
  resellerId: string;
  resellerName: string;
  /** Kundens företag, eller namn när företag saknas. */
  customer: string;
  /** Det kunden betalar återförsäljaren, exkl. moms. */
  customerSek: number;
  share: OrderShare;
}

export function sumShares(rows: readonly Pick<ResellerOrderRow, "customerSek" | "share">[]): ShareTotals {
  return rows.reduce<ShareTotals>(
    (total, row) => ({
      orders: total.orders + 1,
      quantity: total.quantity + row.share.quantity,
      customerSek: total.customerSek + row.customerSek,
      resellerSek: total.resellerSek + row.share.resellerSek,
      provisionSek: total.provisionSek + row.share.provisionSek,
      supplierSek: total.supplierSek + row.share.supplierSek,
    }),
    { orders: 0, quantity: 0, customerSek: 0, resellerSek: 0, provisionSek: 0, supplierSek: 0 },
  );
}

export interface ResellerTotals extends ShareTotals {
  resellerId: string;
  resellerName: string;
}

/** Summan per återförsäljare, störst provision först. */
export function totalsByReseller(rows: readonly ResellerOrderRow[]): ResellerTotals[] {
  const groups = new Map<string, ResellerOrderRow[]>();
  for (const row of rows) {
    const group = groups.get(row.resellerId);
    if (group) group.push(row);
    else groups.set(row.resellerId, [row]);
  }
  return [...groups.values()]
    .map((group) => ({ resellerId: group[0]?.resellerId ?? "", resellerName: group[0]?.resellerName ?? "", ...sumShares(group) }))
    .sort((a, b) => b.provisionSek - a.provisionSek || a.resellerName.localeCompare(b.resellerName, "sv"));
}
