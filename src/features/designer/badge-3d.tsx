"use client";

import { ContactShadows, PresentationControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { MathUtils, NeutralToneMapping, type Group } from "three";
import type { BadgeDocument, FontEngine } from "@/engine";
import { plateMetrics, UNITS_PER_MM } from "./three/geometry";
import { useBadgeMaterials } from "./three/materials";
import { Mounting } from "./three/mounting";
import { PathTracer, RASTER_ONLY } from "./three/path-tracer";
import { StudioEnvironment } from "./three/studio-environment";
import { useBadgeGeometry } from "./three/use-badge-geometry";

const SPIN_RADIANS_PER_SECOND = 0.55;
const FOCUS_HOLD_MS = 2600;
const FOCUS_DAMPING = 6;

/**
 * Vrider skylten till en sida en stund — t.ex. baksidan när kunden byter
 * fäste. `hero` är fotolägets tre kvarts vinkel där fas och gravyrdjup syns.
 */
export interface SpinFocus {
  side: "front" | "back" | "hero";
  key: number;
}

const FOCUS_ANGLE: Record<SpinFocus["side"], number> = { front: 0, back: Math.PI, hero: -0.42 };

interface BadgeMeshProps {
  doc: BadgeDocument;
  fonts: FontEngine;
  spinning: boolean;
  focus: SpinFocus | null;
  onTarget: (group: Group | null) => void;
  onSceneChange: (version: object) => void;
}

function BadgeMesh({ doc, fonts, spinning, focus, onTarget, onSceneChange }: BadgeMeshProps) {
  const spinRef = useRef<Group>(null);
  const geometry = useBadgeGeometry(doc, fonts);
  const materials = useBadgeMaterials(doc);
  const metrics = plateMetrics(doc);

  useEffect(() => {
    onTarget(spinRef.current);
    return () => onTarget(null);
  }, [onTarget]);

  useEffect(() => {
    onSceneChange({ geometry, materials, mounting: doc.mounting });
  }, [geometry, materials, doc.mounting, onSceneChange]);

  const focusRef = useRef<{ targetY: number; until: number } | null>(null);

  useEffect(() => {
    const group = spinRef.current;
    if (!focus || !group) return;
    const base = FOCUS_ANGLE[focus.side];
    const turns = Math.round((group.rotation.y - base) / (Math.PI * 2));
    focusRef.current = { targetY: base + turns * Math.PI * 2, until: performance.now() + FOCUS_HOLD_MS };
  }, [focus]);

  useFrame((_, delta) => {
    const group = spinRef.current;
    if (!group) return;

    const target = focusRef.current;
    if (target && performance.now() < target.until) {
      group.rotation.y = MathUtils.damp(group.rotation.y, target.targetY, FOCUS_DAMPING, delta);
      return;
    }
    focusRef.current = null;
    if (!spinning) return;

    // Långsamt förbi framsidan där gravyren syns, snabbare över baksidan.
    const facingBack = (1 - Math.cos(group.rotation.y)) / 2;
    group.rotation.y += delta * SPIN_RADIANS_PER_SECOND * (0.3 + 1.7 * facingBack);
  });

  return (
    <group ref={spinRef}>
      {geometry?.map((part, slot) => <mesh key={slot} geometry={part} material={materials[slot]} />)}
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
}

export default function Badge3D({
  doc,
  fonts,
  spinning,
  focus,
  photo,
  photoSamples,
  onPhotoProgress,
}: Badge3DProps) {
  const [target, setTarget] = useState<Group | null>(null);
  const [sceneVersion, setSceneVersion] = useState<object>({});
  const shadowY = -(doc.size.heightMm * UNITS_PER_MM) / 2 - 0.45;

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 5.6], fov: 30 }}
      gl={{ antialias: true, alpha: true, toneMapping: NeutralToneMapping }}
    >
      <StudioEnvironment intensity={1.35} />
      <directionalLight position={[2.5, 4, 5]} intensity={1.1} />
      <PresentationControls
        global={false}
        cursor
        snap
        polar={[-0.45, 0.45]}
        azimuth={[-Math.PI, Math.PI]}
      >
        <BadgeMesh
          doc={doc}
          fonts={fonts}
          spinning={spinning}
          focus={focus}
          onTarget={setTarget}
          onSceneChange={setSceneVersion}
        />
      </PresentationControls>
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
