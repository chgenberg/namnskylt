"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, type RefObject } from "react";
import { Color, type Group, type Object3D } from "three";
import { RASTER_ONLY } from "./path-tracer";

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
  /**
   * Ett varv runt skylten som videoklipp; `null` om webbläsaren inte kan spela in.
   * `bitsPerSecond` sänks för filmer som ska mejlas, så att filen blir mindre.
   */
  recordTurn: (seconds: number, bitsPerSecond?: number) => Promise<VideoClip | null>;
  /** Stillbild i tre kvarts vinkel med transparent bakgrund, som PNG-data-URL. */
  still: () => string | null;
  /**
   * Stillbild i en given vinkel kring skyltens lodräta axel (radianer, 0 = rakt framifrån,
   * π = baksidan), förminskad till `widthPx` och med transparent bakgrund. Till offertens
   * bilder ur flera vinklar.
   */
  stillAt: (yaw: number, widthPx: number) => string | null;
}

/** Fotolägets vinkel — fas och gravyrdjup syns. */
const STILL_ANGLE = -0.42;

const FPS = 30;
const VIDEO_BITS_PER_SECOND = 8_000_000;
/** Några bildrutor efter sista vinkeln så att klippet inte klipps mitt i rörelsen. */
const TAIL_MS = 150;
const MIME_TYPES = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];

/** Mjuk start och landning, som en kamera på ett vridbord. */
function easeInOut(k: number): number {
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

/** Luft runt skylten efter beskärningen, andel av bredden. Samma som servern lägger till. */
const TRIM_PADDING = 0.06;
/** Så genomskinlig får en bildpunkt vara och ändå räknas till bottnen. */
const TRIM_ALPHA = 8;

/**
 * Bilden beskuren till det som syns, med lite luft runt om. Scenen är mycket större än skylten,
 * och utan beskärning blir skylten liten i offertens förhandsvisning, där servern inte har
 * hunnit beskära bilden.
 */
function trimmed(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): HTMLCanvasElement {
  const { width, height } = canvas;
  const { data } = context.getImageData(0, 0, width, height);
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) <= TRIM_ALPHA) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < left || bottom < top) return canvas;
  const pad = Math.round((right - left + 1) * TRIM_PADDING);
  const cut = document.createElement("canvas");
  cut.width = right - left + 1 + pad * 2;
  cut.height = bottom - top + 1 + pad * 2;
  cut.getContext("2d")?.drawImage(canvas, left, top, right - left + 1, bottom - top + 1, pad, pad, right - left + 1, bottom - top + 1);
  return cut;
}

interface RecorderProps {
  apiRef: RefObject<BadgeRecorder | null>;
  turnRef: RefObject<RecordingTurn | null>;
  target: Group | null;
}

export function Recorder({ apiRef, turnRef, target }: RecorderProps) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    /** Ritar skylten i vinkeln och läser bilden med `read`, i samma steg. Skylten står sedan som förut. */
    const shoot = (yaw: number, read: (canvas: HTMLCanvasElement) => string): string | null => {
      if (!target) return null;
      const y = target.rotation.y;
      target.rotation.y = yaw + Math.round((y - yaw) / (Math.PI * 2)) * Math.PI * 2;
      // Kontaktskuggan är bred och halvgenomskinlig; bilden får sin skugga där den visas.
      const hidden: Object3D[] = [];
      scene.traverse((object) => {
        if (object.userData[RASTER_ONLY] && object.visible) {
          object.visible = false;
          hidden.push(object);
        }
      });
      // Bufferten töms efter varje bildruta — läs den i samma steg som den ritas.
      gl.render(scene, camera);
      const image = read(gl.domElement);
      hidden.forEach((object) => (object.visible = true));
      target.rotation.y = y;
      return image.startsWith("data:image/") ? image : null;
    };
    apiRef.current = {
      still: () => {
        const png = shoot(STILL_ANGLE, (canvas) => canvas.toDataURL("image/png"));
        return png?.startsWith("data:image/png") ? png : null;
      },
      stillAt: (yaw, widthPx) =>
        shoot(yaw, (canvas) => {
          const scale = Math.min(1, widthPx / Math.max(1, canvas.width));
          const small = document.createElement("canvas");
          small.width = Math.max(1, Math.round(canvas.width * scale));
          small.height = Math.max(1, Math.round(canvas.height * scale));
          const context = small.getContext("2d");
          if (!context) return "";
          context.drawImage(canvas, 0, 0, small.width, small.height);
          // WebP där webbläsaren kan koda det, annars PNG. Servern kodar om bilden ändå.
          return trimmed(small, context).toDataURL("image/webp", 0.9);
        }),
      recordTurn: (seconds, bitsPerSecond = VIDEO_BITS_PER_SECOND) => {
        const canvas = gl.domElement;
        const mime = supportedMime();
        if (!mime || !target || typeof canvas.captureStream !== "function") return Promise.resolve(null);

        const background = scene.background;
        scene.background = paperColor();
        const startY = Math.round(target.rotation.y / (Math.PI * 2)) * Math.PI * 2;
        target.rotation.y = startY;

        const stream = canvas.captureStream(FPS);
        const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitsPerSecond });
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
  }, [apiRef, turnRef, gl, scene, camera, target]);

  return null;
}
