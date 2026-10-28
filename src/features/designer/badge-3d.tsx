"use client";

import { ContactShadows } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { MathUtils, NeutralToneMapping, type Group } from "three";
import type { BadgeDocument, FontEngine } from "@/engine";
import { EngraveSweep, LASER_LAYER, sweepDurationMs, type SweepState } from "./three/engrave-sweep";
import { plateMetrics, UNITS_PER_MM } from "./three/geometry";
import { useBadgeMaterials } from "./three/materials";
import { Mounting } from "./three/mounting";
import { PathTracer, RASTER_ONLY } from "./three/path-tracer";
import { Recorder, turnAngle, type BadgeRecorder, type RecordingTurn } from "./three/recorder";
import { StudioEnvironment } from "./three/studio-environment";
import { RESUME_AFTER_DRAG_MS, settleAfterDrag, useDragRotate } from "./three/use-drag-rotate";
import { useBadgeGeometry } from "./three/use-badge-geometry";

const SPIN_RADIANS_PER_SECOND = 0.55;
const FOCUS_HOLD_MS = 2600;
const FOCUS_DAMPING = 6;
/** Hur länge autosnurren tar på sig att komma upp i fart efter ett drag. */
const SPIN_RAMP_MS = 900;

/**
 * Vrider skylten till en sida — t.ex. baksidan när kunden byter fäste, och
 * sedan tillbaka till framsidan. `hero` är fotolägets tre kvarts vinkel där
 * fas och gravyrdjup syns. `flip` vänder skylten ett halvt varv.
 */
export interface SpinFocus {
  side: "front" | "back" | "hero" | "flip";
  key: number;
}

const FOCUS_ANGLE: Record<Exclude<SpinFocus["side"], "flip">, number> = { front: 0, back: Math.PI, hero: -0.42 };

interface FocusTarget {
  targetY: number;
  until: number;
  /** Vinkel att vrida vidare till när visningen är klar, om skylten inte snurrar. */
  thenY: number | null;
}

/** Närmaste vinkel som visar samma sida som `angle`, så att skylten tar kortaste vägen. */
function nearestTurn(currentY: number, angle: number): number {
  return angle + Math.round((currentY - angle) / (Math.PI * 2)) * Math.PI * 2;
}

function focusTarget(side: SpinFocus["side"], currentY: number, now: number): FocusTarget {
  const until = now + FOCUS_HOLD_MS;
  if (side === "flip") {
    return { targetY: Math.round(currentY / Math.PI) * Math.PI + Math.PI, until, thenY: null };
  }
  const targetY = nearestTurn(currentY, FOCUS_ANGLE[side]);
  return { targetY, until, thenY: side === "back" ? targetY + Math.PI : null };
}

/** Den ograverade plattan syns en stund innan lasern börjar. */
const ENGRAVE_LEAD_MS = 450;

interface BadgeMeshProps {
  doc: BadgeDocument;
  fonts: FontEngine;
  spinning: boolean;
  focus: SpinFocus | null;
  /** Ny nyckel = gravera fram skylten igen. `null` = ingen animation. */
  engrave: number | null;
  onEngraveDone: () => void;
  turnRef: RefObject<RecordingTurn | null>;
  onTarget: (group: Group | null) => void;
  onSceneChange: (version: object) => void;
  resumeAfterDragMs: number;
}

function BadgeMesh({
  doc,
  fonts,
  spinning,
  resumeAfterDragMs,
  focus,
  engrave,
  onEngraveDone,
  turnRef,
  onTarget,
  onSceneChange,
}: BadgeMeshProps) {
  const spinRef = useRef<Group>(null);
  const geometry = useBadgeGeometry(doc, fonts);
  const materials = useBadgeMaterials(doc);
  const metrics = plateMetrics(doc);
  const sweepRef = useRef<SweepState | null>(null);
  const hasGeometry = geometry !== null;
  const durationMs = sweepDurationMs(doc);

  useEffect(() => {
    if (engrave === null || !hasGeometry) return;
    sweepRef.current = { start: performance.now() + ENGRAVE_LEAD_MS, durationMs };
    // Animationen startar på nyckeln — inte när skyltens bredd ändras under tiden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engrave, hasGeometry]);

  useEffect(() => {
    onTarget(spinRef.current);
    return () => onTarget(null);
  }, [onTarget]);

  useEffect(() => {
    onSceneChange({ geometry, materials, mounting: doc.mounting });
  }, [geometry, materials, doc.mounting, onSceneChange]);

  const focusRef = useRef<FocusTarget | null>(null);
  const isRecording = useCallback(() => turnRef.current !== null, [turnRef]);
  const drag = useDragRotate(spinRef, isRecording);

  useEffect(() => {
    const group = spinRef.current;
    if (!focus || !group) return;
    focusRef.current = focusTarget(focus.side, group.rotation.y, performance.now());
  }, [focus]);

  useFrame((_, delta) => {
    const group = spinRef.current;
    if (!group) return;

    const now = performance.now();
    const turn = turnRef.current;
    if (turn) {
      drag.current.pitch = 0;
      drag.current.velocityY = 0;
      group.rotation.x = 0;
      group.rotation.y = turnAngle(turn, now) ?? turn.startY + Math.PI * 2;
      return;
    }

    settleAfterDrag(group, drag.current, delta);
    if (drag.current.dragging) {
      focusRef.current = null;
      return;
    }

    if (sweepRef.current) {
      group.rotation.y = MathUtils.damp(group.rotation.y, nearestTurn(group.rotation.y, 0), FOCUS_DAMPING, delta);
      return;
    }

    const target = focusRef.current;
    if (target && now < target.until) {
      group.rotation.y = MathUtils.damp(group.rotation.y, target.targetY, FOCUS_DAMPING, delta);
      return;
    }
    focusRef.current =
      target?.thenY != null && !spinning
        ? { targetY: target.thenY, until: now + FOCUS_HOLD_MS, thenY: null }
        : null;
    if (focusRef.current) return;
    if (!spinning) return;

    const sinceRelease = now - drag.current.releasedAt - resumeAfterDragMs;
    const ramp = MathUtils.clamp(sinceRelease / SPIN_RAMP_MS, 0, 1);
    // Långsamt förbi framsidan där gravyren syns, snabbare över baksidan.
    const facingBack = (1 - Math.cos(group.rotation.y)) / 2;
    group.rotation.y += ramp * delta * SPIN_RADIANS_PER_SECOND * (0.3 + 1.7 * facingBack);
  });

  return (
    <group ref={spinRef}>
      {geometry?.map((part, slot) => <mesh key={slot} geometry={part} material={materials[slot]} />)}
      <EngraveSweep
        doc={doc}
        materials={materials}
        sweepRef={sweepRef}
        groupRef={spinRef}
        onDone={onEngraveDone}
      />
      <Mounting
        mounting={doc.mounting}
        widthUnits={metrics.widthUnits}
        heightUnits={metrics.heightUnits}
        backZ={metrics.backZ}
      />
    </group>
  );
}

interface Badge3DProps {
  doc: BadgeDocument;
  fonts: FontEngine;
  spinning: boolean;
  focus: SpinFocus | null;
  /** Strålspårat fotoläge i stället för rasterbild. */
  photo: boolean;
  photoSamples: number;
  onPhotoProgress: (samples: number) => void;
  /** Fylls med inspelaren när scenen är redo. */
  recorderRef: RefObject<BadgeRecorder | null>;
  engrave: number | null;
  onEngraveDone: () => void;
  /** Kamerans avstånd — närmare i små vyer, så att skylten fyller rutan. */
  cameraZ?: number;
  /** När WebGL-scenen finns — då kan en platt ersättare under den döljas. */
  onReady?: () => void;
  /** Paus efter ett släpp innan autosnurren tar vid. 0 = kastet glider direkt över i snurren. */
  resumeAfterDragMs?: number;
}

export default function Badge3D({
  doc,
  fonts,
  spinning,
  focus,
  engrave,
  onEngraveDone,
  photo,
  photoSamples,
  onPhotoProgress,
  recorderRef,
  cameraZ = 5.6,
  onReady,
  resumeAfterDragMs = RESUME_AFTER_DRAG_MS,
}: Badge3DProps) {
  const [target, setTarget] = useState<Group | null>(null);
  const turnRef = useRef<RecordingTurn | null>(null);
  const [sceneVersion, setSceneVersion] = useState<object>({});
  const shadowY = -(doc.size.heightMm * UNITS_PER_MM) / 2 - 0.45;

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, cameraZ], fov: 30 }}
      gl={{ antialias: true, alpha: true, toneMapping: NeutralToneMapping }}
      onCreated={({ gl, camera }) => {
        gl.localClippingEnabled = true;
        camera.layers.enable(LASER_LAYER);
        onReady?.();
      }}
    >
      <StudioEnvironment intensity={1.35} />
      <directionalLight position={[2.5, 4, 5]} intensity={1.1} />
      <BadgeMesh
        doc={doc}
        fonts={fonts}
        spinning={spinning}
        resumeAfterDragMs={resumeAfterDragMs}
        focus={focus}
        engrave={engrave}
        onEngraveDone={onEngraveDone}
        turnRef={turnRef}
        onTarget={setTarget}
        onSceneChange={setSceneVersion}
      />
      <group userData={{ [RASTER_ONLY]: true }}>
        <ContactShadows
          position={[0, shadowY, 0]}
          opacity={0.36}
          scale={9}
          blur={2.4}
          far={3}
          resolution={1024}
        />
      </group>
      <Recorder apiRef={recorderRef} turnRef={turnRef} target={target} />
      {photo && (
        <PathTracer
          target={target}
          sceneVersion={sceneVersion}
          maxSamples={photoSamples}
          onProgress={onPhotoProgress}
        />
      )}
    </Canvas>
  );
}
