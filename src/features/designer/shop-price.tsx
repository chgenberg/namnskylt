"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePriceList } from "@/components/price-list-provider";
import { fromPriceSek, mountingPriceSek, optionPriceSek, type MaterialId, type MountingId } from "@/engine";
import { percentFor, type ShopPriceList } from "@/lib/shops/price-list";

const ShopPriceContext = createContext<ShopPriceList | null>(null);

export function ShopPriceProvider({ priceList, children }: { priceList: ShopPriceList | null | undefined; children: ReactNode }) {
  return <ShopPriceContext.Provider value={priceList ?? null}>{children}</ShopPriceContext.Provider>;
}

/**
 * Kundens priser i väljarna: prismodellens riktpris, med butikens påslag när skyltmotorn står i en butik.
 * Fästen och tillval kan ha olika pris per trappsteg; `tierIndex` är trappsteget för orderns antal.
 */
export function useShopPrices(tierIndex = 0): {
  /** Lägsta pris för en skylt i materialet, med det billigaste fästet. */
  fromPrice: (materialId: MaterialId) => number;
  /** Det fästet lägger på skyltpriset. */
  mountingPrice: (mounting: MountingId, materialId: MaterialId) => number;
  /** Det en egen form lägger på skyltpriset. */
  customShapePrice: (materialId: MaterialId) => number;
} {
  const list = useContext(ShopPriceContext);
  const priceList = usePriceList();
  const adjust = (sek: number, materialId: MaterialId) =>
    list ? Math.round(sek * (1 + percentFor(list, materialId) / 100)) : sek;
  return {
    fromPrice: (materialId) => adjust(fromPriceSek(materialId, priceList), materialId),
    mountingPrice: (mounting, materialId) => adjust(mountingPriceSek(mounting, priceList, tierIndex), materialId),
    customShapePrice: (materialId) => adjust(optionPriceSek("customShape", priceList, tierIndex), materialId),
  };
}
