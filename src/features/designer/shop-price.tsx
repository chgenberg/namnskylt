"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MaterialId } from "@/engine";
import { percentFor, type ShopPriceList } from "@/lib/shops/price-list";

const ShopPriceContext = createContext<ShopPriceList | null>(null);

export function ShopPriceProvider({ priceList, children }: { priceList: ShopPriceList | null | undefined; children: ReactNode }) {
  return <ShopPriceContext.Provider value={priceList ?? null}>{children}</ShopPriceContext.Provider>;
}

/** "Från"-priset i butiken: riktpriset med butikens påslag. */
export function useFromPrice(): (materialId: MaterialId, baseSek: number) => number {
  const list = useContext(ShopPriceContext);
  return (materialId, baseSek) => (list ? Math.round(baseSek * (1 + percentFor(list, materialId) / 100)) : baseSek);
}
