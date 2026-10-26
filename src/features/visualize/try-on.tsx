"use client";

import { motion } from "motion/react";
import { useState, type ChangeEvent, type CSSProperties } from "react";
import { CameraCapture } from "./camera-capture";
import { GeneratingStatus } from "./generating-status";
import { fileToUploadJpeg } from "./image-utils";
import type { VisualizeState } from "./use-visualize";
import styles from "./visualize.module.css";

const STEPS = [
  [0, "Kontrollerar fotot…"],
  [5, "Hittar rätt plats på bröstet…"],
  [15, "Sätter skylten på plats…"],
  [35, "Matchar ljus och skuggor…"],
  [60, "Nästan klart…"],
] as const;

const PHOTO_RULES = ["En person i bild", "Halvkropp eller helkropp", "Bröstet syns — där sitter skylten"];

interface TryOnProps {
  state: VisualizeState;
}

export function TryOn({ state }: TryOnProps) {
  const { photo, setPhoto, tryOn, generateTryOn, isStale } = state;
  const [camera, setCamera] = useState(false);
  const [consent, setConsent] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [split, setSplit] = useState(50);

  const choosePhoto = (blob: Blob) => {
    setCamera(false);
    setReadError(null);
    setPhoto(blob);
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      choosePhoto(await fileToUploadJpeg(file));
    } catch {
      setReadError("Fotot kunde inte läsas. Prova en JPEG- eller PNG-bild.");
    }
  };

  if (camera) {
    return (
      <div className={styles.mode}>
        <CameraCapture onCapture={choosePhoto} onCancel={() => setCamera(false)} />
      </div>
    );
  }

  const sources = (
    <div className={styles.sources}>
      <button
        type="button"
        className={`btn ${photo ? "btn--ghost" : "btn--primary"}`}
        onClick={() => setCamera(true)}
      >
        Öppna kameran
      </button>
      <label className="btn btn--ghost">
        {photo ? "Byt foto" : "Ladda upp foto"}
        <input
          type="file"
          accept="image/*"
          className="visually-hidden"
          onChange={onFile}
        />
      </label>
    </div>
  );

  if (!photo) {
    return (
      <div className={styles.mode}>
        <header className={styles.modeHead}>
          <div>
            <h2 className={styles.modeTitle}>Prova skylten på dig själv</h2>
            <p className={styles.modeLead}>
              Ta ett foto eller ladda upp ett — vi sätter skylten på rätt plats på bröstet.
            </p>
          </div>
        </header>
        <ul className={styles.rules}>
          {PHOTO_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        {sources}
        {readError && (
          <p className={styles.error} role="alert">
            {readError}
          </p>
        )}
      </div>
    );
  }

  const working = tryOn.status === "working";
  const result = tryOn.status === "done" ? tryOn.result : null;

  return (
    <div className={styles.mode}>
      <div className={styles.tryOnLayout}>
        <div
          className={styles.photoFrame}
          data-working={working}
          style={{ "--split": `${split}%` } as CSSProperties}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- lokal blob-URL */}
          <img src={photo.url} alt="Ditt foto" className={styles.photoBase} />
          {result && (
            <motion.div
              className={styles.photoResult}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- data-URL från API:t */}
              <img src={result} alt="Ditt foto med namnskylten" />
            </motion.div>
          )}
          {result && (
            <>
              <span className={styles.splitLine} aria-hidden="true" />
              <input
                type="range"
                min={0}
                max={100}
                value={split}
                onChange={(event) => setSplit(Number(event.target.value))}
                className={styles.splitRange}
                aria-label="Jämför före och efter"
              />
              <span className={`chip ${styles.splitTag}`} data-side="before">Före</span>
              <span className={`chip ${styles.splitTag}`} data-side="after">Efter</span>
            </>
          )}
        </div>

        <div className={styles.tryOnSide}>
          <h2 className={styles.modeTitle}>{result ? "Så här ser den ut på dig" : "Ditt foto"}</h2>

          {!result && (
            <label className={styles.consent}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>
                Jag godkänner att fotot skickas till OpenAI för att skapa bilden. Vi sparar det inte.
              </span>
            </label>
          )}

          {isStale(tryOn) && (
            <p className={styles.notice}>Skylten har ändrats sedan bilden skapades.</p>
          )}
          {tryOn.status === "error" && (
            <p className={styles.error} role="alert">
              {tryOn.message}
            </p>
          )}
          {readError && (
            <p className={styles.error} role="alert">
              {readError}
            </p>
          )}

          {working ? (
            <GeneratingStatus startedAt={tryOn.startedAt} steps={STEPS} />
          ) : (
            <div className={styles.sources}>
              {result ? (
                <a className="btn btn--primary" href={result} download="min-namnskylt.jpg">
                  Ladda ner bilden
                </a>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={!consent}
                  onClick={generateTryOn}
                >
                  Sätt på skylten
                </button>
              )}
              {isStale(tryOn) && (
                <button type="button" className="btn btn--ghost" onClick={generateTryOn}>
                  Skapa igen
                </button>
              )}
            </div>
          )}
          {!working && sources}
        </div>
      </div>
    </div>
  );
}
