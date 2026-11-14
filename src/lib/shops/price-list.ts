import { z } from "zod";
import {
  badgePriceParts,
  lineUnitPrices,
  MATERIALS,
  priceOrder,
  shippingSek,
  VAT_RATE,
  type BadgeDocument,
  type MaterialId,
  type PriceTable,
  type UnitPricePart,
} from "@/engine";
import type { Pricing } from "@/lib/orders/pricing";

/**
 * Butikens priser mot riktpriset (slutkundens prislista): ett
 * generellt påslag (negativt = rabatt) och egna procent per material.
 * Trappsteget räknas först, påslaget sedan.
 */
export interface ShopPriceList {
  percent: number;
  perMaterial: Partial<Record<MaterialId, number>>;
}

export const MIN_PRICE_PERCENT = -50;
export const MAX_PRICE_PERCENT = 300;

const percentSchema = z.number().int().min(MIN_PRICE_PERCENT).max(MAX_PRICE_PERCENT);
const MATERIAL_IDS = new Set<string>(MATERIALS.map((m) => m.id));

export const shopPriceListSchema = z.object({
  percent: percentSchema,
  perMaterial: z
    .record(z.string(), percentSchema)
    .refine((map) => Object.keys(map).every((id) => MATERIAL_IDS.has(id)), "Okänt material")
    .transform((map) => map as Partial<Record<MaterialId, number>>),
});

export function percentFor(list: ShopPriceList, materialId: MaterialId): number {
  return list.perMaterial[materialId] ?? list.percent;
}

export function isListPrice(list: ShopPriceList | null | undefined): boolean {
  return !list || (list.percent === 0 && Object.values(list.perMaterial).every((p) => p === 0));
}

/** À-pris per skylt i butiken. */
export function shopUnitPrices(
  badges: readonly BadgeDocument[],
  list: ShopPriceList | null | undefined,
  priceList: PriceTable,
): number[] {
  const units = lineUnitPrices(badges, priceList);
  if (!list) return units;
  return badges.map((badge, i) => Math.round((units[i] ?? 0) * (1 + percentFor(list, badge.materialId) / 100)));
}

/**
 * Vad som ingår i skyltens à-pris i butiken, i en order med `orderQuantity`
 * skyltar. Varje del får butikens påslag. Avrundningen läggs på själva skylten,
 * så att delarna summerar till exakt à-priset i `shopUnitPrices`.
 */
export function shopPriceParts(
  badge: BadgeDocument,
  orderQuantity: number,
  list: ShopPriceList | null | undefined,
  priceList: PriceTable,
): UnitPricePart[] {
  const parts = badgePriceParts(badge, orderQuantity, priceList);
  if (!list) return parts;
  const factor = 1 + percentFor(list, badge.materialId) / 100;
  const sum = (items: readonly UnitPricePart[]) => items.reduce((total, item) => total + item.sek, 0);
  const scaled = parts.map((item) => ({ ...item, sek: Math.round(item.sek * factor) }));
  const rest = Math.round(sum(parts) * factor) - sum(scaled);
  return scaled.map((item) => (item.part === "sign" ? { ...item, sek: item.sek + rest } : item));
}

export interface ShopPrice {
  unitSek: number;
  badgesSek: number;
  /** Påslaget upp till slutkundens minsta ordervärde. */
  minimumTopUpSek: number;
  /** Frakten, räknad på butikens varuvärde. Butikens påslag gäller inte frakten. */
  shippingSek: number;
  totalSek: number;
  totalInclVatSek: number;
  quantity: number;
  tierIndex: number;
}

/** Det kunden ser i butikens skyltmotor — samma tal som ordern sparas med. */
export function shopPrice(
  badges: readonly BadgeDocument[],
  list: ShopPriceList | null | undefined,
  priceList: PriceTable,
): ShopPrice {
  const base = priceOrder(badges, priceList);
  const units = shopUnitPrices(badges, list, priceList);
  const badgesSek = badges.reduce((sum, badge, i) => sum + (units[i] ?? 0) * Math.max(1, Math.floor(badge.quantity)), 0);
  const minimumTopUpSek = base.quantity > 0 ? Math.max(0, priceList.minOrderSek - badgesSek) : 0;
  const shipping = shippingSek(badgesSek + minimumTopUpSek, priceList);
  const totalSek = badgesSek + minimumTopUpSek + shipping;
  return {
    unitSek: base.quantity > 0 ? Math.round(badgesSek / base.quantity) : 0,
    badgesSek,
    minimumTopUpSek,
    shippingSek: shipping,
    totalSek,
    totalInclVatSek: Math.round(totalSek * (1 + VAT_RATE)),
    quantity: base.quantity,
    tierIndex: base.tierIndex,
  };
}

/** Ordern från butiken får butikens priser som egna à-priser; listpris = ingen prissättning. */
export function shopOrderPricing(
  badges: readonly BadgeDocument[],
  list: ShopPriceList | null | undefined,
  priceList: PriceTable,
): Pricing | null {
  if (isListPrice(list)) return null;
  return { unitOverrides: shopUnitPrices(badges, list, priceList), discountPercent: 0, extras: [] };
}
