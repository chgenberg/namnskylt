import { z } from "zod";
import { lineUnitPrices, MATERIALS, type BadgeDocument, type MaterialId } from "@/engine";

/**
 * Återförsäljarens inköpsvillkor hos tryckeriet, på samma sätt som deras
 * kundgrupper: en generell rabatt på listpriset och egna procent per material.
 * Mängdrabatten räknas först, rabatten sedan — samma ordning som hos dem.
 */
export interface PurchaseTerms {
  generalPercent: number;
  perMaterial: Partial<Record<MaterialId, number>>;
}

export const MAX_PURCHASE_DISCOUNT_PERCENT = 90;

const percentSchema = z.number().min(0).max(MAX_PURCHASE_DISCOUNT_PERCENT);
const MATERIAL_IDS = new Set<string>(MATERIALS.map((m) => m.id));

export const purchaseTermsSchema = z.object({
  generalPercent: percentSchema,
  perMaterial: z
    .record(z.string(), percentSchema)
    .refine((map) => Object.keys(map).every((id) => MATERIAL_IDS.has(id)), "Okänt material")
    .transform((map) => map as Partial<Record<MaterialId, number>>),
});

export function purchasePercentFor(terms: PurchaseTerms, materialId: MaterialId): number {
  return terms.perMaterial[materialId] ?? terms.generalPercent;
}

export interface PurchasePrice {
  /** Inköp per skylt, rad för rad. */
  unitSek: number[];
  totalSek: number;
}

export function purchasePrice(badges: readonly BadgeDocument[], terms: PurchaseTerms): PurchasePrice {
  const list = lineUnitPrices(badges);
  const unitSek = badges.map((badge, i) =>
    Math.round((list[i] ?? 0) * (1 - purchasePercentFor(terms, badge.materialId) / 100)),
  );
  const totalSek = badges.reduce((sum, badge, i) => sum + (unitSek[i] ?? 0) * Math.max(1, Math.floor(badge.quantity)), 0);
  return { unitSek, totalSek };
}

export interface Margin {
  sek: number;
  /** Andel av försäljningspriset; `null` när inget säljs. */
  percent: number | null;
}

export function marginOf(saleSek: number, purchaseSek: number): Margin {
  const sek = saleSek - purchaseSek;
  return { sek, percent: saleSek > 0 ? Math.round((sek / saleSek) * 100) : null };
}
