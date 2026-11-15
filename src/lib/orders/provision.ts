import "server-only";
import {
  createBadgeDocument,
  priceItemsOf,
  priceOrder,
  resellerOrder,
  toOre,
  withShippingMethod,
  type BadgeDocument,
  type ShippingMethod,
} from "@/engine";
import { endPriceTable, orderShippingSek, provisionSplit, resellerPriceTable, type PriceModel } from "@/engine/price-model";
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

/**
 * Fördelningen för en order, räknad med modellen som gällde när ordern lades.
 * Frakten följer orderns fraktsätt: upphämtning och express har ingen frakt på ordern.
 */
export function orderShare(
  badges: readonly BadgeDocument[],
  model: PriceModel,
  method: ShippingMethod = "standard",
  /** Expressfraktens pris när verkstaden har satt det. */
  expressSek: number | null = null,
): OrderShare {
  const purchase = resellerOrder(badges, withShippingMethod(resellerPriceTable(model), method));
  return {
    quantity: purchase.quantity,
    resellerSek: purchase.goodsSek,
    // Expressfrakten följer ingen regel: den är beloppet verkstaden satte, och 0 tills dess.
    shippingSek: method === "express" ? (expressSek ?? 0) : purchase.shippingSek,
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

const DAY_MS = 24 * 60 * 60 * 1000;
const EXAMPLE_LOGO = { d: "M0 0h1v1z", viewWidth: 1, viewHeight: 1, placement: "top" as const, heightMm: 10 };
const exampleMetal = (quantity: number, mounting: BadgeDocument["mounting"]): BadgeDocument => ({
  ...createBadgeDocument(["Anna Exempel"]),
  mounting,
  quantity,
});
const examplePlastic = (quantity: number, mounting: BadgeDocument["mounting"]): BadgeDocument => ({
  ...exampleMetal(quantity, mounting),
  materialId: "plastic",
  colorId: "white-black",
});

/**
 * Exempelordrarna. Antalen är valda så att varje regel syns: minsta ordervärde,
 * gränsen mellan varubrev och paket, prismodellens exempel på 25 skyltar och
 * ordrar som går över flera trappsteg.
 */
const EXAMPLE_ORDERS: readonly {
  resellerId: string;
  resellerName: string;
  customer: string;
  status: OrderStatus;
  daysAgo: number;
  badges: BadgeDocument[];
}[] = [
  { resellerId: "exempel-profil", resellerName: "Exempel Profil AB", customer: "Exempelkund Tandvård", status: "received", daysAgo: 1, badges: [exampleMetal(1, "pin")] },
  { resellerId: "exempel-profil", resellerName: "Exempel Profil AB", customer: "Exempelkund Café", status: "approved", daysAgo: 4, badges: [examplePlastic(4, "magnet")] },
  { resellerId: "exempel-reklam", resellerName: "Exempel Reklam AB", customer: "Exempelkund Hotell", status: "in-production", daysAgo: 8, badges: [exampleMetal(25, "pin")] },
  { resellerId: "exempel-reklam", resellerName: "Exempel Reklam AB", customer: "Exempelkund Bygghandel", status: "shipped", daysAgo: 16, badges: [{ ...examplePlastic(120, "clip"), logo: EXAMPLE_LOGO }] },
  { resellerId: "exempel-kontor", resellerName: "Exempel Kontor AB", customer: "Exempelkund Vårdbolag", status: "delivered", daysAgo: 33, badges: [exampleMetal(350, "pin")] },
  { resellerId: "exempel-kontor", resellerName: "Exempel Kontor AB", customer: "Exempelkund Butikskedja", status: "delivered", daysAgo: 40, badges: [exampleMetal(600, "magnet")] },
];

/**
 * Påhittade ordrar som visar hur fördelningen räknas med en prismodell. Sidan
 * Provision visar dem tills den första riktiga ordern finns. De ligger inte i
 * databasen och är aldrig med i underlaget (CSV). Bara för admin.
 */
export function exampleResellerOrders(model: PriceModel, now: Date): ResellerOrderRow[] {
  return EXAMPLE_ORDERS.map((example, index) => ({
    orderNo: `EX-${1001 + index}`,
    placedAt: new Date(now.getTime() - example.daysAgo * DAY_MS).toISOString(),
    status: example.status,
    resellerId: example.resellerId,
    resellerName: example.resellerName,
    customer: example.customer,
    // Det kunden betalar är listpriset med samma frakt som återförsäljaren betalar.
    customerSek: priceOrder(example.badges, endPriceTable(model), orderShippingSek(model, priceItemsOf(example.badges))).totalSek,
    share: orderShare(example.badges, model),
  }));
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
