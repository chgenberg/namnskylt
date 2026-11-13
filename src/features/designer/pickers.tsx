"use client";

import { motion } from "motion/react";
import type { CSSProperties } from "react";
import {
  BLANKS,
  OFFERED_MATERIALS,
  createBadgeDocument,
  getMaterial,
  outlinePath,
  withBlank,
  type BadgeBlank,
  type BadgeMaterial,
  type BlankId,
  type MaterialFinish,
  type MaterialId,
} from "@/engine";
import styles from "./pickers.module.css";
import { useShopPrices } from "./shop-price";

/** Luft runt konturen i ikonens ruta, i mm. */
const BLANK_ICON_PAD_MM = 2;
/** Alla ikoner ritas i samma ruta, så att ämnenas storlek går att jämföra. */
const BLANK_ICON_BOX = {
  widthMm: Math.max(...BLANKS.map((b) => b.widthMm)) + BLANK_ICON_PAD_MM * 2,
  heightMm: Math.max(...BLANKS.map((b) => b.heightMm)) + BLANK_ICON_PAD_MM * 2,
};

/** Ämnets riktiga kontur i skala — samma som ritningen och 3D-vyn använder. */
function BlankIcon({ blank }: { blank: BadgeBlank }) {
  const d = outlinePath(withBlank(createBadgeDocument(), blank.id));
  const x = (BLANK_ICON_BOX.widthMm - blank.widthMm) / 2;
  const y = (BLANK_ICON_BOX.heightMm - blank.heightMm) / 2;
  return (
    <svg
      className={styles.blankIcon}
      viewBox={`0 0 ${BLANK_ICON_BOX.widthMm} ${BLANK_ICON_BOX.heightMm}`}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
    >
      <path d={d} transform={`translate(${x} ${y})`} vectorEffect="non-scaling-stroke" />
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

function materialSwatch(material: BadgeMaterial): string {
  return finishSwatch(material.finish, material.colors[0]?.surface ?? "#ccc");
}

interface MaterialPickerProps {
  value: MaterialId;
  onChange: (id: MaterialId) => void;
  /** Unik per plats, så markeringens animation inte hoppar mellan två väljare. */
  layoutId: string;
  compact?: boolean;
}

/** Visas bara när det finns mer än ett material att välja mellan. */
export function MaterialPicker({ value, onChange, layoutId, compact = false }: MaterialPickerProps) {
  const { fromPrice } = useShopPrices();
  if (OFFERED_MATERIALS.length < 2) return null;
  return (
    <div className={styles.materialGrid} data-compact={compact} role="radiogroup" aria-label="Material">
      {OFFERED_MATERIALS.map((m) => {
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
            <span className={styles.materialPrice}>från {fromPrice(m.id)} kr</span>
          </button>
        );
      })}
    </div>
  );
}

interface BlankPickerProps {
  /** `null` för en äldre skylt som inte ligger på något ämne. */
  value: BlankId | null;
  onChange: (blankId: BlankId) => void;
}

export function BlankPicker({ value, onChange }: BlankPickerProps) {
  return (
    <div className={styles.blankGrid} role="radiogroup" aria-label="Form">
      {BLANKS.map((blank) => (
        <button
          key={blank.id}
          type="button"
          role="radio"
          aria-checked={blank.id === value}
          className={styles.blankCard}
          onClick={() => onChange(blank.id)}
        >
          <BlankIcon blank={blank} />
          <span>{blank.name}</span>
          <span className={`mono ${styles.blankSize}`}>
            {blank.widthMm} × {blank.heightMm} mm
          </span>
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
  const material = getMaterial(materialId);
  const isMetal = material.finish === "aluminium" || material.finish === "steel" || material.finish === "brass";
  return (
    <div className={styles.swatches} role="radiogroup" aria-label="Färg">
      {material.colors.map((c) => (
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
            data-brushed={isMetal && !c.lacquered}
            style={{ "--surface": c.surface, "--engraving": c.engraving } as CSSProperties}
          />
        </button>
      ))}
    </div>
  );
}
