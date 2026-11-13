"use client";

import { useState, type CSSProperties, type Dispatch } from "react";
import { CUSTOM_SHAPE_LIMITS, proportionalCustomSize, type BadgeDocument } from "@/engine";
import type { DesignerAction } from "../state";
import styles from "./custom-shape.module.css";
import { MmField } from "./mm-field";

const RADIUS_STEP_MM = 0.5;

interface ShapeSizeFieldsProps {
  doc: BadgeDocument;
  dispatch: Dispatch<DesignerAction>;
}

function formatMm(value: number): string {
  return value.toLocaleString("sv-SE", { maximumFractionDigits: 1 });
}

/** Den egna formens mått och hörnrundning. Konturen skalas med måttet. */
export function ShapeSizeFields({ doc, dispatch }: ShapeSizeFieldsProps) {
  /** Låst: den andra sidan följer med, så att formen inte dras ut. */
  const [locked, setLocked] = useState(true);
  const { minSideMm, maxSideMm, maxCornerRadiusMm } = CUSTOM_SHAPE_LIMITS;

  const resize = (change: { widthMm?: number; heightMm?: number }) =>
    dispatch({ type: "custom/size", ...(locked ? proportionalCustomSize(doc.size, change) : change) });

  return (
    <div className={styles.sizeFields}>
      <div className={styles.sizeRow}>
        <MmField label="Bredd" value={doc.size.widthMm} min={minSideMm} max={maxSideMm} onCommit={(widthMm) => resize({ widthMm })} />
        <button
          type="button"
          className={styles.lock}
          aria-pressed={locked}
          aria-label="Behåll proportionerna"
          title={locked ? "Proportionerna är låsta — bredd och höjd följs åt" : "Lås proportionerna"}
          onClick={() => setLocked((on) => !on)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.8 1.7" />
            <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
            {!locked && <path d="M4 4l16 16" />}
          </svg>
        </button>
        <MmField label="Höjd" value={doc.size.heightMm} min={minSideMm} max={maxSideMm} onCommit={(heightMm) => resize({ heightMm })} />
      </div>
      <p className={styles.note}>
        Mellan {minSideMm} och {maxSideMm} mm på varje håll. {locked ? "Formen behåller sina proportioner." : "Bredd och höjd ändras var för sig."}
      </p>

      <label className={styles.sliderRow}>
        <span className={styles.fieldLabel}>Hörnrundning</span>
        <input
          type="range"
          className="range"
          min={0}
          max={maxCornerRadiusMm}
          step={RADIUS_STEP_MM}
          value={doc.cornerRadiusMm}
          style={{ "--range-fill": `${(doc.cornerRadiusMm / maxCornerRadiusMm) * 100}%` } as CSSProperties}
          onChange={(event) => dispatch({ type: "corner", cornerRadiusMm: Number(event.target.value) })}
        />
        <span className={`mono ${styles.sliderValue}`}>{formatMm(doc.cornerRadiusMm)} mm</span>
      </label>
    </div>
  );
}
