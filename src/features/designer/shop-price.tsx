"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePriceList } from "@/components/price-list-provider";
import { markingPriceSek, optionPriceSek, type MarkingMethod, type MaterialId } from "@/engine";
import { percentFor, type ShopPriceList } from "@/lib/shops/price-list";

const ShopPriceContext = createContext<ShopPriceList | null>(null);

export function ShopPriceProvider({ priceList, children }: { priceList: ShopPriceList | null | undefined; children: ReactNode }) {
  return <ShopPriceContext.Provider value={priceList ?? null}>{children}</ShopPriceContext.Provider>;
}

/**
 * Kundens priser i väljarna: prismodellens riktpris, med butikens påslag när skyltmotorn står i en butik.
 * Ett tillval kan ha olika pris per trappsteg; `tierIndex` är trappsteget för orderns antal.
 */
export function useShopPrices(tierIndex = 0): {
  /** Det en egen form lägger på skyltpriset. */
  customShapePrice: (materialId: MaterialId) => number;
  /** Det en märkningsmetod lägger på skyltpriset. Noll betyder att metoden ingår. */
  markingPrice: (method: MarkingMethod, materialId: MaterialId) => number;
} {
  const list = useContext(ShopPriceContext);
  const priceList = usePriceList();
  const adjust = (sek: number, materialId: MaterialId) =>
    list ? Math.round(sek * (1 + percentFor(list, materialId) / 100)) : sek;
  return {
    customShapePrice: (materialId) => adjust(optionPriceSek("customShape", priceList, tierIndex), materialId),
    markingPrice: (method, materialId) => adjust(markingPriceSek(method, priceList, tierIndex), materialId),
  };
}
