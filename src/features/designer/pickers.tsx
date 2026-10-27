"use client";

import { motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import {
  MATERIALS,
  SHAPES,
  getMaterial,
  type BadgeMaterial,
  type BadgeShape,
  type MaterialFinish,
  type MaterialId,
} from "@/engine";
import styles from "./pickers.module.css";

const SHAPE_ICON: Record<BadgeShape, ReactNode> = {
  rectangle: <rect x="2" y="5" width="20" height="12" rx="0.6" />,
  rounded: <rect x="2" y="5" width="20" height="12" rx="3" />,
  stadium: <rect x="2" y="5" width="20" height="12" rx="6" />,
  oval: <ellipse cx="12" cy="11" rx="10" ry="6.5" />,
  round: <circle cx="12" cy="11" r="8" />,
  hexagon: <path d="M7 5h10l5 6-5 6H7l-5-6z" />,
  octagon: <path d="M7.8 5h8.4L22 8.5v5L16.2 17H7.8L2 13.5v-5z" />,
};

export function ShapeIcon({ shape }: { shape: BadgeShape }) {
  return (
    <svg viewBox="0 0 24 22" width="24" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      {SHAPE_ICON[shape]}
    </svg>
  );
}

/** Ytan som materialkortet visar — första färgens yta med materialets glans. */
function finishSwatch(finish: MaterialFinish, surface: string): string {
  switch (finish) {
    case "brass":
      return `linear-gradient(120deg, ${surface}, #f7e7b4 42%, ${surface} 58%, #a8853a)`;
    case "aluminium":
      return `linear-gradient(120deg, ${surface}, #f2f3f5 45%, ${surface} 55%, #aeb3ba)`;
    case "steel":
      return "linear-gradient(120deg, #c3c8cd, #f3f4f6 40%, #b3b8be 60%, #e4e6e9)";
    case "acrylic":
      return "linear-gradient(160deg, rgb(255 255 255 / 0.9), rgb(220 228 236 / 0.55) 50%, #b9c1c9)";
    case "epoxy":
      return "radial-gradient(120% 90% at 30% 20%, #fff 0 8%, transparent 30%), linear-gradient(135deg, #1f4fb8, #d9488b 50%, #e8c21c)";
    case "plastic":
      return "linear-gradient(135deg, #ffffff 0 50%, #e31c23 50% 70%, #0057b8 70%)";
  }
}

export function materialSwatch(material: BadgeMaterial): string {
  return finishSwatch(material.finish, material.colors[0]?.surface ?? "#ccc");
}

interface MaterialPickerProps {
  value: MaterialId;
  onChange: (id: MaterialId) => void;
  /** Unik per plats, så markeringens animation inte hoppar mellan två väljare. */
  layoutId: string;
  compact?: boolean;
}

export function MaterialPicker({ value, onChange, layoutId, compact = false }: MaterialPickerProps) {
  return (
    <div className={styles.materialGrid} data-compact={compact} role="radiogroup" aria-label="Material">
      {MATERIALS.map((m) => {
        const active = m.id === value;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={active}
            className={styles.materialCard}
            onClick={() => onChange(m.id)}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className={styles.activeRing}
                transition={{ type: "spring", stiffness: 480, damping: 38 }}
              />
            )}
            <span className={styles.materialSwatch} style={{ "--swatch": materialSwatch(m) } as CSSProperties}>
              {m.exclusive && <span className={styles.exclusiveTag}>Exklusiv</span>}
            </span>
            <span className={styles.materialName}>{m.name}</span>
            {!compact && <span className={styles.materialTagline}>{m.tagline}</span>}
            <span className={styles.materialPrice}>från {m.basePriceSek} kr</span>
          </button>
        );
      })}
    </div>
  );
}

interface ShapePickerProps {
  value: BadgeShape;
  onChange: (shape: BadgeShape) => void;
}

export function ShapePicker({ value, onChange }: ShapePickerProps) {
  return (
    <div className={styles.shapeGrid} role="radiogroup" aria-label="Form">
      {SHAPES.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          aria-checked={s.id === value}
          className={styles.shapeCard}
          onClick={() => onChange(s.id)}
        >
          <ShapeIcon shape={s.id} />
          <span>{s.name}</span>
        </button>
      ))}
    </div>
  );
}

interface ColorPickerProps {
  materialId: MaterialId;
  value: string;
  onChange: (colorId: string) => void;
}

export function ColorPicker({ materialId, value, onChange }: ColorPickerProps) {
  return (
    <div className={styles.swatches} role="radiogroup" aria-label="Färg">
      {getMaterial(materialId).colors.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={c.id === value}
          aria-label={c.name}
          title={c.name}
          className={styles.swatch}
          onClick={() => onChange(c.id)}
        >
          <span
            className={styles.swatchFill}
            data-metallic={c.metallic ?? false}
            style={{ "--surface": c.surface, "--engraving": c.engraving } as CSSProperties}
          />
        </button>
      ))}
    </div>
  );
}
