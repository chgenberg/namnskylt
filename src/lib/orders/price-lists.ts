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
 * Upphämtning har ingen frakt. Expressfraktens pris sätter verkstaden i
 * efterhand: tills dess är frakten 0, därefter beloppet i `expressSek`.
 */
export function shippingFor(
  model: PriceModel,
  badges: readonly BadgeDocument[],
  method: ShippingMethod = "standard",
  expressSek: number | null = null,
): number {
  if (method === "express") return expressSek ?? 0;
  return orderShippingSek(model, priceItemsOf(badges), method);
}

/**
 * Återförsäljarens lista för en rad med ett visst fraktsätt. När verkstaden har
 * satt expressfraktens pris bär listan det som en fast frakt, så att allt som
 * räknas ur listan får samma frakt som kunden betalar.
 */
function purchaseListFor(model: PriceModel, method: ShippingMethod, expressSek: number | null): PriceTable {
  const list = withShippingMethod(resellerPriceTable(model), method);
  if (method !== "express" || expressSek === null) return list;
  return { ...list, shipping: { letterSek: expressSek, parcelSek: expressSek, letterMaxSek: 0 } };
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
  /** Expressfraktens pris när verkstaden har satt det. */
  expressSek: number | null = null,
): PriceLists {
  const model = storedPriceModel(storedModel, currentModel);
  return {
    priceList: endPriceTable(model),
    // Inköpslistan följer radens fraktsätt, så att allt som räknas ur den får samma frakt som raden.
    ...(audience === "reseller" && { purchaseList: purchaseListFor(model, method, expressSek) }),
    shippingSek: shippingFor(model, badges, method, expressSek),
  };
}
