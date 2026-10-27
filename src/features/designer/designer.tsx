"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import { withPlaceholders } from "@/components/badge-preview";
import { ProgressBanner } from "@/components/ui/progress-banner";
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
  type BadgeDocument,
} from "@/engine";
import { useFontEngine } from "@/hooks/use-font-engine";
import { useVisualize } from "@/features/visualize/use-visualize";
import { VisualizeView } from "@/features/visualize/visualize-view";
import { BadgeEditor } from "./badge-editor";
import styles from "./designer.module.css";
import { BatchSection } from "./sections/batch-section";
import { FormatSection } from "./sections/format-section";
import { LogoSection } from "./sections/logo-section";
import { MaterialSection } from "./sections/material-section";
import { MountingSection } from "./sections/mounting-section";
import { OrderSection } from "./sections/order-section";
import { TextSection } from "./sections/text-section";
import type { SpinFocus } from "./badge-3d";
import type { BadgeRecorder } from "./three/recorder";
import { shareBadge } from "./share";
import { videoFileName } from "./video-file";
import { OnboardingDialog } from "./onboarding-dialog";
import { designerReducer, type DesignerAction } from "./state";

const Badge3D = dynamic(() => import("./badge-3d"), {
  ssr: false,
  loading: () => (
    <div className={styles.loading}>
      <ProgressBanner
        variant="floating"
        active
        title="3D-vy"
        expectedMs={LOAD_3D_EXPECTED_MS}
        steps={LOAD_3D_STEPS}
      />
    </div>
  ),
});

type View = "3d" | "drawing" | "person";

/** Samplingar per pixel innan fotoläget räknas som klart. */
const PHOTO_SAMPLES = 160;
/** Ett varv runt skylten i 3D-filmen. */
const VIDEO_SECONDS = 6;
const VIDEO_STEPS = [
  [0, "Spelar in ett varv runt skylten…"],
  [85, "Sparar filmen…"],
] as const;
const SHARE_EXPECTED_MS = 2_500;
const SHARE_STEPS = [
  [0, "Ritar delningsbilden…"],
  [60, "Skapar länken…"],
] as const;
/** Ungefärlig tid för fotolägets samplingar på en vanlig laptop. */
const PHOTO_EXPECTED_MS = 4_000;
const PHOTO_STEPS = [
  [0, "Strålspårar ljuset…"],
  [40, "Mjukar upp skuggorna…"],
  [80, "Sista samplingarna…"],
] as const;
const LOAD_3D_EXPECTED_MS = 2_500;
const LOAD_3D_STEPS = [
  [0, "Laddar 3D-motorn…"],
  [55, "Fräser gravyren…"],
] as const;

const VIEW_OPTIONS = [
  { id: "3d", label: "3D" },
  { id: "drawing", label: "Ritning" },
  { id: "person", label: "På person" },
] as const;

interface DesignerProps {
  initialText: string;
  /** En delad skylt från länken — vinner över texten. */
  initialDoc?: BadgeDocument | null;
}

export function Designer({ initialText, initialDoc }: DesignerProps) {
  const [doc, dispatch] = useReducer(
    designerReducer,
    initialText,
    (text) => initialDoc ?? createBadgeDocument(parseSmartInput(text)),
  );
  const [view, setView] = useState<View>("3d");
  const [onboarding, setOnboarding] = useState(() => !initialDoc && initialText.trim() !== "");
  const [spinning, setSpinning] = useState(false);
  const [focus, setFocus] = useState<SpinFocus | null>(null);
  /** Skylten graveras fram en gång när designern öppnas, och igen på begäran. */
  const [engrave, setEngrave] = useState<number | null>(0);
  const [photo, setPhoto] = useState(false);
  const [photoSamples, setPhotoSamples] = useState(0);
  const fonts = useFontEngine();
  const recorderRef = useRef<BadgeRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [stageNote, setStageNote] = useState<string | null>(null);
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
    setStageNote(null);
    setRecording(true);
    const clip = await recorder.recordTurn(VIDEO_SECONDS).catch(() => null);
    setVideoFailed(!clip);
    setRecording(false);
    if (!clip) {
      setStageNote("Webbläsaren kan inte spela in video — prova Chrome eller Safari.");
      return;
    }
    const url = URL.createObjectURL(clip.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = videoFileName(doc, clip.extension);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStageNote("3D-filmen är nedladdad.");
  };

  const endEngrave = useCallback(() => setEngrave(null), []);
  const finishOnboarding = useCallback(() => {
    setOnboarding(false);
    setEngrave(performance.now());
  }, []);

  const [sharing, setSharing] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const share = async () => {
    if (sharing) return;
    setSharing(true);
    setStageNote(null);
    const note = await shareBadge(doc).catch(() => null);
    setShareFailed(note === null);
    setSharing(false);
    setStageNote(note === null ? "Det gick inte att dela just nu. Försök igen." : note || null);
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
  const moved = Boolean(doc.textOffsetMm || doc.logo?.offsetMm);
  /** Ritningen visar platshållare för tomma rader — loggan ska inte heller hamna över dem. */
  const logoOverlapsText = useMemo(
    () => Boolean(doc.logo) && layoutBadge(withPlaceholders(doc).doc, fonts).logoOverlapsText,
    [doc, fonts],
  );

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
                title="Se lasern gravera fram skylten"
                disabled={recording || engrave !== null}
                onClick={() => {
                  setPhoto(false);
                  setEngrave(performance.now());
                }}
              >
                <svg className={styles.chipIcon} viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3v7M9 7l3 3 3-3" />
                  <path d="M4 20h16M7 16.5l1.5-1.5M17 16.5 15.5 15M12 17v-2" />
                </svg>
                Gravera
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
              <button
                type="button"
                className={`chip ${styles.stageChip}`}
                title="Dela skylten som bild och länk"
                disabled={sharing}
                onClick={() => void share()}
              >
                <svg className={styles.chipIcon} viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 15V3M7.5 7.5 12 3l4.5 4.5" />
                  <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
                </svg>
                {sharing ? "Skapar bild…" : "Dela"}
              </button>
            </div>
          )}
          {view === "drawing" && moved && (
            <div className={styles.stageActions}>
              <button type="button" className={`chip ${styles.stageChip}`} onClick={() => update({ type: "move/reset" })}>
                Återställ placering
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
                engrave={engrave}
                onEngraveDone={endEngrave}
                photo={photo}
                photoSamples={PHOTO_SAMPLES}
                onPhotoProgress={setPhotoSamples}
                recorderRef={recorderRef}
              />
            ) : view === "drawing" ? (
              <div className={styles.drawing}>
                <BadgeEditor doc={doc} fonts={fonts} dispatch={update} />
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
          {view === "3d" && recording ? (
            <p className={styles.hint}>Rör inte skylten medan filmen spelas in</p>
          ) : view === "3d" && stageNote ? (
            <p className={styles.hint} role="status">
              {stageNote}
            </p>
          ) : view === "3d" && photo ? (
            <p className={styles.hint}>Fotoläge · dra för att vrida, ljuset räknas om</p>
          ) : view === "drawing" ? (
            <p className={styles.hint} data-severity={logoOverlapsText ? "warning" : undefined} role="status">
              {logoOverlapsText
                ? "Loggan ligger över texten — dra isär dem så att båda syns i gravyren."
                : `Dra texten eller loggan. Streckad linje = säkerhetsmarginal, ${layout.contentInsetMm.toLocaleString("sv-SE")} mm.`}
            </p>
          ) : view === "3d" && logoOverlapsText ? (
            <p className={styles.hint} data-severity="warning" role="status">
              Loggan ligger över texten — flytta isär dem under Ritning.
            </p>
          ) : (
            view === "3d" && (
              <p className={styles.hint}>
                Dra för att vrida skylten ·{" "}
                <button type="button" className={styles.hintLink} onClick={() => setView("drawing")}>
                  Flytta text och logga
                </button>
              </p>
            )
          )}
        </footer>
        {view === "3d" && (
          <>
            <ProgressBanner
              variant="floating"
              active={recording}
              failed={videoFailed}
              title="3D-film"
              timed
              expectedMs={VIDEO_SECONDS * 1000}
              steps={VIDEO_STEPS}
              doneLabel="Filmen är nedladdad"
            />
            <ProgressBanner
              variant="floating"
              active={sharing}
              failed={shareFailed}
              title="Dela skylten"
              expectedMs={SHARE_EXPECTED_MS}
              steps={SHARE_STEPS}
              doneLabel="Klart att dela"
            />
            <ProgressBanner
              variant="floating"
              active={photo && photoSamples < PHOTO_SAMPLES}
              failed={!photo}
              title="Fotoläge"
              expectedMs={PHOTO_EXPECTED_MS}
              value={photoSamples / PHOTO_SAMPLES}
              steps={PHOTO_STEPS}
              doneLabel="Strålspårad — klar för skärmdump"
            />
          </>
        )}
      </section>

      <aside className={styles.panel} aria-label="Skyltmotor">
        <div className={styles.panelScroll}>
          <div className={styles.panelHead}>
            <p className="eyebrow">Skyltmotor</p>
            <h1 className={styles.panelTitle}>Din namnskylt</h1>
          </div>
          <TextSection
            doc={doc}
            layout={layout}
            dispatch={update}
            onPlace={() => setView("drawing")}
            placing={view === "drawing"}
          />
          <LogoSection doc={doc} dispatch={update} onWorkplace={visualize.setWorkplace} />
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
      {onboarding && <OnboardingDialog doc={doc} dispatch={update} onClose={finishOnboarding} />}
    </div>
  );
}
