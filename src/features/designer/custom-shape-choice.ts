"use client";

import type { Dispatch } from "react";
import { OFFERED_MATERIALS, SHAPE_PRESETS, getMaterial, type BadgeDocument } from "@/engine";
import type { CustomShapeChoice } from "./pickers";
import { useShopPrices } from "./shop-price";
import type { DesignerAction } from "./state";

/** Förslaget en egen form börjar från. */
const FIRST_PRESET_ID = SHAPE_PRESETS[0]?.id ?? "shield";
/** Egen form skärs ur ark, och i dagens sortiment är det bara plasten som gör det. */
const CUSTOM_SHAPE_OFFERED = OFFERED_MATERIALS.some((material) => material.customShape);
const CUSTOM_SHAPE_ELSEWHERE = "Endast möjlig för plastskyltar";

/**
 * Valet "Egen form" i formväljaren. Startrutan och panelen frågar här båda två,
 * så att de alltid visar samma former: på ett material som skärs ur ark går
 * formen att välja, på övriga syns den med en rad om var den finns.
 * `tierIndex` är trappsteget för orderns antal, som tilläggets pris följer.
 */
export function useCustomShapeChoice(doc: BadgeDocument, dispatch: Dispatch<DesignerAction>, tierIndex: number): CustomShapeChoice | undefined {
  const { customShapePrice } = useShopPrices(tierIndex);
  const checked = doc.shape === "custom";
  if (getMaterial(doc.materialId).customShape) {
    return {
      available: true,
      checked,
      priceSek: customShapePrice(doc.materialId),
      onSelect: () => {
        if (!checked) dispatch({ type: "custom/preset", presetId: FIRST_PRESET_ID });
      },
    };
  }
  return CUSTOM_SHAPE_OFFERED ? { available: false, note: CUSTOM_SHAPE_ELSEWHERE } : undefined;
}
