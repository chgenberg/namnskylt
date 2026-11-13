"use client";

import type { Dispatch } from "react";
import { PanelSection } from "@/components/ui/panel-section";
import { Segmented } from "@/components/ui/segmented";
import { FRAME_STYLES, blankOf, type BadgeDocument } from "@/engine";
import { BlankPicker } from "../pickers";
import type { DesignerAction } from "../state";
import styles from "./sections.module.css";

interface FormatSectionProps {
  doc: BadgeDocument;
  dispatch: Dispatch<DesignerAction>;
}

/** Ämnena har fast form och fast mått — kunden väljer ett av dem. */
export function FormatSection({ doc, dispatch }: FormatSectionProps) {
  const { widthMm, heightMm } = doc.size;

  return (
    <PanelSection step={4} title="Form" aside={`${widthMm} × ${heightMm} mm`}>
      <BlankPicker value={blankOf(doc)?.id ?? null} onChange={(blankId) => dispatch({ type: "blank", blankId })} />

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
