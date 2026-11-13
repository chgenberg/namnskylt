"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_PRICE_MODEL, type PriceModel } from "@/engine";

const PriceModelContext = createContext<PriceModel>(DEFAULT_PRICE_MODEL);

interface PriceModelProviderProps {
  model: PriceModel;
  children: ReactNode;
}

/** Prismodellen som gäller nu, hämtad på servern. Allt som visar ett pris för en ny order läser den härifrån. */
export function PriceModelProvider({ model, children }: PriceModelProviderProps) {
  return <PriceModelContext.Provider value={model}>{children}</PriceModelContext.Provider>;
}

export function usePriceModel(): PriceModel {
  return useContext(PriceModelContext);
}
