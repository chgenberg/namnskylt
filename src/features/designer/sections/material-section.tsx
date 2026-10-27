"use client";

import type { Dispatch } from "react";
import { PanelSection } from "@/components/ui/panel-section";
import { getColor, getMaterial, isPartnerMade, type BadgeDocument } from "@/engine";
import { ColorPicker, MaterialPicker } from "../pickers";
import type { DesignerAction } from "../state";
import styles from "./sections.module.css";

interface MaterialSectionProps {
  doc: BadgeDocument;
  dispatch: Dispatch<DesignerAction>;
}

export function MaterialSection({ doc, dispatch }: MaterialSectionProps) {
  const material = getMaterial(doc.materialId);
  const color = getColor(doc.materialId, doc.colorId);

  return (
    <PanelSection step={3} title="Material & färg" aside={color.name}>
      <MaterialPicker
        value={doc.materialId}
        layoutId="material-active"
        onChange={(materialId) => dispatch({ type: "material", materialId })}
      />
      <p className={styles.description}>
        {material.description} {material.thicknessMm} mm tjock.
        {isPartnerMade(material.id) && " Tillverkas av vår partner – leveranstid och pris bekräftas via e-post."}
      </p>

      <ColorPicker
        materialId={doc.materialId}
        value={doc.colorId}
        onChange={(colorId) => dispatch({ type: "color", colorId })}
      />
    </PanelSection>
  );
}
