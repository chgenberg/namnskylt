import "server-only";
import type { PriceTable } from "@/engine";
import { endPriceTable, parseStoredPriceModel, resellerPriceTable, type PriceModel } from "@/engine/price-model";

/**
 * Vem en order eller offert läses åt.
 * `reseller` = den inloggade återförsäljaren, som får se sina inköpspriser.
 * `customer` = kunden via en hemlig länk; då följer bara kundens prislista med.
 */
export type PriceAudience = "reseller" | "customer";

export interface PriceLists {
  /** Det kunden betalar. */
  priceList: PriceTable;
  /** Det återförsäljaren betalar. Saknas när raden läses åt kunden. */
  purchaseList?: PriceTable;
}

/** Modellen som sparats på raden. Rader från före prismodellen saknar den och får dagens. */
export function storedPriceModel(value: unknown, currentModel: PriceModel): PriceModel {
  return parseStoredPriceModel(value) ?? currentModel;
}

/**
 * Prislistorna ur modellen raden sparades med. Hela modellen (med provisionen)
 * stannar på servern; ut går bara det som parten själv betalar.
 */
export function priceListsFor(storedModel: unknown, currentModel: PriceModel, audience: PriceAudience): PriceLists {
  const model = storedPriceModel(storedModel, currentModel);
  return {
    priceList: endPriceTable(model),
    ...(audience === "reseller" && { purchaseList: resellerPriceTable(model) }),
  };
}
