"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, type RefObject } from "react";
import { Color, type Group } from "three";

/** Ett pågående inspelningsvarv; `BadgeMesh` läser det och vrider skylten. */
export interface RecordingTurn {
  startY: number;
  startMs: number;
  durationMs: number;
}

export interface VideoClip {
  blob: Blob;
  extension: "mp4" | "webm";
}

export interface BadgeRecorder {
  /** Ett varv runt skylten som videoklipp; `null` om webbläsaren inte kan spela in. */
  recordTurn: (seconds: number) => Promise<VideoClip | null>;
}

const FPS = 30;
const VIDEO_BITS_PER_SECOND = 8_000_000;
/** Några bildrutor efter sista vinkeln så att klippet inte klipps mitt i rörelsen. */
const TAIL_MS = 150;
const MIME_TYPES = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];

/** Mjuk start och landning, som en kamera på ett vridbord. */
export function easeInOut(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

/** Vinkeln i ett inspelningsvarv vid tiden `nowMs`, eller `null` när varvet är klart. */
export function turnAngle(turn: RecordingTurn, nowMs: number): number | null {
  const k = (nowMs - turn.startMs) / turn.durationMs;
  if (k >= 1) return null;
  return turn.startY + easeInOut(Math.max(0, k)) * Math.PI * 2;
}

function supportedMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_TYPES.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? null;
}

/** Videon kan inte vara transparent — samma papperston som scenen står på. */
function paperColor(): Color {
  const css = getComputedStyle(document.documentElement).getPropertyValue("--color-paper").trim();
  return new Color(css || "white");
}

interface RecorderProps {
  apiRef: RefObject<BadgeRecorder | null>;
  turnRef: RefObject<RecordingTurn | null>;
  target: Group | null;
}

export function Recorder({ apiRef, turnRef, target }: RecorderProps) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    apiRef.current = {
      recordTurn: (seconds) => {
        const canvas = gl.domElement;
        const mime = supportedMime();
        if (!mime || !target || typeof canvas.captureStream !== "function") return Promise.resolve(null);

        const background = scene.background;
        scene.background = paperColor();
        const startY = Math.round(target.rotation.y / (Math.PI * 2)) * Math.PI * 2;
        target.rotation.y = startY;

        const stream = canvas.captureStream(FPS);
        const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: VIDEO_BITS_PER_SECOND });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };

        return new Promise((resolve) => {
          recorder.onstop = () => {
            turnRef.current = null;
            scene.background = background;
            stream.getTracks().forEach((track) => track.stop());
            resolve(
              chunks.length > 0
                ? { blob: new Blob(chunks, { type: mime.split(";")[0] }), extension: mime.includes("mp4") ? "mp4" : "webm" }
                : null,
            );
          };
          recorder.start(250);
          turnRef.current = { startY, startMs: performance.now(), durationMs: seconds * 1000 };
          const stopAfter = seconds * 1000 + TAIL_MS;
          window.setTimeout(() => recorder.state !== "inactive" && recorder.stop(), stopAfter);
        });
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, turnRef, gl, scene, target]);

  return null;
}
