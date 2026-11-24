"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BadgePreview } from "@/components/badge-preview";
import {
  getColor,
  getMarkingMethod,
  getMaterial,
  markingOf,
  mountingLabel,
  shapeLabel,
  type BadgeDocument,
  type FontEngine,
} from "@/engine";
import type { PanelSectionId } from "./panel-steps";
import type { BadgeRecorder } from "./three/recorder";
import styles from "./onboarding-dialog.module.css";

/** Samma 3D-skylt som i skyltmotorn; ritningen syns medan den laddar. */
const Badge3D = dynamic(() => import("./badge-3d"), { ssr: false, loading: () => null });

/** Närmare än i skyltmotorn — rutan är låg. */
const PREVIEW_CAMERA_Z = 3.7;
const noop = () => {};

/** Flikarnas namn i stegrutan. Panelens genvägar på telefon har kortare namn (`PANEL_SECTIONS`). */
const STEP_LABELS: Record<PanelSectionId, string> = {
  material: "Material & färg",
  format: "Form",
  text: "Text",
  marking: "Märkning",
  logo: "Logga",
  mounting: "Fäste",
  batch: "Fler namn",
};

/** Steg som går att hoppa över: de står som valfria. */
const OPTIONAL: ReadonlySet<PanelSectionId> = new Set(["logo", "batch"]);

export interface DesignStep {
  id: PanelSectionId;
  /** Samma sektion som i panelen, med samma val och regler. */
  content: ReactNode;
}

interface OnboardingDialogProps {
  doc: BadgeDocument;
  fonts: FontEngine;
  steps: readonly DesignStep[];
  /** Antal namn i ordern med skylten i editorn, för sammanfattningen. */
  names: number;
  onClose: () => void;
}

/**
 * Stegrutan före skyltmotorn (besked av ägaren 2026-11-24: som "Börja designa" på merchin.se/kepsar,
 * med flikarna och ett val i taget, men i Namnskylts utseende). Varje steg är panelens egen sektion,
 * så valen, priserna och reglerna är exakt desamma som i skyltmotorn: rutan byter bara ordning på hur
 * de visas. Skylten syns hela tiden bredvid, och längst ner står det som är valt.
 */
export function OnboardingDialog({ doc, fonts, steps, names, onClose }: OnboardingDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<BadgeRecorder | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [visited, setVisited] = useState<ReadonlySet<number>>(() => new Set([0]));
  const step = steps[index]!;
  const last = index === steps.length - 1;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Nytt steg: rutan börjar uppifrån, och i steget Text står markören i namnet om det är tomt.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.scrollTop = 0;
    if (step.id !== "text") return;
    const input = body.querySelector<HTMLInputElement>('input[aria-label="Rad 1"]');
    if (input && input.value.trim() === "") input.focus({ preventScroll: true });
  }, [step.id]);

  const go = (next: number) => {
    const target = Math.max(0, Math.min(steps.length - 1, next));
    setIndex(target);
    setVisited((current) => new Set(current).add(target));
  };

  const material = getMaterial(doc.materialId);
  const color = getColor(doc.materialId, doc.colorId);
  const summary = [
    `${material.name} · ${color.name}`,
    `${shapeLabel(doc)} ${doc.size.widthMm} × ${doc.size.heightMm} mm`,
    getMarkingMethod(markingOf(doc)).name,
    mountingLabel(doc),
    names > 1 ? `${names} namn` : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
            <p className={styles.eyebrow}>
              Steg <span className={styles.eyebrowStep}>{index + 1}</span> av {steps.length}
            </p>
            <h2 id="onboarding-title" className={styles.title}>
              Designa din skylt
            </h2>
          </div>
          <button type="button" className={styles.close} aria-label="Stäng och gå till skyltmotorn" onClick={() => ref.current?.close()}>
            ×
          </button>
        </header>

        <nav className={styles.tabs} aria-label="Stegen">
          <ol>
            {steps.map((item, i) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.tab}
                  aria-current={i === index ? "step" : undefined}
                  data-visited={visited.has(i) && i !== index ? "" : undefined}
                  onClick={() => go(i)}
                >
                  <span className={styles.tabNumber}>{String(i + 1).padStart(2, "0")}</span>
                  {STEP_LABELS[item.id]}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className={styles.main}>
          <div ref={bodyRef} className={styles.body}>
            {OPTIONAL.has(step.id) && (
              <p className={styles.optional}>
                Valfritt.{" "}
                {step.id === "logo"
                  ? "Hoppa över om skylten ska vara utan logga."
                  : "Ska fler ha samma skylt skriver eller klistrar du in deras namn här. Annars hoppar du över steget."}
              </p>
            )}
            {/* Nyckeln gör att steget börjar om när det byts, precis som när panelen ritas. */}
            <div key={step.id} className={styles.step}>
              {step.content}
            </div>
          </div>

          <aside className={styles.preview} aria-label="Din skylt">
            <div className={styles.preview3d}>
              {!canvasReady && <BadgePreview doc={doc} label="Din skylt" className={styles.previewBadge} placeholders />}
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
            <p className={styles.previewMeta}>Priset per skylt beror på antalet och visas i skyltmotorn.</p>
          </aside>
        </div>

        <footer className={styles.footer}>
          <p className={`mono ${styles.summary}`} title={summary}>
            {summary}
          </p>
          <div className={styles.actions}>
            {index > 0 && (
              <button type="button" className="btn btn--ghost" onClick={() => go(index - 1)}>
                Tillbaka
              </button>
            )}
            {last ? (
              <button type="button" className="btn btn--primary" onClick={() => ref.current?.close()}>
                Till skyltmotorn →
              </button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={() => go(index + 1)}>
                Nästa →
              </button>
            )}
          </div>
        </footer>
      </div>
    </dialog>
  );
}
