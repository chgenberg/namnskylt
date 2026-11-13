"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePriceModel } from "@/components/price-model-provider";
import { fromPriceSek, mountingPriceSek, type MaterialId, type MountingId } from "@/engine";
import { percentFor, type ShopPriceList } from "@/lib/shops/price-list";

const ShopPriceContext = createContext<ShopPriceList | null>(null);

export function ShopPriceProvider({ priceList, children }: { priceList: ShopPriceList | null | undefined; children: ReactNode }) {
  return <ShopPriceContext.Provider value={priceList ?? null}>{children}</ShopPriceContext.Provider>;
}

/** Kundens priser i väljarna: prismodellens riktpris, med butikens påslag när skyltmotorn står i en butik. */
export function useShopPrices(): {
  /** Lägsta pris för en skylt i materialet, med det billigaste fästet. */
  fromPrice: (materialId: MaterialId) => number;
  /** Det fästet lägger på skyltpriset. */
  mountingPrice: (mounting: MountingId, materialId: MaterialId) => number;
} {
  const list = useContext(ShopPriceContext);
  const model = usePriceModel();
  const adjust = (sek: number, materialId: MaterialId) =>
    list ? Math.round(sek * (1 + percentFor(list, materialId) / 100)) : sek;
  return {
    fromPrice: (materialId) => adjust(fromPriceSek(materialId, model), materialId),
    mountingPrice: (mounting, materialId) => adjust(mountingPriceSek(mounting, model), materialId),
  };
}
