"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type Dispatch } from "react";
import { BadgePreview } from "@/components/badge-preview";
import { SHAPES, getColor, getMaterial, isPartnerMade, type BadgeDocument, type FontEngine } from "@/engine";
import type { BadgeRecorder } from "./three/recorder";
import { ColorPicker, MaterialPicker, ShapePicker } from "./pickers";
import styles from "./onboarding-dialog.module.css";
import type { DesignerAction } from "./state";
import { useFromPrice } from "./shop-price";

/** Samma 3D-skylt som i skyltmotorn; ritningen syns medan den laddar. */
const Badge3D = dynamic(() => import("./badge-3d"), { ssr: false, loading: () => null });

/** Närmare än i skyltmotorn — rutan är låg. */
const PREVIEW_CAMERA_Z = 3.7;
const noop = () => {};

interface OnboardingDialogProps {
  doc: BadgeDocument;
  fonts: FontEngine;
  dispatch: Dispatch<DesignerAction>;
  onClose: () => void;
}

/** Visas när kunden kommer från startsidan med sin text: välj det viktigaste först. */
export function OnboardingDialog({ doc, fonts, dispatch, onClose }: OnboardingDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const recorderRef = useRef<BadgeRecorder | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const material = getMaterial(doc.materialId);
  const color = getColor(doc.materialId, doc.colorId);
  const fromPrice = useFromPrice();
  const shapeName = SHAPES.find((s) => s.id === doc.shape)?.name;

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
              Välj material och form
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

          <section className={styles.group} aria-labelledby="onboarding-color">
            <h3 id="onboarding-color" className={styles.groupTitle}>
              Färg <span className={styles.groupAside}>{color.name}</span>
            </h3>
            <ColorPicker
              materialId={doc.materialId}
              value={doc.colorId}
              onChange={(colorId) => dispatch({ type: "color", colorId })}
            />
          </section>

          <section className={styles.group} aria-labelledby="onboarding-shape">
            <h3 id="onboarding-shape" className={styles.groupTitle}>
              Form
            </h3>
            <ShapePicker value={doc.shape} onChange={(shape) => dispatch({ type: "shape", shape })} />
          </section>
        </div>

        <footer className={styles.footer}>
          <p className={styles.price}>
            från <strong>{fromPrice(material.id, material.basePriceSek)} kr</strong> / st
          </p>
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
