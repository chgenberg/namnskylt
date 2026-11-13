"use client";

import { SHAPE_PRESETS, createBadgeDocument, outlinePath, withShapePreset } from "@/engine";
import styles from "./custom-shape.module.css";

/** Luft runt konturen i miniatyrens ruta, i mm. */
const ICON_PAD_MM = 4;
/** Alla miniatyrer ritas i samma ruta, så att förslagens storlek och proportioner går att jämföra. */
const ICON_BOX = {
  widthMm: Math.max(...SHAPE_PRESETS.map((p) => p.widthMm)) + ICON_PAD_MM * 2,
  heightMm: Math.max(...SHAPE_PRESETS.map((p) => p.heightMm)) + ICON_PAD_MM * 2,
};
/** Förslagets rundade kontur — samma som ritverktyget, ritningen och 3D-vyn visar. */
const PRESET_ICONS = SHAPE_PRESETS.map((preset) => ({
  preset,
  d: outlinePath(withShapePreset(createBadgeDocument(), preset.id)),
  x: (ICON_BOX.widthMm - preset.widthMm) / 2,
  y: (ICON_BOX.heightMm - preset.heightMm) / 2,
}));

interface PresetGalleryProps {
  /** Förslaget som formen fortfarande är; `null` när kunden har ritat om den eller laddat upp en egen. */
  activeId: string | null;
  onPick: (presetId: string) => void;
}

export function PresetGallery({ activeId, onPick }: PresetGalleryProps) {
  return (
    <div className={styles.presets} role="group" aria-label="Formförslag">
      {PRESET_ICONS.map(({ preset, d, x, y }) => (
        <button
          key={preset.id}
          type="button"
          className={styles.preset}
          aria-pressed={preset.id === activeId}
          title={`${preset.name}, ${preset.widthMm} × ${preset.heightMm} mm`}
          onClick={() => onPick(preset.id)}
        >
          <svg className={styles.presetIcon} viewBox={`0 0 ${ICON_BOX.widthMm} ${ICON_BOX.heightMm}`} aria-hidden="true">
            <path d={d} transform={`translate(${x} ${y})`} vectorEffect="non-scaling-stroke" />
          </svg>
          <span>{preset.name}</span>
        </button>
      ))}
    </div>
  );
}
