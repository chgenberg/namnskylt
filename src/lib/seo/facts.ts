import "server-only";
import { OFFERED_MATERIALS } from "@/engine";
import { endPriceTable, type PriceModel } from "@/engine/price-model";
import { extraDeliverySekOf, fromPriceSek, lastTierIndex, optionPriceSek, startShareSek, tierIndexFor, type PriceOptionId } from "@/engine/pricing";
import { priceModelOrDefault } from "@/lib/orders/repository";
import type { SiteFacts } from "./site-facts";

/**
 * Fakta om namnskylt.com för sökmotorer och AI-tjänster (2026-11-25), räknade ur prismodellen så att de
 * alltid stämmer: priset per skylt med det billigaste fästet och skyltens del av startkostnaden, för en
 * skylt och för 500, exkl. moms, och fraktens belopp. Samma regel som företagssidans pristabell.
 */
export async function siteFacts(): Promise<SiteFacts> {
  return factsFromModel(await priceModelOrDefault());
}

/** Samma fakta ur en given prismodell. Bara slutkundens prislista läses, aldrig inköp eller provision. */
export function factsFromModel(model: PriceModel): SiteFacts {
  const list = endPriceTable(model);
  const priceAt = (materialId: (typeof OFFERED_MATERIALS)[number]["id"], quantity: number) =>
    fromPriceSek(materialId, list, tierIndexFor(quantity, list)) + startShareSek(quantity, list);
  const materials = OFFERED_MATERIALS.map((material) => ({
    id: material.id,
    name: material.name,
    oneSek: priceAt(material.id, 1),
    manySek: priceAt(material.id, 500),
  }));
  const last = lastTierIndex(list);
  const option = (id: PriceOptionId) => optionPriceSek(id, list, last);
  return {
    materials,
    letterSek: model.shipping.letterSek,
    parcelSek: model.shipping.parcelSek,
    extras: {
      magnetSek: Math.max(0, option("magnet") - option("pin")),
      clipSek: Math.max(0, option("clip") - option("pin")),
      customShapeSek: option("customShape"),
      frameSek: option("frame"),
      logoSek: option("extraEngraving"),
    },
    extraDeliverySek: extraDeliverySekOf(model.shipping),
  };
}
