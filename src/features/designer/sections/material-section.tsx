"use client";

import { motion } from "motion/react";
import type { Dispatch } from "react";
import { PanelSection } from "@/components/ui/panel-section";
import { MATERIALS, getColor, getMaterial, type BadgeDocument } from "@/engine";
import type { DesignerAction } from "../state";
import styles from "./sections.module.css";

const FINISH_SWATCH: Record<string, string> = {
  plastic: "linear-gradient(135deg, #ffffff, #e9e9e6)",
  aluminium: "linear-gradient(120deg, #b9bec5, #eef0f3 45%, #aeb3ba 55%, #dfe2e6)",
  steel: "linear-gradient(120deg, #c3c8cd, #f3f4f6 40%, #b3b8be 60%, #e4e6e9)",
};

interface MaterialSectionProps {
  doc: BadgeDocument;
  dispatch: Dispatch<DesignerAction>;
}

export function MaterialSection({ doc, dispatch }: MaterialSectionProps) {
  const material = getMaterial(doc.materialId);
  const color = getColor(doc.materialId, doc.colorId);

  return (
    <PanelSection step={2} title="Material & färg" aside={color.name}>
      <div className={styles.materialGrid} role="radiogroup" aria-label="Material">
        {MATERIALS.map((m) => {
          const active = m.id === doc.materialId;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={styles.materialCard}
              onClick={() => dispatch({ type: "material", materialId: m.id })}
            >
              {active && (
                <motion.span
                  layoutId="material-active"
                  className={styles.activeRing}
                  transition={{ type: "spring", stiffness: 480, damping: 38 }}
                />
              )}
              <span
                className={styles.materialSwatch}
                style={{ "--swatch": FINISH_SWATCH[m.finish] } as React.CSSProperties}
              />
              <span className={styles.materialName}>{m.name}</span>
              <span className={styles.materialPrice}>från {m.basePriceSek} kr</span>
            </button>
          );
        })}
      </div>
      <p className={styles.description}>{material.description}</p>

      <div className={styles.swatches} role="radiogroup" aria-label="Färg">
        {material.colors.map((c) => {
          const active = c.id === doc.colorId;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={c.name}
              title={c.name}
              className={styles.swatch}
              onClick={() => dispatch({ type: "color", colorId: c.id })}
            >
              <span
                className={styles.swatchFill}
                style={{ "--surface": c.surface, "--engraving": c.engraving } as React.CSSProperties}
              />
            </button>
          );
        })}
      </div>
    </PanelSection>
  );
}
