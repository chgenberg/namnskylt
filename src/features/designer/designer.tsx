"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import { BadgePreview } from "@/components/badge-preview";
import { Segmented } from "@/components/ui/segmented";
import {
  MAX_ORDER_BADGES,
  createBadgeDocument,
  getColor,
  getMaterial,
  layoutBadge,
  parseBatchInput,
  parseSmartInput,
  withTexts,
} from "@/engine";
import { useFontEngine } from "@/hooks/use-font-engine";
import { useVisualize } from "@/features/visualize/use-visualize";
import { VisualizeView } from "@/features/visualize/visualize-view";
import styles from "./designer.module.css";
import { BatchSection } from "./sections/batch-section";
import { FormatSection } from "./sections/format-section";
import { MaterialSection } from "./sections/material-section";
import { MountingSection } from "./sections/mounting-section";
import { OrderSection } from "./sections/order-section";
import { TextSection } from "./sections/text-section";
import type { SpinFocus } from "./badge-3d";
import type { BadgeRecorder } from "./three/recorder";
import { videoFileName } from "./video-file";
import { designerReducer, type DesignerAction } from "./state";

const Badge3D = dynamic(() => import("./badge-3d"), {
  ssr: false,
  loading: () => <div className={styles.loading} aria-hidden="true" />,
});

type View = "3d" | "drawing" | "person";

/** Samplingar per pixel innan fotoläget räknas som klart. */
const PHOTO_SAMPLES = 160;
/** Ett varv runt skylten i 3D-filmen. */
const VIDEO_SECONDS = 6;

const VIEW_OPTIONS = [
  { id: "3d", label: "3D" },
  { id: "drawing", label: "Ritning" },
  { id: "person", label: "På person" },
] as const;

interface DesignerProps {
  initialText: string;
}

export function Designer({ initialText }: DesignerProps) {
  const [doc, dispatch] = useReducer(designerReducer, initialText, (text) =>
    createBadgeDocument(parseSmartInput(text)),
  );
  const [view, setView] = useState<View>("3d");
  const [spinning, setSpinning] = useState(false);
  const [focus, setFocus] = useState<SpinFocus | null>(null);
  const [photo, setPhoto] = useState(false);
  const [photoSamples, setPhotoSamples] = useState(0);
  const fonts = useFontEngine();
  const recorderRef = useRef<BadgeRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [videoNote, setVideoNote] = useState<string | null>(null);
  const visualize = useVisualize(doc);
  const [batchText, setBatchText] = useState("");
  const batchEntries = useMemo(() => parseBatchInput(batchText, Infinity), [batchText]);
  const batch = useMemo(
    () => batchEntries.slice(0, MAX_ORDER_BADGES - 1).map((texts) => withTexts(doc, texts)),
    [batchEntries, doc],
  );
  const orderBadges = useMemo(() => [doc, ...batch], [doc, batch]);

  const togglePhoto = () => {
    const next = !photo;
    setPhoto(next);
    setPhotoSamples(0);
    if (next) {
      setSpinning(false);
      setFocus({ side: "hero", key: performance.now() });
    }
  };

  const recordVideo = async () => {
    const recorder = recorderRef.current;
    if (recording || !recorder) return;
    setPhoto(false);
    setVideoNote(null);
    setRecording(true);
    const clip = await recorder.recordTurn(VIDEO_SECONDS).catch(() => null);
    setRecording(false);
    if (!clip) {
      setVideoNote("Webbläsaren kan inte spela in video — prova Chrome eller Safari.");
      return;
    }
    const url = URL.createObjectURL(clip.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = videoFileName(doc, clip.extension);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setVideoNote("3D-filmen är nedladdad.");
  };

  const toggleSpin = () => {
    setSpinning((s) => !s);
    setPhoto(false);
  };

  const update = useCallback((action: DesignerAction) => {
    dispatch(action);
    if (action.type === "quantity") return;
    const side = action.type === "mounting" ? "back" : photo ? "hero" : "front";
    setFocus({ side, key: performance.now() });
  }, [photo]);
  const layout = useMemo(() => layoutBadge(doc, fonts), [doc, fonts]);

  const material = getMaterial(doc.materialId);
  const color = getColor(doc.materialId, doc.colorId);

  return (
    <div className={styles.shell} data-view={view}>
      <section className={`${styles.stage} dot-grid`} aria-label="Förhandsvisning">
        <div className={styles.stageTop}>
          <div className={styles.viewToggle}>
            <Segmented label="Vy" value={view} options={VIEW_OPTIONS} onChange={setView} />
          </div>
          {view === "3d" && (
            <div className={styles.stageActions}>
              <button
                type="button"
                className={`chip ${styles.stageChip}`}
                aria-pressed={photo}
                onClick={togglePhoto}
              >
                <span className={styles.photoIcon} aria-hidden="true" />
                Fotoläge
              </button>
              <button
                type="button"
                className={`chip ${styles.stageChip}`}
                data-recording={recording}
                title={`Spela in en ${VIDEO_SECONDS} sekunders 3D-film och ladda ner den`}
                disabled={recording}
                onClick={() => void recordVideo()}
              >
                <svg className={styles.chipIcon} viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="6" width="13" height="12" rx="2.5" />
                  <path d="M16 10.5l5-3v9l-5-3z" />
                </svg>
                {recording ? "Spelar in…" : "Video"}
              </button>
              <button
                type="button"
                className={`chip ${styles.stageChip}`}
                title="Vänd skylten och se andra sidan"
                onClick={() => setFocus({ side: "flip", key: performance.now() })}
              >
                <svg className={styles.chipIcon} viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" />
                  <path d="M18 3v4h-4M6 21v-4h4" />
                </svg>
                Vänd
              </button>
              <button
                type="button"
                className={`chip ${styles.stageChip}`}
                aria-pressed={spinning}
                title={spinning ? "Stoppa snurrandet" : "Låt skylten snurra"}
                onClick={toggleSpin}
              >
                <span className={styles.spinDot} data-on={spinning} aria-hidden="true" />
                Snurra
              </button>
            </div>
          )}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            className={styles.canvas}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {view === "3d" ? (
              <Badge3D
                doc={doc}
                fonts={fonts}
                spinning={spinning}
                focus={focus}
                photo={photo}
                photoSamples={PHOTO_SAMPLES}
                onPhotoProgress={setPhotoSamples}
                recorderRef={recorderRef}
              />
            ) : view === "drawing" ? (
              <div className={styles.drawing}>
                <BadgePreview doc={doc} showDimensions />
              </div>
            ) : (
              <VisualizeView state={visualize} />
            )}
          </motion.div>
        </AnimatePresence>

        <footer className={styles.stageBottom}>
          <p className={`mono ${styles.spec}`}>
            {doc.size.widthMm} × {doc.size.heightMm} mm · {material.name} · {color.name}
          </p>
          {view === "3d" && (recording || videoNote) ? (
            <p className={styles.hint} role="status">
              {recording ? "Spelar in 3D-film — rör inte skylten" : videoNote}
            </p>
          ) : view === "3d" && photo ? (
            <p className={`mono ${styles.hint}`} aria-live="polite">
              {photoSamples >= PHOTO_SAMPLES
                ? "Strålspårad · klar"
                : `Strålspårar · ${Math.round((photoSamples / PHOTO_SAMPLES) * 100)} %`}
            </p>
          ) : (
            view === "3d" && <p className={styles.hint}>Dra för att vrida skylten</p>
          )}
        </footer>
        {view === "3d" && recording && (
          <div
            className={styles.recProgress}
            style={{ "--duration": `${VIDEO_SECONDS}s` } as CSSProperties}
            aria-hidden="true"
          />
        )}
        {view === "3d" && photo && (
          <div
            className={styles.photoProgress}
            style={{ "--progress": photoSamples / PHOTO_SAMPLES } as CSSProperties}
            aria-hidden="true"
          />
        )}
      </section>

      <aside className={styles.panel} aria-label="Skyltmotor">
        <div className={styles.panelScroll}>
          <div className={styles.panelHead}>
            <p className="eyebrow">Skyltmotor</p>
            <h1 className={styles.panelTitle}>Din namnskylt</h1>
          </div>
          <TextSection doc={doc} layout={layout} dispatch={update} />
          <MaterialSection doc={doc} dispatch={update} />
          <FormatSection doc={doc} dispatch={update} />
          <MountingSection doc={doc} dispatch={update} />
          <BatchSection
            badges={batch}
            text={batchText}
            onTextChange={setBatchText}
            overflow={batchEntries.length - batch.length}
            fonts={fonts}
          />
        </div>
        <OrderSection doc={doc} badges={orderBadges} dispatch={update} />
      </aside>
    </div>
  );
}
