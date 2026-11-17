"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePriceList } from "@/components/price-list-provider";
import {
  lastTierIndex,
  markingPriceSek,
  mountingPriceSek,
  optionPriceSek,
  type MarkingMethod,
  type MaterialId,
  type MountingId,
} from "@/engine";
import { formatSek } from "@/lib/format";
import { percentFor, type ShopPriceList } from "@/lib/shops/price-list";

const ShopPriceContext = createContext<ShopPriceList | null>(null);

export function ShopPriceProvider({ priceList, children }: { priceList: ShopPriceList | null | undefined; children: ReactNode }) {
  return <ShopPriceContext.Provider value={priceList ?? null}>{children}</ShopPriceContext.Provider>;
}

/**
 * Texten vid ett val i väljarna: "Pris från: 31 kr", eller "Ingår" när valet
 * inte kostar något. Priset från är det lägsta, alltså det som gäller på
 * trappsteget med flest skyltar (beslut av ägaren 2026-11-17).
 */
export function fromPriceLabel(sek: number): string {
  // Beloppet hålls ihop med hårt mellanslag, så att raden bryts efter "Pris från:" i ett smalt kort.
  return sek > 0 ? `Pris från: ${formatSek(sek).replace(/ /g, "\u00a0")}` : "Ingår";
}

/**
 * Kundens priser i väljarna: prismodellens riktpris, med butikens påslag när skyltmotorn står i en butik.
 * Väljarna visar priset från, alltså trappsteget med flest skyltar. Det som gäller för just den här ordern
 * följer `tierIndex`, trappsteget för orderns antal.
 */
export function useShopPrices(tierIndex = 0): {
  /** Det en märkningsmetod lägger på skyltpriset i den här ordern. Noll betyder att metoden ingår. */
  markingPrice: (method: MarkingMethod, materialId: MaterialId) => number;
  /** Lägsta priset för en märkningsmetod. */
  markingFrom: (method: MarkingMethod, materialId: MaterialId) => number;
  /** Lägsta priset för det en egen form lägger på skyltpriset. */
  customShapeFrom: (materialId: MaterialId) => number;
  /** Lägsta priset för ett fäste. */
  mountingFrom: (mounting: MountingId, materialId: MaterialId) => number;
} {
  const list = useContext(ShopPriceContext);
  const priceList = usePriceList();
  const lowest = lastTierIndex(priceList);
  const adjust = (sek: number, materialId: MaterialId) =>
    list ? Math.round(sek * (1 + percentFor(list, materialId) / 100)) : sek;
  return {
    markingPrice: (method, materialId) => adjust(markingPriceSek(method, priceList, tierIndex), materialId),
    markingFrom: (method, materialId) => adjust(markingPriceSek(method, priceList, lowest), materialId),
    customShapeFrom: (materialId) => adjust(optionPriceSek("customShape", priceList, lowest), materialId),
    mountingFrom: (mounting, materialId) => adjust(mountingPriceSek(mounting, priceList, lowest), materialId),
  };
}
