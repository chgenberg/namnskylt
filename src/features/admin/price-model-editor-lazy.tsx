"use client";

import dynamic from "next/dynamic";
import type { PriceModel } from "@/engine/price-model";

/**
 * Verktyget för prismodellen ligger i en egen JavaScript-fil som hämtas först
 * när det visas, alltså bara för admin. En återförsäljare som öppnar sidans
 * adress får varken verktyget eller koden bakom det.
 */
const Editor = dynamic(() => import("./price-model/price-model-editor").then((module) => module.PriceModelEditor));

export function LazyPriceModelEditor({ model }: { model: PriceModel }) {
  return <Editor model={model} />;
}
