"use client";

import { useMemo, useRef, useState, type CSSProperties, type Dispatch, type DragEvent } from "react";
import { PanelSection } from "@/components/ui/panel-section";
import { ProgressBanner } from "@/components/ui/progress-banner";
import { Segmented } from "@/components/ui/segmented";
import {
  LOGO_LIMITS,
  logoHeightLimits,
  LOGO_PLACEMENTS,
  engravingHex,
  getColor,
  logoEngravingPath,
  logoMarking,
  logoPrintInkOf,
  printColorOf,
  nameMarking,
  printsInOneColor,
  type BadgeDocument,
  type LogoPlacement,
} from "@/engine";
import { storeLogoImage } from "../logo/store-image";
import { storeLogoOriginal } from "../logo/store-original";
import { traceImage, type LogoTrace } from "../logo/trace-image";
import { useLogoEngraving } from "../logo/use-logo-engraving";
import { panelStep } from "../panel-steps";
import type { DesignerAction } from "../state";
import { useBadgeFixes } from "../badge-fixes";
import { FixAction } from "../fix-action";
import { LogoColors } from "./logo-colors";
import { PRINT_COLOR_NOTE, TextColorField } from "./print-color-field";
import styles from "./sections.module.css";

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp,image/svg+xml,image/gif";
const ACCEPTED = new Set(ACCEPTED_TYPES.split(","));
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Breda loggor (ordbilder) passar bäst ovanför texten, och då lägre. */
const WIDE_LOGO_ASPECT = 2.6;
const TOP_LOGO_HEIGHT_MM = 7;

const UPLOAD_EXPECTED_MS = 1_500;
const UPLOAD_STEPS = [
  [0, "Läser bilden…"],
  [35, "Lägger loggan på skylten…"],
] as const;

/**
 * Hur loggan hamnar på skylten: graverad, graverad ur en logga i färg (då görs
 * färgerna om till en gravyrform), printad i en färg eller printad i filens färger.
 */
type LogoLook = "engrave" | "engrave-color" | "print" | "print-color";
const LOGO_ASIDE: Record<LogoLook, string> = {
  engrave: "Graveras",
  "engrave-color": "Graveras",
  print: "Printas",
  "print-color": "Printas i färg",
};
const LOGO_HINT: Record<LogoLook, string> = {
  engrave: "Loggan graveras i en färg, samma som texten.",
  "engrave-color":
    "Loggan är i färg och graveras i en färg, samma som texten: färgerna blir gravyr, och vitt och detaljer inuti loggan sparas ur. Stämmer formen inte, prova Invertera.",
  // Färgen är textfärgen när namnet också printas. Printas bara loggan väljs färgen här under.
  print: `Loggan printas i en färg. ${PRINT_COLOR_NOTE}`,
  "print-color": `Loggan är i färg och printas som den är i filen. ${PRINT_COLOR_NOTE}`,
};

/** Filen som loggan på skylten lästes från, och dess id på servern när den har sparats. */
interface LogoOrigin {
  src: string;
  /** Loggans banor just nu; "Invertera" ger nya banor ur samma fil. */
  d: string;
  originalId: string | null;
}

type Status = { kind: "idle" } | { kind: "working" } | { kind: "error"; message: string };

interface LogoSectionProps {
  doc: BadgeDocument;
  dispatch: Dispatch<DesignerAction>;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error()));
    reader.onerror = () => reject(new Error("Filen gick inte att läsa"));
    reader.readAsDataURL(file);
  });
}

/**
 * Loggan på skylten. Kunden laddar upp sin logga eller en bild: filen dras till
 * rutan eller väljs med ett klick (besked av ägaren 2026-11-20: hämtningen från en
 * hemsida togs bort helt, "istället bara behålla ladda upp logo/bild på ett snyggt
 * sätt"). Förut gick loggan också att hämta från företagets hemsida.
 */
export function LogoSection({ doc, dispatch }: LogoSectionProps) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [source, setSource] = useState<{ src: string; invert: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const originRef = useRef<LogoOrigin | null>(null);
  const color = getColor(doc.materialId, doc.colorId);
  const working = status.kind === "working";
  const fixes = useBadgeFixes();

  // En logga i färg som sparades innan gravyrformen fanns får den i efterhand, när den graveras.
  useLogoEngraving(doc, dispatch);

  const applyTrace = (trace: LogoTrace, placement: LogoPlacement | undefined, originalId: string | null, sameLogo: boolean) => {
    const wide = trace.viewWidth / trace.viewHeight > WIDE_LOGO_ASPECT;
    const nextPlacement = placement ?? (wide ? "top" : "left");
    dispatch({
      type: "logo",
      logo: {
        d: trace.d,
        viewWidth: trace.viewWidth,
        viewHeight: trace.viewHeight,
        placement: nextPlacement,
        heightMm: doc.logo?.heightMm ?? (nextPlacement === "top" ? TOP_LOGO_HEIGHT_MM : LOGO_LIMITS.defaultHeightMm),
        ...(trace.image && { image: trace.image }),
        ...(trace.engraveD && { engraveD: trace.engraveD }),
        // Loggans färger följer med skylten, så att kunden ser vad som lästes av och kan rätta det.
        ...(trace.colors.length > 0 && { colors: trace.colors }),
        // En ny logga ärver aldrig den förra loggans originalfil.
        ...(originalId && { originalId }),
      },
      // Samma fil i en ny form ("Invertera") är ingen ny logga: metoden kunden har valt står kvar.
      keepMarking: sameLogo,
    });
  };

  /**
   * Läser en bild till loggan på skylten. `file` är filen kunden laddade upp;
   * utan den läses samma fil en gång till, i ny form ("Invertera"). Filen sparas
   * på servern i bakgrunden, så att verkstaden kan få originalet.
   */
  const adoptImage = async (src: string, invert = false, file?: File): Promise<LogoTrace | null> => {
    const read = await traceImage(src, invert);
    if (!read) return null;
    // En logga i färg sparas på servern, så att skylten bara bär bildens adress.
    const trace = read.image ? { ...read, image: await storeLogoImage(read.image) } : read;
    setSource({ src, invert });
    // Samma fil som förut ("Invertera"): originalet är redan sparat eller på väg.
    const known = originRef.current?.src === src ? originRef.current : null;
    const origin: LogoOrigin = known ?? { src, d: trace.d, originalId: null };
    origin.d = trace.d;
    originRef.current = origin;
    applyTrace(trace, doc.logo?.placement, origin.originalId, known !== null);
    if (!known && file) {
      void storeLogoOriginal(file, file.name).then((originalId) => {
        if (!originalId) return;
        origin.originalId = originalId;
        // Bara om loggan ur den här filen fortfarande är den som ligger på skylten.
        if (originRef.current === origin) dispatch({ type: "logo/original", d: origin.d, originalId });
      });
    }
    return trace;
  };

  const upload = async (file: File | undefined) => {
    if (!file || working) return;
    // En fil som dras till rutan har inte gått genom filväljarens filter.
    if (!ACCEPTED.has(file.type)) {
      setStatus({ kind: "error", message: "Filen är ingen bild vi kan läsa. Prova PNG, JPG eller SVG." });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setStatus({ kind: "error", message: "Bilden är för stor — max 8 MB." });
      return;
    }
    setStatus({ kind: "working" });
    try {
      const trace = await adoptImage(await readFile(file), false, file);
      setStatus(trace ? { kind: "idle" } : { kind: "error", message: "Vi hittade ingen logga i bilden." });
    } catch {
      setStatus({ kind: "error", message: "Bilden gick inte att läsa. Prova PNG, JPG eller SVG." });
    }
  };

  const drop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    void upload(event.dataTransfer.files[0]);
  };

  const invert = async () => {
    if (!source) return;
    const trace = await adoptImage(source.src, !source.invert).catch(() => null);
    if (!trace) setStatus({ kind: "error", message: "Inverterad blir loggan tom." });
  };

  const remove = () => {
    dispatch({ type: "logo", logo: null });
    setSource(null);
    originRef.current = null;
  };

  // Hur loggan hamnar på skylten följer märkningsmetoden: en logga i färg som graveras ritas ur sin gravyrform.
  const engraved = logoMarking(doc) === "engrave";
  const logoLook: LogoLook = engraved ? (doc.logo?.image ? "engrave-color" : "engrave") : doc.logo?.image ? "print-color" : "print";
  // Reglaget går upp till det som ryms på skylten och visar höjden loggan faktiskt ritas i.
  // Förut gick det till 40 mm, fast loggan slutade växa långt tidigare.
  const limits = useMemo(() => logoHeightLimits(doc), [doc]);
  const logoMax = Math.max(LOGO_LIMITS.minHeightMm, Math.floor((limits?.maxMm ?? LOGO_LIMITS.maxHeightMm) * 2) / 2);
  const heightRange = Math.max(0.5, logoMax - LOGO_LIMITS.minHeightMm);
  const logoHeight = Math.min(logoMax, Math.max(LOGO_LIMITS.minHeightMm, Math.round((limits?.drawnMm ?? LOGO_LIMITS.defaultHeightMm) * 2) / 2));

  return (
    <PanelSection step={panelStep("logo")} title="Logga" aside={doc.logo ? LOGO_ASIDE[logoLook] : "Valfritt"}>
      {/* Rutan tar emot en fil som dras dit, och öppnar filväljaren vid ett klick eller med tangentbordet. */}
      <label
        className={styles.logoDrop}
        data-dragging={dragging || undefined}
        data-filled={doc.logo ? true : undefined}
        aria-busy={working}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <span className={styles.logoDropIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 15.5V5M7.5 9.5 12 5l4.5 4.5" />
            <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
          </svg>
        </span>
        <span className={styles.logoDropText}>
          <span className={styles.logoDropTitle}>
            {working ? "Läser bilden…" : doc.logo ? "Byt logga eller bild" : "Ladda upp logga eller bild"}
          </span>
          <span className={styles.logoDropNote}>Dra hit filen eller klicka för att välja</span>
          <span className={styles.logoDropFormats}>PNG, JPG, SVG, WebP eller GIF · högst 8 MB</span>
        </span>
        <input
          type="file"
          accept={ACCEPTED_TYPES}
          className="visually-hidden"
          disabled={working}
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>

      <ProgressBanner
        active={working}
        failed={status.kind === "error"}
        title="Läser in loggan"
        expectedMs={UPLOAD_EXPECTED_MS}
        steps={UPLOAD_STEPS}
        doneLabel="Klart — loggan är på plats"
      />
      {status.kind === "error" && (
        <p className={styles.issue} role="status" data-severity="error">
          {status.message}
        </p>
      )}

      {doc.logo && (
        <>
          <div className={styles.logoPreview} style={{ background: color.surface }}>
            {doc.logo.image && logoLook === "print-color" ? (
              // eslint-disable-next-line @next/next/no-img-element -- data-URL från uppladdningen
              <img src={doc.logo.image.src} alt="Loggan som den printas" />
            ) : (
              <svg
                viewBox={`0 0 ${doc.logo.viewWidth} ${doc.logo.viewHeight}`}
                role="img"
                aria-label={engraved ? "Loggan som den graveras" : "Loggan som den printas"}
              >
                {/* En logga som printas i en färg visas i kundens färg, när koden går att rita. */}
                <path
                  d={engraved ? logoEngravingPath(doc.logo) : doc.logo.d}
                  fill={logoPrintInkOf(doc) ?? color.engraving}
                  fillRule="evenodd"
                />
              </svg>
            )}
          </div>
          <div className={styles.chips}>
            {/* Invertera vänder bläck och botten, och gäller allt utom en logga som printas i sina egna färger. */}
            {logoLook !== "print-color" && source && (
              <button type="button" className="chip" aria-pressed={source.invert} disabled={working} onClick={() => void invert()}>
                Invertera
              </button>
            )}
            <button type="button" className="chip" onClick={remove}>
              Ta bort loggan
            </button>
          </div>
          {fixes?.has("logo-contrast") && (
            <p className={styles.issue} role="status">
              Loggan syns dåligt mot skylten.
            </p>
          )}
          <FixAction target="logo-contrast" />
          {doc.logo.colors && doc.logo.colors.length > 0 && (
            <LogoColors
              doc={doc}
              colors={doc.logo.colors}
              readColors={doc.logo.readColors}
              onColors={(colors) => dispatch({ type: "logo/colors", colors })}
              onPickCombo={(colorId) => dispatch({ type: "color", colorId })}
            />
          )}
          <Segmented
            label="Placering"
            value={doc.logo.placement}
            options={LOGO_PLACEMENTS.map((p) => ({ id: p.id, label: p.name }))}
            onChange={(placement) => dispatch({ type: "logo/placement", placement })}
          />
          <label className={styles.sliderRow}>
            <span className={styles.sliderLabel}>Storlek</span>
            <input
              type="range"
              className="range"
              min={LOGO_LIMITS.minHeightMm}
              max={logoMax}
              step={0.5}
              value={logoHeight}
              disabled={logoMax <= LOGO_LIMITS.minHeightMm}
              style={{ "--range-fill": `${((logoHeight - LOGO_LIMITS.minHeightMm) / heightRange) * 100}%` } as CSSProperties}
              onChange={(e) => dispatch({ type: "logo/height", heightMm: Number(e.target.value) })}
            />
            <span className={`mono ${styles.sliderValue}`}>{logoHeight.toLocaleString("sv-SE")} mm</span>
          </label>
          <p className={styles.hint}>
            {LOGO_HINT[logoLook]} Storleken är loggans höjd, och den går också att ändra genom att dra i loggans hörn under
            Ritning. Metoden väljer du under Märkningsmetod.
          </p>
          {/* Printas bara loggan, i en färg, väljs färgen här. Printas namnet också står valet vid texten, som Textfärg. */}
          {nameMarking(doc) !== "print" && printsInOneColor(doc) && (
            <TextColorField
              label="Loggans färg"
              target="loggan"
              shown={logoPrintInkOf(doc) ?? engravingHex(getColor(doc.materialId, doc.colorId))}
              code={printColorOf(doc)}
              surface={getColor(doc.materialId, doc.colorId).surface}
              logoColors={[]}
              onChange={(next) => dispatch({ type: "print/color", color: next })}
            />
          )}
        </>
      )}
    </PanelSection>
  );
}
