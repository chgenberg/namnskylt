import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { WebGLPathTracer } from "three-gpu-pathtracer";
import { Matrix4, NormalBlending, type Object3D } from "three";

/** Markerar objekt som bara finns i rasterbilden (t.ex. kontaktskuggan). */
export const RASTER_ONLY = "rasterOnly";

/** Hur länge scenen ska stå still innan spårningen börjar om. */
const SETTLE_MS = 350;
/** Hur ofta förloppet rapporteras uppåt, i samplingar. */
const PROGRESS_EVERY = 4;

interface PathTracerProps {
  /** Objektet vars rörelse avbryter spårningen — skylten. */
  target: Object3D | null;
  /** Ändras när geometri eller material byts ut. */
  sceneVersion: unknown;
  maxSamples: number;
  onProgress: (samples: number) => void;
}

function withRasterOnlyHidden(root: Object3D, run: () => void) {
  const hidden: Object3D[] = [];
  root.traverse((object) => {
    if (!object.userData[RASTER_ONLY]) return;
    object.traverse((child) => {
      if (child.visible) {
        child.visible = false;
        hidden.push(child);
      }
    });
  });
  try {
    run();
  } finally {
    hidden.forEach((object) => (object.visible = true));
  }
}

/**
 * Fotoläge: progressiv strålspårning av samma scen. Tar över renderingen
 * (prioritet 1) och börjar om så fort skylten rör sig eller ändras. Bakgrunden
 * spåras genomskinlig, så rasterns kontaktskugga syns under skylten.
 */
export function PathTracer({ target, sceneVersion, maxSamples, onProgress }: PathTracerProps) {
  const { gl, scene, camera } = useThree();
  const tracerRef = useRef<WebGLPathTracer | null>(null);
  const state = useRef({ lastMatrix: new Matrix4(), changedAt: 0, ready: false, reported: -1 });

  useEffect(() => {
    const tracer = new WebGLPathTracer(gl);
    tracer.bounces = 6;
    tracer.filterGlossyFactor = 0.5;
    tracer.minSamples = 2;
    tracer.renderDelay = 0;
    tracer.fadeDuration = 450;
    tracer.tiles.set(2, 2);
    // Biblioteket slutar rita rastern när fotot tonat in; vi ritar den alltid
    // under, så att kontaktskuggan syns genom den genomskinliga bakgrunden.
    tracer.renderToCanvasCallback = (_target, renderer, quad) => {
      renderer.render(scene, camera);
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      quad.material.blending = NormalBlending;
      quad.render(renderer);
      renderer.autoClear = autoClear;
    };
    tracerRef.current = tracer;
    state.current.ready = false;
    return () => {
      tracerRef.current = null;
      tracer.dispose();
    };
  }, [gl, scene, camera]);

  useEffect(() => {
    state.current.ready = false;
    state.current.changedAt = performance.now();
  }, [sceneVersion]);

  useFrame(() => {
    const s = state.current;
    const now = performance.now();
    const tracer = tracerRef.current;
    if (!tracer) {
      gl.render(scene, camera);
      return;
    }

    if (target && !target.matrixWorld.equals(s.lastMatrix)) {
      s.lastMatrix.copy(target.matrixWorld);
      s.changedAt = now;
      s.ready = false;
    }

    if (!s.ready) {
      gl.render(scene, camera);
      if (s.reported !== 0) onProgress((s.reported = 0));
      if (now - s.changedAt < SETTLE_MS) return;
      withRasterOnlyHidden(scene, () => tracer.setScene(scene, camera));
      s.ready = true;
    }

    if (tracer.samples >= maxSamples) return;
    tracer.renderSample();
    const samples = Math.floor(tracer.samples);
    if (samples >= maxSamples || samples - s.reported >= PROGRESS_EVERY) {
      onProgress((s.reported = samples));
    }
  }, 1);

  return null;
}
