import { z } from "zod";
import { lineUnitPrices, MATERIALS, priceOrder, VAT_RATE, type BadgeDocument, type MaterialId } from "@/engine";
import type { Pricing } from "@/lib/orders/pricing";

/**
 * Butikens priser mot riktpriset: ett generellt påslag (negativt = rabatt)
 * och egna procent per material. Mängdrabatten räknas först, påslaget sedan.
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
export function shopUnitPrices(badges: readonly BadgeDocument[], list: ShopPriceList | null | undefined): number[] {
  const units = lineUnitPrices(badges);
  if (!list) return units;
  return badges.map((badge, i) => Math.round((units[i] ?? 0) * (1 + percentFor(list, badge.materialId) / 100)));
}

export interface ShopPrice {
  unitSek: number;
  totalSek: number;
  totalInclVatSek: number;
  quantity: number;
  tierFactor: number;
}

/** Det kunden ser i butikens skyltmotor — samma tal som ordern sparas med. */
export function shopPrice(badges: readonly BadgeDocument[], list: ShopPriceList | null | undefined): ShopPrice {
  const base = priceOrder(badges);
  const units = shopUnitPrices(badges, list);
  const totalSek = badges.reduce((sum, badge, i) => sum + (units[i] ?? 0) * Math.max(1, Math.floor(badge.quantity)), 0);
  return {
    unitSek: base.quantity > 0 ? Math.round(totalSek / base.quantity) : 0,
    totalSek,
    totalInclVatSek: Math.round(totalSek * (1 + VAT_RATE)),
    quantity: base.quantity,
    tierFactor: base.tier.factor,
  };
}

/** Ordern från butiken får butikens priser som egna à-priser; listpris = ingen prissättning. */
export function shopOrderPricing(badges: readonly BadgeDocument[], list: ShopPriceList | null | undefined): Pricing | null {
  if (isListPrice(list)) return null;
  return { unitOverrides: shopUnitPrices(badges, list), discountPercent: 0, extras: [] };
}
