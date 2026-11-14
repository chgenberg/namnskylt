import "server-only";
import { resellerOrder, toOre, type BadgeDocument } from "@/engine";
import { provisionSplit, resellerPriceTable, type PriceModel } from "@/engine/price-model";
import { toCsv } from "./csv";
import { ORDER_STATUS_LABEL, type OrderStatus } from "./model";

/**
 * Hur en återförsäljares order delas mellan parterna. Bara för admin:
 * provisionen får aldrig nå en återförsäljare eller en kund.
 */
export interface OrderShare {
  quantity: number;
  /** Varuvärdet återförsäljaren betalar, exkl. moms och frakt, med minsta ordervärde inräknat. Får ha ören. */
  resellerSek: number;
  /** Frakten återförsäljaren betalar. Den har ingen provision och går oavkortad till verkstaden. */
  shippingSek: number;
  /** Provisionen i snitt på ordern. Den räknas steg för steg och har decimaler när ordern går över flera trappsteg. */
  provisionPercent: number;
  /** Plattformens del av det återförsäljaren betalar. */
  provisionSek: number;
  /** Skylt & Gravyrtekniks del av varuvärdet. Frakten tillkommer. */
  supplierSek: number;
}

/** Fördelningen för en order, räknad med modellen som gällde när ordern lades. */
export function orderShare(badges: readonly BadgeDocument[], model: PriceModel): OrderShare {
  const purchase = resellerOrder(badges, resellerPriceTable(model));
  return {
    quantity: purchase.quantity,
    resellerSek: purchase.goodsSek,
    shippingSek: purchase.shippingSek,
    ...provisionSplit(model, purchase.goodsSek, purchase.quantity),
  };
}

export interface ShareTotals {
  orders: number;
  quantity: number;
  /** Det kunderna betalar återförsäljarna. */
  customerSek: number;
  resellerSek: number;
  /** Frakten på ordrarna, utöver varuvärdet. */
  shippingSek: number;
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
      resellerSek: toOre(total.resellerSek + row.share.resellerSek),
      shippingSek: total.shippingSek + row.share.shippingSek,
      provisionSek: toOre(total.provisionSek + row.share.provisionSek),
      supplierSek: toOre(total.supplierSek + row.share.supplierSek),
    }),
    { orders: 0, quantity: 0, customerSek: 0, resellerSek: 0, shippingSek: 0, provisionSek: 0, supplierSek: 0 },
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

/** Månaden en order lades, `2026-11`, i svensk tid. */
export function periodOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit" }).format(new Date(iso));
}

export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Månaden som text, `november 2026`. */
export function periodLabel(period: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${period}-15T12:00:00Z`));
}

/** Månaderna det finns ordrar i, nyast först. */
export function periodsOf(rows: readonly Pick<ResellerOrderRow, "placedAt">[]): string[] {
  return [...new Set(rows.map((row) => periodOf(row.placedAt)))].sort().reverse();
}

/** Ordrarna som lades en viss månad; alla när ingen månad är vald. */
export function inPeriod<T extends Pick<ResellerOrderRow, "placedAt">>(rows: readonly T[], period: string | null): T[] {
  return period ? rows.filter((row) => periodOf(row.placedAt) === period) : [...rows];
}

/**
 * Underlaget för en period som CSV: en rad per order med vad återförsäljaren
 * betalar, frakten, provisionen och verkstadens del. Skylt & Gravyrteknik
 * fakturerar återförsäljaren varor och frakt, och plattformen fakturerar
 * verkstaden provisionen. Bara för admin.
 */
export function provisionCsv(rows: readonly ResellerOrderRow[]): string {
  return toCsv(
    [
      "Order",
      "Datum",
      "Status",
      "Återförsäljare",
      "Kund",
      "Skyltar",
      "Varor exkl. moms",
      "Frakt exkl. moms",
      "Provision %",
      "Provision kr",
      "Till verkstaden, varor",
      "Till verkstaden, med frakt",
    ],
    rows.map((row) => [
      row.orderNo,
      new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date(row.placedAt)),
      ORDER_STATUS_LABEL[row.status],
      row.resellerName,
      row.customer,
      row.share.quantity,
      row.share.resellerSek,
      row.share.shippingSek,
      Math.round(row.share.provisionPercent * 100) / 100,
      row.share.provisionSek,
      row.share.supplierSek,
      toOre(row.share.supplierSek + row.share.shippingSek),
    ]),
  );
}
