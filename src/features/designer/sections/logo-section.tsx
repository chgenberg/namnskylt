"use client";

import { useMemo, useRef, useState, type CSSProperties, type Dispatch, type FormEvent } from "react";
import { PanelSection } from "@/components/ui/panel-section";
import { ProgressBanner } from "@/components/ui/progress-banner";
import { Segmented } from "@/components/ui/segmented";
import {
  LOGO_LIMITS,
  logoHeightLimits,
  LOGO_PLACEMENTS,
  engravingHex,
  getColor,
  getFont,
  logoEngravingPath,
  logoMarking,
  logoPrintInkOf,
  nameMarking,
  printsInOneColor,
  type BadgeDocument,
  type LogoPlacement,
} from "@/engine";
import { logoColorCombo } from "@/lib/brand/match";
import { requestBrand, type BrandProfile } from "../logo/brand-api";
import { storeLogoImage } from "../logo/store-image";
import { FETCHED_LOGO_NAME, dataUrlFile, storeLogoOriginal } from "../logo/store-original";
import { traceImage, type LogoTrace } from "../logo/trace-image";
import { useLogoEngraving } from "../logo/use-logo-engraving";
import type { DesignerAction } from "../state";
import { LogoColors } from "./logo-colors";
import { PRINT_COLOR_NOTE, TextColorField } from "./print-color-field";
import styles from "./sections.module.css";

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp,image/svg+xml,image/gif";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Breda loggor (ordbilder) passar bäst ovanför texten, och då lägre. */
const WIDE_LOGO_ASPECT = 2.6;
const TOP_LOGO_HEIGHT_MM = 7;

const SCRAPE_EXPECTED_MS = 16_000;
const SCRAPE_STEPS = [
  [0, "Öppnar er hemsida…"],
  [14, "Letar upp loggan…"],
  [38, "Mäter typsnittet…"],
  [58, "Läser av branschen…"],
  [82, "Lägger loggan på skylten…"],
] as const;
const UPLOAD_EXPECTED_MS = 1_500;
const UPLOAD_STEPS = [
  [0, "Läser bilden…"],
  [35, "Lägger loggan på skylten…"],
] as const;

type Job = "scrape" | "upload";

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

type Status =
  | { kind: "idle" }
  | { kind: "working"; job: Job }
  | { kind: "error"; message: string };

interface LogoSectionProps {
  doc: BadgeDocument;
  dispatch: Dispatch<DesignerAction>;
  /** Företagets miljö till "Din skylt på en person". */
  onWorkplace: (workplace: string) => void;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error()));
    reader.onerror = () => reject(new Error("Filen gick inte att läsa"));
    reader.readAsDataURL(file);
  });
}

export function LogoSection({ doc, dispatch, onWorkplace }: LogoSectionProps) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [source, setSource] = useState<{ src: string; invert: boolean } | null>(null);
  const [job, setJob] = useState<Job>("scrape");
  const abortRef = useRef<AbortController | null>(null);
  const originRef = useRef<LogoOrigin | null>(null);
  const color = getColor(doc.materialId, doc.colorId);
  const working = status.kind === "working";

  const start = (next: Job) => {
    setJob(next);
    setStatus({ kind: "working", job: next });
  };

  const cancelScrape = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus({ kind: "error", message: "Hämtningen avbröts." });
  };

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
   * utan den är `src` en bild som hämtats från hemsidan. Filen sparas på
   * servern i bakgrunden, så att verkstaden kan få originalet.
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
    if (!known) {
      const original = file ?? dataUrlFile(src);
      if (original) {
        void storeLogoOriginal(original, file?.name ?? FETCHED_LOGO_NAME).then((originalId) => {
          if (!originalId) return;
          origin.originalId = originalId;
          // Bara om loggan ur den här filen fortfarande är den som ligger på skylten.
          if (originRef.current === origin) dispatch({ type: "logo/original", d: origin.d, originalId });
        });
      }
    }
    return trace;
  };

  const fetchBrand = async (event: FormEvent) => {
    event.preventDefault();
    if (!url.trim() || working) return;
    const controller = new AbortController();
    abortRef.current = controller;
    start("scrape");
    try {
      const found = await requestBrand(url.trim(), controller.signal);
      if (controller.signal.aborted) return;
      setProfile(found);
      const trace = found.logo ? await adoptImage(found.logo).catch(() => null) : null;
      dispatch({ type: "font", font: found.font.fontId });
      // Samma regel som raden under loggans avlästa färger, så att det som väljs här står som valt där.
      // En ny logga i färg printas, och ska synas mot ytan.
      const colorId = logoColorCombo({
        materialId: doc.materialId,
        logoColors: trace?.colors ?? [],
        siteColors: found.colors,
        printedInColor: Boolean(trace?.image),
        neutralSite: true,
      });
      if (colorId) dispatch({ type: "color", colorId });
      if (found.company?.workplace) onWorkplace(found.company.workplace);
      setStatus(
        trace
          ? { kind: "idle" }
          : { kind: "error", message: "Vi hittade ingen logga på sidan — ladda gärna upp den själv." },
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Något gick fel." });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setStatus({ kind: "error", message: "Bilden är för stor — max 8 MB." });
      return;
    }
    start("upload");
    try {
      const trace = await adoptImage(await readFile(file), false, file);
      setStatus(trace ? { kind: "idle" } : { kind: "error", message: "Vi hittade ingen logga i bilden." });
    } catch {
      setStatus({ kind: "error", message: "Bilden gick inte att läsa. Prova PNG, JPG eller SVG." });
    }
  };

  const pickOption = async (option: string) => {
    if (working || source?.src === option) return;
    start("upload");
    const trace = await adoptImage(option).catch(() => null);
    setStatus(trace ? { kind: "idle" } : { kind: "error", message: "Den loggan gick inte att använda — prova en annan." });
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
    <PanelSection
      step={3}
      title="Logga & varumärke"
      aside={doc.logo ? LOGO_ASIDE[logoLook] : "Valfritt"}
    >
      <p className={styles.batchLead}>
        Skriv in er hemsida, så hämtar vi loggan och väljer typsnitt och färg som liknar er.
      </p>
      <form className={styles.brandForm} onSubmit={fetchBrand}>
        <label className="field">
          <input
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="foretaget.se"
            aria-label="Företagets hemsida"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={working || url.trim().length < 4}>
          Hämta
        </button>
      </form>

      <ProgressBanner
        active={working}
        failed={status.kind === "error"}
        title={job === "scrape" ? "Hämtar från hemsidan" : "Läser in loggan"}
        expectedMs={job === "scrape" ? SCRAPE_EXPECTED_MS : UPLOAD_EXPECTED_MS}
        steps={job === "scrape" ? SCRAPE_STEPS : UPLOAD_STEPS}
        doneLabel={job === "scrape" ? "Klart — loggan, typsnittet och färgen är på plats" : "Klart — loggan är på plats"}
        onCancel={job === "scrape" ? cancelScrape : undefined}
      />
      {status.kind === "error" && (
        <p className={styles.issue} role="status" data-severity="error">
          {status.message}
        </p>
      )}

      {profile && status.kind !== "working" && (
        <dl className={styles.brandSummary}>
          <div>
            <dt>Företag</dt>
            <dd>{profile.siteName}</dd>
          </div>
          <div>
            <dt>Typsnitt</dt>
            <dd>
              {profile.font.sourceFamily ? `${profile.font.sourceFamily} → ` : ""}
              {getFont(profile.font.fontId).name}
            </dd>
          </div>
          {/* Hemsidans egna färger, med kod. Vad loggans färg ledde till står under loggan, vid Avlästa färger. */}
          {profile.colors.length > 0 && (
            <div>
              <dt>Hemsidan</dt>
              <dd className={styles.brandColors}>
                {profile.colors.slice(0, 3).map((hex) => (
                  <span key={hex} className={styles.brandCode}>
                    <span className={styles.brandColor} style={{ "--swatch": hex } as CSSProperties} aria-hidden="true" />
                    {hex.toUpperCase()}
                  </span>
                ))}
              </dd>
            </div>
          )}
          {profile.company && (
            <div>
              <dt>Bransch</dt>
              <dd>{profile.company.industry}</dd>
            </div>
          )}
        </dl>
      )}

      {profile && profile.logoOptions.length > 1 && status.kind !== "working" && (
        <div className={styles.logoOptions} role="group" aria-label="Loggor från hemsidan">
          <span className={styles.logoOptionsLabel}>Fel logga? Välj en annan från sidan</span>
          <div className={styles.logoOptionRow}>
            {profile.logoOptions.map((option, i) => (
              <button
                key={option.slice(-48)}
                type="button"
                className={styles.logoOption}
                aria-pressed={source?.src === option}
                aria-label={`Logga ${i + 1}`}
                onClick={() => void pickOption(option)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- data-URL från skrapningen */}
                <img src={option} alt="" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.chips}>
        <label className="chip" aria-disabled={working}>
          {doc.logo ? "Ladda upp egen logga" : "Ladda upp logga"}
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
        {/* Invertera vänder bläck och botten, och gäller allt utom en logga som printas i sina egna färger. */}
        {doc.logo && logoLook !== "print-color" && source && (
          <button type="button" className="chip" aria-pressed={source.invert} disabled={working} onClick={() => void invert()}>
            Invertera
          </button>
        )}
        {doc.logo && (
          <button type="button" className="chip" onClick={remove}>
            Ta bort
          </button>
        )}
      </div>

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
          {doc.logo.colors && doc.logo.colors.length > 0 && (
            <LogoColors
              doc={doc}
              colors={doc.logo.colors}
              siteColors={profile?.colors}
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
