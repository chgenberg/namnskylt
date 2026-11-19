"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { approxFonts, type BadgeDocument, type FontEngine } from "@/engine";
import type { QuoteShot } from "@/lib/quotes/model";
import type { BadgeRecorder, VideoClip } from "../three/recorder";

const Badge3D = dynamic(() => import("../badge-3d"), { ssr: false, loading: () => null });

/** Den stora bildens vinkel: tre kvart, som skyltmotorns stillbild. */
const MAIN_YAW = -0.42;
/**
 * De små bildernas vinklar, i den ordning de står på offerten: rakt framifrån, från andra
 * sidan och baksidan med fästet. Bildtexterna står i `ANGLE_LABELS` i offertens dokument.
 */
const ANGLE_YAWS = [0, 0.62, Math.PI - 0.42];
const MAIN_WIDTH_PX = 1200;
const ANGLE_WIDTH_PX = 640;
/** Scenen behöver en stund för ljusmiljön första gången, och kortare för nästa skylt. */
const FIRST_SETTLE_MS = 1_800;
const NEXT_SETTLE_MS = 900;
const READY_POLL_MS = 150;
/** Kommer 3D-vyn inte igång på den här tiden ritas designen som ritning i stället. */
const GIVE_UP_MS = 12_000;
/** Kameran går så nära som skylten ryms, så att skylten fyller bilden. Avståndet är det närmaste den får stå. */
const NEAR_CAMERA_Z = 3;
const noop = () => {};

/** Filmen är ett varv runt skylten, som knappen Video i skyltmotorn. */
const FILM_SECONDS = 6;
/** Lägre än skyltmotorns egen film: de här ska mejlas, och blir då cirka 3 MB var. */
const FILM_BITS_PER_SECOND = 4_000_000;

/** En design som ska fotograferas eller filmas: skylten som visar den, och nyckeln resultatet sparas under. */
export interface ShotJob {
  key: string;
  doc: BadgeDocument;
  /** `shot` = bilderna till dokumentet. `film` = 3D-filmen som laddas ner med offerten. */
  kind: "shot" | "film";
}

interface QuoteShotsProps {
  /** Det som återstår att ta. Det första tas nu, och försvinner ur listan när det är klart. */
  jobs: readonly ShotJob[];
  fonts: FontEngine;
  /** Bilderna av en design, eller `null` när 3D-vyn inte gick att använda. */
  onShot: (key: string, shot: QuoteShot | null) => void;
  /** Filmen av en design, eller `null` när webbläsaren inte kan spela in. */
  onFilm: (key: string, film: VideoClip | null) => void;
}

/**
 * Tar offertens bilder ur 3D-vyn: en stor och tre små ur andra vinklar per design (beslut av
 * ägaren 2026-11-19). Skyltarna ritas en i taget i en osynlig vy, samma som i skyltmotorn, så
 * ingen tjänst kostar något. En PDF kan inte visa en vridbar 3D-skylt annat än i Adobe
 * Acrobat på dator, därav bilderna.
 *
 * Samma vy spelar in en 3D-film per design, ett varv runt skylten, som laddas ner tillsammans
 * med PDF:en så att säljaren kan bifoga filmerna i sitt mejl (besked av ägaren samma dag).
 */
export function QuoteShots({ jobs, fonts, onShot, onFilm }: QuoteShotsProps) {
  const recorderRef = useRef<BadgeRecorder | null>(null);
  const first = useRef(true);
  const current = jobs[0];
  const fontsReady = fonts !== approxFonts;
  const key = current?.key;
  const kind = current?.kind;

  useEffect(() => {
    if (!key || !kind || !fontsReady) return;
    const done = (shot: QuoteShot | null, film: VideoClip | null) => (kind === "film" ? onFilm(key, film) : onShot(key, shot));
    let cancelled = false;
    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    (async () => {
      const started = performance.now();
      while (!cancelled && !recorderRef.current && performance.now() - started < GIVE_UP_MS) await wait(READY_POLL_MS);
      if (cancelled) return;
      if (!recorderRef.current) return done(null, null);
      await wait(first.current ? FIRST_SETTLE_MS : NEXT_SETTLE_MS);
      if (cancelled) return;
      first.current = false;
      // Läses nu och inte före väntan: inspelaren byts ut när skylten har kommit på plats i scenen.
      const recorder = recorderRef.current;
      if (!recorder) return done(null, null);
      if (kind === "film") {
        const film = await recorder.recordTurn(FILM_SECONDS, FILM_BITS_PER_SECOND).catch(() => null);
        if (!cancelled) onFilm(key, film);
        return;
      }
      const main = recorder.stillAt(MAIN_YAW, MAIN_WIDTH_PX);
      const angles = ANGLE_YAWS.map((yaw) => recorder.stillAt(yaw, ANGLE_WIDTH_PX)).filter((image): image is string => image !== null);
      onShot(key, main ? { main, angles } : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [key, kind, fontsReady, onShot, onFilm]);

  if (!current) return null;
  return (
    <div aria-hidden="true" style={{ position: "fixed", left: 0, top: 0, width: 1200, height: 750, opacity: 0, pointerEvents: "none", zIndex: -1 }}>
      <Badge3D
        doc={current.doc}
        fonts={fonts}
        spinning={false}
        focus={null}
        engrave={null}
        onEngraveDone={noop}
        photo={false}
        photoSamples={0}
        onPhotoProgress={noop}
        recorderRef={recorderRef}
        cameraZ={NEAR_CAMERA_Z}
        fit
      />
    </div>
  );
}
