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

/** Så många av materialets färger får plats som band på kortet. */
const SWATCH_BANDS = 6;

/** Sneda band i materialets egna ytfärger, i katalogens ordning. */
function colorBands(surfaces: readonly string[]): string {
  const share = 100 / surfaces.length;
  return `linear-gradient(115deg, ${surfaces.map((surface, i) => `${surface} ${i * share}% ${(i + 1) * share}%`).join(", ")})`;
}

/** Hörnen i ikonen för egen form: en fri kontur med synliga punkter, som i ritverktyget. */
const CUSTOM_ICON_POINTS = [
  [16, 12],
  [44, 6],
  [66, 20],
  [58, 42],
  [26, 44],
  [10, 30],
] as const;

function CustomShapeIcon() {
  return (
    <svg
      className={styles.blankIcon}
      viewBox={`0 0 ${BLANK_ICON_BOX.widthMm} ${BLANK_ICON_BOX.heightMm}`}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
    >
      <polygon points={CUSTOM_ICON_POINTS.map(([x, y]) => `${x},${y}`).join(" ")} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {CUSTOM_ICON_POINTS.map(([x, y]) => (
        <circle key={`${x}-${y}`} className={styles.blankIconPoint} cx={x} cy={y} r={2.6} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

/** Ytan som materialkortet visar — första färgens yta med materialets glans, eller plastens färger sida vid sida. */
function finishSwatch(finish: MaterialFinish, surfaces: readonly string[]): string {
  const surface = surfaces[0] ?? "#ccc";
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
      // Gravyrplasten är matt och enfärgad; kortet visar färgerna den säljs i.
      return colorBands(surfaces);
  }
}

function materialSwatch(material: BadgeMaterial): string {
  const surfaces = [...new Set(material.colors.map((color) => color.surface))];
  return finishSwatch(material.finish, surfaces.slice(0, SWATCH_BANDS));
}

interface MaterialPickerProps {
  value: MaterialId;
  onChange: (id: MaterialId) => void;
  /** Unik per plats, så markeringens animation inte hoppar mellan två väljare. */
  layoutId: string;
  compact?: boolean;
}

/**
 * Visas bara när det finns mer än ett material att välja mellan. Korten har
 * inget pris: priset per skylt beror på orderns antal och står bredvid antalet.
 */
export function MaterialPicker({ value, onChange, layoutId, compact = false }: MaterialPickerProps) {
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
          </button>
        );
      })}
    </div>
  );
}

/**
 * Valet "Egen form" bredvid ämnena. Det går att välja för material som skärs ur
 * ark. På övriga material syns det ändå, med en rad om var det finns, så att
 * ingen missar att formen går att rita själv.
 */
type CustomShapeChoice =
  | {
      available: true;
      checked: boolean;
      /** Tillägget per skylt för slutkunden. */
      priceSek: number;
      onSelect: () => void;
    }
  | {
      available: false;
      /** Var formen finns, till exempel "Endast möjlig för plastskyltar". */
      note: string;
    };

interface BlankPickerProps {
  /** `null` för en äldre skylt som inte ligger på något ämne, och för en egen form. */
  value: BlankId | null;
  onChange: (blankId: BlankId) => void;
  /** Utelämnas där en egen form inte ska visas alls. */
  custom?: CustomShapeChoice;
}

export function BlankPicker({ value, onChange, custom }: BlankPickerProps) {
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
      {custom?.available && (
        <button type="button" role="radio" aria-checked={custom.checked} className={styles.blankCard} onClick={custom.onSelect}>
          <CustomShapeIcon />
          <span>Egen form</span>
          <span className={`mono ${styles.blankSize}`}>+{custom.priceSek} kr</span>
        </button>
      )}
      {custom && !custom.available && (
        // Går inte att välja, men går att nå med tangentbordet så att raden om var formen finns blir läst.
        <button type="button" role="radio" aria-checked={false} aria-disabled="true" className={styles.blankCard}>
          <CustomShapeIcon />
          <span>Egen form</span>
          <span className={styles.blankNote}>{custom.note}</span>
        </button>
      )}
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
