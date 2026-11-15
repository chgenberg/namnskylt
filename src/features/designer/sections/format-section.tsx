"use client";

import { AnimatePresence, motion } from "motion/react";
import type { Dispatch } from "react";
import { PanelSection } from "@/components/ui/panel-section";
import { Segmented } from "@/components/ui/segmented";
import { FRAME_STYLES, OFFERED_MATERIALS, SHAPE_PRESETS, blankOf, getMaterial, type BadgeDocument } from "@/engine";
import { CustomShapeEditor } from "../custom-shape/custom-shape-editor";
import { BlankPicker } from "../pickers";
import { useShopPrices } from "../shop-price";
import type { DesignerAction } from "../state";
import styles from "./sections.module.css";

/** Förslaget en egen form börjar från. */
const FIRST_PRESET_ID = SHAPE_PRESETS[0]?.id ?? "shield";
/** Egen form skärs ur ark, och i dagens sortiment är det bara plasten som gör det. */
const CUSTOM_SHAPE_OFFERED = OFFERED_MATERIALS.some((material) => material.customShape);
const CUSTOM_SHAPE_ELSEWHERE = "Endast möjlig för plastskyltar";

interface FormatSectionProps {
  doc: BadgeDocument;
  dispatch: Dispatch<DesignerAction>;
  /** Trappsteget för orderns antal — tillvalets pris kan skilja mellan trappstegen. */
  tierIndex: number;
}

/**
 * Ämnena har fast form och fast mått — kunden väljer ett av dem. Ett material
 * som skärs ur ark kan dessutom få en egen form, som ritas här under. På övriga
 * material syns valet ändå, med en rad om var det finns.
 */
export function FormatSection({ doc, dispatch, tierIndex }: FormatSectionProps) {
  const { widthMm, heightMm } = doc.size;
  const { customShapePrice } = useShopPrices(tierIndex);
  const custom = doc.shape === "custom";

  return (
    <PanelSection step={4} title="Form" aside={`${widthMm} × ${heightMm} mm`}>
      <BlankPicker
        value={blankOf(doc)?.id ?? null}
        onChange={(blankId) => dispatch({ type: "blank", blankId })}
        custom={
          getMaterial(doc.materialId).customShape
            ? {
                available: true,
                checked: custom,
                priceSek: customShapePrice(doc.materialId),
                onSelect: () => {
                  if (!custom) dispatch({ type: "custom/preset", presetId: FIRST_PRESET_ID });
                },
              }
            : CUSTOM_SHAPE_OFFERED
              ? { available: false, note: CUSTOM_SHAPE_ELSEWHERE }
              : undefined
        }
      />

      <AnimatePresence initial={false}>
        {custom && (
          <motion.div
            key="custom-shape"
            className={styles.customShape}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <CustomShapeEditor doc={doc} dispatch={dispatch} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className={styles.labelled}>
        <span className={styles.sliderLabel}>Graverad ram</span>
        <Segmented
          label="Ram"
          value={doc.frame.style}
          options={FRAME_STYLES.map((f) => ({ id: f.id, label: f.name }))}
          onChange={(style) => dispatch({ type: "frame", style })}
        />
      </div>
    </PanelSection>
  );
}
