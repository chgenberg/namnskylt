"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PriceTable } from "@/engine";

/** Inget standardvärde: kalkylens siffror finns bara på servern och får inte bakas in i klientkoden. */
const PriceListContext = createContext<PriceTable | null>(null);

interface PriceListProviderProps {
  /** Slutkundens prislista. Aldrig hela prismodellen — den innehåller inköpspriser och provision. */
  priceList: PriceTable;
  children: ReactNode;
}

/** Slutkundens prislista som gäller nu, hämtad på servern. Allt som visar ett pris för en ny order läser den härifrån. */
export function PriceListProvider({ priceList, children }: PriceListProviderProps) {
  return <PriceListContext.Provider value={priceList}>{children}</PriceListContext.Provider>;
}

export function usePriceList(): PriceTable {
  const priceList = useContext(PriceListContext);
  if (!priceList) throw new Error("usePriceList kräver PriceListProvider (rotlayouten)");
  return priceList;
}
