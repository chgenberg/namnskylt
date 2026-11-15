import "server-only";
import { priceItemsOf, withShippingMethod, type BadgeDocument, type PriceTable, type ShippingMethod } from "@/engine";
import { endPriceTable, orderShippingSek, parseStoredPriceModel, resellerPriceTable, type PriceModel } from "@/engine/price-model";

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
  /** Orderns frakt, samma för kunden och återförsäljaren. Kunden får beloppet, aldrig inköpspriserna det räknas på. */
  shippingSek: number;
}

/**
 * Frakten för skyltarna enligt en prismodell. Samma belopp i alla led.
 * Upphämtning och express har ingen frakt på ordern.
 */
export function shippingFor(model: PriceModel, badges: readonly BadgeDocument[], method: ShippingMethod = "standard"): number {
  return orderShippingSek(model, priceItemsOf(badges), method);
}

/** Modellen som sparats på raden. Rader från före prismodellen saknar den och får dagens. */
export function storedPriceModel(value: unknown, currentModel: PriceModel): PriceModel {
  return parseStoredPriceModel(value) ?? currentModel;
}

/**
 * Prislistorna och frakten ur modellen raden sparades med. Hela modellen (med
 * provisionen) stannar på servern; ut går bara det som parten själv betalar.
 */
export function priceListsFor(
  storedModel: unknown,
  currentModel: PriceModel,
  audience: PriceAudience,
  badges: readonly BadgeDocument[],
  method: ShippingMethod = "standard",
): PriceLists {
  const model = storedPriceModel(storedModel, currentModel);
  return {
    priceList: endPriceTable(model),
    // Inköpslistan följer radens fraktsätt, så att allt som räknas ur den får samma frakt som raden.
    ...(audience === "reseller" && { purchaseList: withShippingMethod(resellerPriceTable(model), method) }),
    shippingSek: shippingFor(model, badges, method),
  };
}
