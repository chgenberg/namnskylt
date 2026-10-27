"use client";

import type { Dispatch } from "react";
import { PanelSection } from "@/components/ui/panel-section";
import { Segmented } from "@/components/ui/segmented";
import { FRAME_STYLES, SHAPES, SIZE_LIMITS, SIZE_PRESETS, type BadgeDocument, type BadgeShape } from "@/engine";
import type { DesignerAction } from "../state";
import styles from "./sections.module.css";

const SHAPE_ICON: Record<BadgeShape, React.ReactNode> = {
  rectangle: <rect x="2" y="4" width="16" height="10" rx="0.5" />,
  rounded: <rect x="2" y="4" width="16" height="10" rx="3.5" />,
  oval: <ellipse cx="10" cy="9" rx="8" ry="5" />,
};

interface DimensionInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function DimensionInput({ label, value, min, max, onChange }: DimensionInputProps) {
  return (
    <label className={`field ${styles.dimension}`}>
      <span className={styles.dimensionLabel}>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next) && next >= min) onChange(next);
        }}
      />
      <span className={styles.unit}>mm</span>
    </label>
  );
}

interface FormatSectionProps {
  doc: BadgeDocument;
  dispatch: Dispatch<DesignerAction>;
}

export function FormatSection({ doc, dispatch }: FormatSectionProps) {
  const { widthMm, heightMm } = doc.size;
  const cornerMax = Math.floor(Math.min(widthMm, heightMm) / 2);

  return (
    <PanelSection step={4} title="Form & storlek" aside={`${widthMm} × ${heightMm} mm`}>
      <Segmented
        label="Form"
        value={doc.shape}
        options={SHAPES.map((s) => ({
          id: s.id,
          label: (
            <>
              <svg viewBox="0 0 20 18" width="18" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
                {SHAPE_ICON[s.id]}
              </svg>
              {s.name}
            </>
          ),
        }))}
        onChange={(shape) => dispatch({ type: "shape", shape })}
      />

      <div className={styles.chips}>
        {SIZE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="chip"
            aria-pressed={preset.widthMm === widthMm && preset.heightMm === heightMm}
            onClick={() => dispatch({ type: "size", widthMm: preset.widthMm, heightMm: preset.heightMm })}
          >
            <span className="mono">
              {preset.widthMm}×{preset.heightMm}
            </span>
            <span className={styles.chipMuted}>{preset.label}</span>
          </button>
        ))}
      </div>

      <div className={styles.split}>
        <DimensionInput
          label="Bredd"
          value={widthMm}
          min={SIZE_LIMITS.minWidthMm}
          max={SIZE_LIMITS.maxWidthMm}
          onChange={(value) => dispatch({ type: "size", widthMm: value })}
        />
        <DimensionInput
          label="Höjd"
          value={heightMm}
          min={SIZE_LIMITS.minHeightMm}
          max={SIZE_LIMITS.maxHeightMm}
          onChange={(value) => dispatch({ type: "size", heightMm: value })}
        />
      </div>

      {doc.shape === "rounded" && (
        <label className={styles.sliderRow}>
          <span className={styles.sliderLabel}>Hörnradie</span>
          <input
            type="range"
            className="range"
            min={1}
            max={cornerMax}
            step={0.5}
            value={Math.min(doc.cornerRadiusMm, cornerMax)}
            style={{ "--range-fill": `${((Math.min(doc.cornerRadiusMm, cornerMax) - 1) / (cornerMax - 1)) * 100}%` } as React.CSSProperties}
            onChange={(e) => dispatch({ type: "corner", cornerRadiusMm: Number(e.target.value) })}
          />
          <span className={`mono ${styles.sliderValue}`}>{doc.cornerRadiusMm} mm</span>
        </label>
      )}

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
