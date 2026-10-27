"use client";

import { useRef, useState, type CSSProperties, type Dispatch, type FormEvent } from "react";
import { PanelSection } from "@/components/ui/panel-section";
import { ProgressBanner } from "@/components/ui/progress-banner";
import { Segmented } from "@/components/ui/segmented";
import {
  LOGO_LIMITS,
  LOGO_PLACEMENTS,
  getColor,
  getFont,
  type BadgeDocument,
  type LogoPlacement,
} from "@/engine";
import { matchColorCombo } from "@/lib/brand/match";
import { requestBrand, type BrandProfile } from "../logo/brand-api";
import { traceImage, type LogoTrace } from "../logo/trace-image";
import type { DesignerAction } from "../state";
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
  [82, "Gör loggan graverbar…"],
] as const;
const UPLOAD_EXPECTED_MS = 1_500;
const UPLOAD_STEPS = [
  [0, "Läser bilden…"],
  [35, "Gör loggan graverbar…"],
] as const;

type Job = "scrape" | "upload";

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

  const applyTrace = (trace: LogoTrace, placement?: LogoPlacement) => {
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
      },
    });
  };

  const adoptImage = async (src: string, invert = false): Promise<LogoTrace | null> => {
    const trace = await traceImage(src, invert);
    if (!trace) return null;
    setSource({ src, invert });
    applyTrace(trace, doc.logo?.placement);
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
      const colorId = matchColorCombo(
        [...(trace?.inkColor ? [trace.inkColor] : []), ...found.colors],
        doc.materialId,
      );
      if (colorId) dispatch({ type: "color", colorId });
      if (found.company?.workplace) onWorkplace(found.company.workplace);
      setStatus(
        trace
          ? { kind: "idle" }
          : { kind: "error", message: "Vi hittade ingen logga att gravera — ladda gärna upp den själv." },
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
      const trace = await adoptImage(await readFile(file));
      setStatus(trace ? { kind: "idle" } : { kind: "error", message: "Vi hittade ingen logga i bilden." });
    } catch {
      setStatus({ kind: "error", message: "Bilden gick inte att läsa. Prova PNG, JPG eller SVG." });
    }
  };

  const pickOption = async (option: string) => {
    if (working || source?.src === option) return;
    start("upload");
    const trace = await adoptImage(option).catch(() => null);
    setStatus(trace ? { kind: "idle" } : { kind: "error", message: "Den loggan gick inte att gravera — prova en annan." });
  };

  const invert = async () => {
    if (!source) return;
    const trace = await adoptImage(source.src, !source.invert).catch(() => null);
    if (!trace) setStatus({ kind: "error", message: "Inverterad blir loggan tom." });
  };

  const remove = () => {
    dispatch({ type: "logo", logo: null });
    setSource(null);
  };

  const heightRange = LOGO_LIMITS.maxHeightMm - LOGO_LIMITS.minHeightMm;
  const logoHeight = doc.logo?.heightMm ?? LOGO_LIMITS.defaultHeightMm;

  return (
    <PanelSection step={2} title="Logga & varumärke" aside={doc.logo ? "Graveras med texten" : "Valfritt"}>
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
        doneLabel={job === "scrape" ? "Klart — loggan, typsnittet och färgen är på plats" : "Klart — loggan är graverbar"}
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
          {profile.colors.length > 0 && (
            <div>
              <dt>Färger</dt>
              <dd className={styles.brandColors}>
                {profile.colors.slice(0, 4).map((hex) => (
                  <span key={hex} className={styles.brandColor} style={{ "--swatch": hex } as CSSProperties} title={hex} />
                ))}
                <span>→ {color.name}</span>
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
        {doc.logo && source && (
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
            <svg viewBox={`0 0 ${doc.logo.viewWidth} ${doc.logo.viewHeight}`} role="img" aria-label="Loggan som den graveras">
              <path d={doc.logo.d} fill={color.engraving} fillRule="evenodd" />
            </svg>
          </div>
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
              max={LOGO_LIMITS.maxHeightMm}
              step={0.5}
              value={logoHeight}
              style={{ "--range-fill": `${((logoHeight - LOGO_LIMITS.minHeightMm) / heightRange) * 100}%` } as CSSProperties}
              onChange={(e) => dispatch({ type: "logo/height", heightMm: Number(e.target.value) })}
            />
            <span className={`mono ${styles.sliderValue}`}>{logoHeight} mm</span>
          </label>
          <p className={styles.hint}>
            Loggan graveras i en färg, samma som texten. Får den inte plats krymps den till skylten.
          </p>
        </>
      )}
    </PanelSection>
  );
}
