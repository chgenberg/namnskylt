"use client";

import { AnimatePresence, motion } from "motion/react";
import type { Dispatch } from "react";
import { PanelSection } from "@/components/ui/panel-section";
import { Segmented } from "@/components/ui/segmented";
import { FRAME_STYLES, blankOf, type BadgeDocument } from "@/engine";
import { useCustomShapeChoice } from "../custom-shape-choice";
import { CustomShapeEditor } from "../custom-shape/custom-shape-editor";
import { BlankPicker } from "../pickers";
import type { DesignerAction } from "../state";
import styles from "./sections.module.css";

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
  // Samma val som i startrutan, så att de två alltid visar samma former.
  const customChoice = useCustomShapeChoice(doc, dispatch, tierIndex);
  const custom = doc.shape === "custom";

  return (
    <PanelSection step={4} title="Form" aside={`${widthMm} × ${heightMm} mm`}>
      <BlankPicker
        value={blankOf(doc)?.id ?? null}
        onChange={(blankId) => dispatch({ type: "blank", blankId })}
        custom={customChoice}
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
