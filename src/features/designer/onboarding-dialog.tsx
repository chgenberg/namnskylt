"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type Dispatch } from "react";
import { BadgePreview } from "@/components/badge-preview";
import {
  OFFERED_MATERIALS,
  blankOf,
  getColor,
  getMaterial,
  isPartnerMade,
  shapeLabel,
  type BadgeDocument,
  type FontEngine,
} from "@/engine";
import type { BadgeRecorder } from "./three/recorder";
import { useCustomShapeChoice } from "./custom-shape-choice";
import { BlankPicker, ColorPicker, MaterialPicker } from "./pickers";
import styles from "./onboarding-dialog.module.css";
import type { DesignerAction } from "./state";

/** Samma 3D-skylt som i skyltmotorn; ritningen syns medan den laddar. */
const Badge3D = dynamic(() => import("./badge-3d"), { ssr: false, loading: () => null });

/** Närmare än i skyltmotorn — rutan är låg. */
const PREVIEW_CAMERA_Z = 3.7;
const noop = () => {};
/** Står på rutan "Egen form", så att det syns redan före valet att formen bestäms i nästa steg. */
const CUSTOM_SHAPE_HINT = "Välj exakt form i nästa steg";

interface OnboardingDialogProps {
  doc: BadgeDocument;
  fonts: FontEngine;
  dispatch: Dispatch<DesignerAction>;
  /** Trappsteget för orderns antal, som tillägget för egen form följer. */
  tierIndex: number;
  onClose: () => void;
}

/** Visas när kunden kommer från startsidan med sin text: välj det viktigaste först. */
export function OnboardingDialog({ doc, fonts, dispatch, tierIndex, onClose }: OnboardingDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const recorderRef = useRef<BadgeRecorder | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const material = getMaterial(doc.materialId);
  const color = getColor(doc.materialId, doc.colorId);
  const blank = blankOf(doc);
  const shapeName = shapeLabel(doc);
  const severalMaterials = OFFERED_MATERIALS.length > 1;
  // Samma former som i panelen till höger, även "Egen form", så att ingen missar den här.
  const customShape = useCustomShapeChoice(doc, dispatch, tierIndex);
  // Rutan har inget ritverktyg: formen som visas är ett förslag, och den riktiga väljs i nästa steg.
  const customChoice = customShape?.available ? { ...customShape, hint: CUSTOM_SHAPE_HINT } : customShape;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="onboarding-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) ref.current?.close();
      }}
    >
      <div className={styles.panel}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Innan du börjar</p>
            <h2 id="onboarding-title" className={styles.title}>
              {severalMaterials ? "Välj material och form" : "Välj yta och form"}
            </h2>
          </div>
          <button type="button" className={styles.close} aria-label="Stäng" onClick={() => ref.current?.close()}>
            ×
          </button>
        </header>

        <div className={styles.preview}>
          <div className={styles.preview3d}>
            {!canvasReady && <BadgePreview doc={doc} label="Din skylt" className={styles.previewBadge} />}
            <div className={styles.previewCanvas} aria-hidden="true">
              <Badge3D
                doc={doc}
                fonts={fonts}
                spinning
                focus={null}
                engrave={null}
                onEngraveDone={noop}
                photo={false}
                photoSamples={0}
                onPhotoProgress={noop}
                recorderRef={recorderRef}
                cameraZ={PREVIEW_CAMERA_Z}
                onReady={() => setCanvasReady(true)}
              />
            </div>
          </div>
          <p className={styles.previewMeta}>
            {material.name} · {color.name} · {shapeName} · {doc.size.widthMm} × {doc.size.heightMm} mm
          </p>
        </div>

        <div className={styles.body}>
          {severalMaterials && (
            <section className={styles.group} aria-labelledby="onboarding-material">
              <h3 id="onboarding-material" className={styles.groupTitle}>
                Material
              </h3>
              <MaterialPicker
                value={doc.materialId}
                layoutId="onboarding-material-active"
                onChange={(materialId) => dispatch({ type: "material", materialId })}
              />
              <p className={styles.note}>
                {material.description}
                {isPartnerMade(material.id) && " Pris och leveranstid bekräftas via e-post."}
              </p>
            </section>
          )}

          <section className={styles.group} aria-labelledby="onboarding-color">
            <h3 id="onboarding-color" className={styles.groupTitle}>
              {severalMaterials ? "Färg" : "Yta"} <span className={styles.groupAside}>{color.name}</span>
            </h3>
            <ColorPicker
              materialId={doc.materialId}
              value={doc.colorId}
              onChange={(colorId) => dispatch({ type: "color", colorId })}
            />
            {!severalMaterials && <p className={styles.note}>{material.description}</p>}
          </section>

          <section className={styles.group} aria-labelledby="onboarding-shape">
            <h3 id="onboarding-shape" className={styles.groupTitle}>
              Form
            </h3>
            <BlankPicker
              value={blank?.id ?? null}
              materialId={doc.materialId}
              onChange={(blankId) => dispatch({ type: "blank", blankId })}
              custom={customChoice}
            />
            {doc.shape === "custom" && (
              <p className={styles.note}>
                Formen på bilden är ett förslag. Du väljer exakt form i nästa steg: ett annat förslag, en egen ritning eller en
                uppladdad fil.
              </p>
            )}
          </section>
        </div>

        <footer className={styles.footer}>
          <p className={styles.footNote}>Priset per skylt beror på antalet och visas i nästa steg.</p>
          <button type="button" className="btn btn--ghost" onClick={() => ref.current?.close()}>
            Hoppa över
          </button>
          <button type="button" className="btn btn--primary" onClick={() => ref.current?.close()}>
            Fortsätt
          </button>
        </footer>
      </div>
    </dialog>
  );
}
