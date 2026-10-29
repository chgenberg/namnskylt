"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { BadgePreview } from "@/components/badge-preview";
import { createBadgeDocument, getColor, getMaterial, parseSmartInput, type FontId } from "@/engine";
import type { SpinFocus } from "@/features/designer/badge-3d";
import type { BadgeRecorder } from "@/features/designer/three/recorder";
import { useFontEngine } from "@/hooks/use-font-engine";
import { EXAMPLES, INPUT_ANCHOR, useTypewriter } from "./smart-input";
import styles from "./home-hero.module.css";

const Badge3D = dynamic(() => import("@/features/designer/badge-3d"), {
  ssr: false,
  loading: () => null,
});

const HERO_CAMERA_Z = 3.3;
/** Smal skärm: kameran längre bort så att hela skylten ryms i bredd. */
const NARROW_CAMERA_Z = 5.4;
const NARROW_QUERY = "(max-width: 640px)";
const HERO_VIEW: SpinFocus["side"] = "hero";
const noop = () => {};

function useNarrow(): boolean | null {
  const [narrow, setNarrow] = useState<boolean | null>(null);
  useEffect(() => {
    const media = window.matchMedia(NARROW_QUERY);
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return narrow;
}

interface HomeHeroProps {
  /** Skyltmotorns adress — en butik skickar kunden till sin egen. */
  createPath?: string;
  /** Rad ovanför rubriken, t.ex. butikens namn. */
  eyebrow?: string;
  /** Knapp, kursiv och fokusram i butikens färg i stället för bläck. */
  branded?: boolean;
  /** Gravyrtypsnittet som liknar butikens sajt mest. */
  badgeFont?: FontId;
}

export function HomeHero({ createPath = "/skapa", eyebrow, branded = false, badgeFont }: HomeHeroProps) {
  const router = useRouter();
  const fonts = useFontEngine();
  const narrow = useNarrow();
  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<BadgeRecorder | null>(null);
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [shake, setShake] = useState(0);
  const [canvasReady, setCanvasReady] = useState(false);
  const [focus, setFocus] = useState<SpinFocus | null>(null);
  const [example, setExample] = useState<string>(EXAMPLES[0] ?? "");

  const rows = useMemo(() => parseSmartInput(value), [value]);
  const placeholder = useTypewriter(value.length === 0);
  const typing = focused || value.length > 0;

  // Tom ruta: skylten graverar om först när ett exempel är färdigskrivet, inte för varje tecken.
  useEffect(() => {
    if (EXAMPLES.includes(placeholder)) setExample(placeholder);
  }, [placeholder]);
  const exampleRows = useMemo(() => parseSmartInput(example), [example]);
  const doc = useMemo(() => {
    const base = createBadgeDocument(rows.length > 0 ? rows : exampleRows);
    return badgeFont ? { ...base, font: badgeFont } : base;
  }, [rows, exampleRows, badgeFont]);
  const material = getMaterial(doc.materialId);
  const color = getColor(doc.materialId, doc.colorId);

  useEffect(() => {
    router.prefetch(createPath);
  }, [router, createPath]);

  // Tillbaka till samma vinkel när man börjar skriva, även om man vridit skylten.
  useEffect(() => {
    setFocus((f) => ({ side: HERO_VIEW, key: (f?.key ?? 0) + 1 }));
  }, [typing, canvasReady]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (rows.length === 0) {
      setShake((n) => n + 1);
      inputRef.current?.focus();
      return;
    }
    router.push(`${createPath}?${new URLSearchParams({ t: rows.join("|") })}`);
  }

  return (
    <section id={INPUT_ANCHOR} className={styles.hero} data-branded={branded || undefined}>
      <figure className={styles.figure}>
        <div className={styles.stage} aria-hidden="true">
          {!canvasReady && <BadgePreview doc={doc} className={styles.flat} />}
          <div className={styles.canvas}>
            {narrow !== null && (
              <Badge3D
                key={narrow ? "narrow" : "wide"}
                doc={doc}
                fonts={fonts}
                spinning
                resumeAfterDragMs={0}
                focus={focus}
                engrave={null}
                onEngraveDone={noop}
                photo={false}
                photoSamples={0}
                onPhotoProgress={noop}
                recorderRef={recorderRef}
                cameraZ={narrow ? NARROW_CAMERA_Z : HERO_CAMERA_Z}
                onReady={() => setCanvasReady(true)}
              />
            )}
          </div>
        </div>
        <div className={styles.dimension} aria-hidden="true">
          <span className={styles.dimLine} />
          <span className={styles.dimLabel}>
            {doc.size.widthMm} × {doc.size.heightMm} mm
          </span>
          <span className={styles.dimLine} />
        </div>
        <figcaption className={styles.caption}>
          <span className={styles.figNo}>Fig. 1</span>
          {material.name}, {color.name.toLowerCase()} — graverad i Sverige
        </figcaption>
      </figure>

      <div className={styles.copy}>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1 className={styles.title}>
          Skriv ditt namn. <em>Vi graverar resten.</em>
        </h1>

        <form className={styles.form} onSubmit={handleSubmit} role="search">
          <motion.div
            key={shake}
            className={styles.field}
            data-active={typing}
            animate={shake ? { x: [0, -8, 8, -5, 5, 0] } : undefined}
            transition={{ duration: 0.4 }}
          >
            <label htmlFor="badge-text" className="visually-hidden">
              Text på namnskylten
            </label>
            <input
              ref={inputRef}
              id="badge-text"
              className={styles.input}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={placeholder}
              autoComplete="off"
              spellCheck={false}
              maxLength={120}
            />
            <button type="submit" className={styles.primary}>
              Skapa skylt
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path
                  d="M3 8h10M9 4l4 4-4 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </motion.div>

          <div className={styles.below}>
            <AnimatePresence initial={false} mode="wait">
              {focused ? (
                <motion.p
                  key="hint"
                  className={styles.hint}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  Separera rader med komma — <kbd>Enter</kbd> öppnar skyltmotorn
                </motion.p>
              ) : (
                <motion.a
                  key="how"
                  href="#sa-funkar-det"
                  className={styles.secondary}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  Så funkar det
                </motion.a>
              )}
            </AnimatePresence>
          </div>
        </form>
      </div>

      <footer className={styles.margins} aria-hidden="true">
        <span>Graverade namnskyltar</span>
        <span>Korrektur innan gravyr</span>
        <span>Tillverkade i Sverige</span>
      </footer>
    </section>
  );
}
