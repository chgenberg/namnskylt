"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toUploadJpeg } from "./image-utils";
import styles from "./visualize.module.css";

type Facing = "user" | "environment";

const COUNTDOWN_S = 3;

interface CameraCaptureProps {
  onCapture: (photo: Blob) => void;
  onCancel: () => void;
}

function cameraError(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Kameran är blockerad. Tillåt kameran i webbläsaren eller ladda upp ett foto i stället.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "Hittade ingen kamera. Ladda upp ett foto i stället.";
  }
  return "Kameran kunde inte startas. Ladda upp ett foto i stället.";
}

export function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<Facing>("user");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setReady(false);
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      })
      .then((media) => {
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        const video = videoRef.current;
        if (video) video.srcObject = media;
      })
      .catch((err: unknown) => setError(cameraError(err)));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [facing]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      const timer = window.setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => window.clearTimeout(timer);
    }
    const video = videoRef.current;
    setCountdown(null);
    if (!video) return;
    toUploadJpeg(video, video.videoWidth, video.videoHeight)
      .then(onCapture)
      .catch((err: unknown) => setError(cameraError(err)));
  }, [countdown, onCapture]);

  if (error) {
    return (
      <div className={styles.cameraError} role="alert">
        <p>{error}</p>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Tillbaka
        </button>
      </div>
    );
  }

  return (
    <div className={styles.camera}>
      <video
        ref={videoRef}
        className={styles.cameraVideo}
        data-mirrored={facing === "user"}
        autoPlay
        playsInline
        muted
        onLoadedData={() => setReady(true)}
      />
      <svg className={styles.silhouette} viewBox="0 0 200 300" aria-hidden="true">
        <circle cx="100" cy="70" r="34" />
        <path d="M30 300 C30 190 50 130 100 130 C150 130 170 190 170 300" />
        <rect x="112" y="172" width="34" height="13" rx="2" className={styles.silhouetteBadge} />
      </svg>
      <p className={styles.cameraHint}>Ställ dig så att du syns från huvudet ner till midjan</p>

      <AnimatePresence>
        {countdown !== null && countdown > 0 && (
          <motion.span
            key={countdown}
            className={`mono ${styles.countdown}`}
            initial={{ opacity: 0, scale: 1.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            aria-live="assertive"
          >
            {countdown}
          </motion.span>
        )}
      </AnimatePresence>

      <div className={styles.cameraBar}>
        <button type="button" className={`chip ${styles.cameraChip}`} onClick={onCancel}>
          Avbryt
        </button>
        <button
          type="button"
          className={styles.shutter}
          aria-label="Ta foto"
          disabled={!ready || countdown !== null}
          onClick={() => setCountdown(COUNTDOWN_S)}
        />
        <button
          type="button"
          className={`chip ${styles.cameraChip}`}
          onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
        >
          Vänd
        </button>
      </div>
    </div>
  );
}
