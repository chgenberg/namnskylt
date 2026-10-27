"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  type Group,
  MathUtils,
  type Material,
  Plane,
  type PointLight,
  type Points,
  Vector3,
} from "three";
import type { BadgeDocument } from "@/engine";
import { buildPreviewGeometry, plateMetrics } from "./geometry";
import { RASTER_ONLY } from "./path-tracer";

/** Sekunder per scenenhet (≈29 mm) som lasern sveper — en 70 mm skylt tar ~2,4 s. */
const SECONDS_PER_UNIT = 0.95;
const MIN_SWEEP_SECONDS = 1.6;
const SPARK_COUNT = 90;
const SPARK_LIFE_S = 0.55;
const SPARKS_PER_SECOND = 160;
const LASER_CORE = new Color("#f4fbff");
const LASER_HALO = new Color("#6fc3ff");

/**
 * Lasern och gnistorna ligger på ett eget lager som bara huvudkameran ser.
 * Kontaktskuggan ritar scenen med ett djupmaterial utan punktstorlek, och
 * då blir gnistorna jättelika fyrkanter i skuggan.
 */
export const LASER_LAYER = 1;

export interface SweepState {
  start: number;
  durationMs: number;
}

/** Var lasern står (0–1) med mjuk start och inbromsning. */
export function sweepProgress(sweep: SweepState | null, now: number): number | null {
  if (!sweep) return null;
  const t = Math.max(0, (now - sweep.start) / sweep.durationMs);
  if (t >= 1) return null;
  return t * t * (3 - 2 * t);
}

export function sweepDurationMs(doc: BadgeDocument): number {
  const { widthUnits } = plateMetrics(doc);
  return Math.max(MIN_SWEEP_SECONDS, widthUnits * SECONDS_PER_UNIT) * 1000;
}

interface EngraveSweepProps {
  doc: BadgeDocument;
  materials: readonly Material[];
  sweepRef: RefObject<SweepState | null>;
  groupRef: RefObject<Group | null>;
  onDone: () => void;
}

/**
 * Lasern som graverar fram skylten. Den färdiga skylten klipps bort till
 * höger om lasern och en ograverad platta till vänster, så att gravyren
 * växer fram där strålen passerat. Klipplanen ligger i världsrymden och
 * följer därför skyltens rotation varje bildruta.
 */
export function EngraveSweep({ doc, materials, sweepRef, groupRef, onDone }: EngraveSweepProps) {
  const metrics = plateMetrics(doc);
  const shapeKey = JSON.stringify([doc.shape, doc.size, doc.cornerRadiusMm, doc.materialId]);
  // Plattan utan gravyr byggs bara om när formen ändras.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const blank = useMemo(() => buildPreviewGeometry(doc, null), [shapeKey]);
  useEffect(() => () => blank.forEach((part) => part.dispose()), [blank]);

  const planes = useMemo(() => {
    const engraved = new Plane();
    const blank = new Plane();
    return {
      engravedLocal: new Plane(new Vector3(-1, 0, 0), 0),
      blankLocal: new Plane(new Vector3(1, 0, 0), 0),
      engravedPlane: engraved,
      blankPlane: blank,
      engraved: [engraved],
      blank: [blank],
    };
  }, []);
  const blankMaterials = useMemo(
    () =>
      materials.map((material) => {
        const clone = material.clone();
        clone.clippingPlanes = planes.blank;
        return clone;
      }),
    [materials, planes],
  );
  useEffect(() => () => blankMaterials.forEach((m) => m.dispose()), [blankMaterials]);

  const blankRef = useRef<Group>(null);
  const laserRef = useRef<Group>(null);
  const lightRef = useRef<PointLight>(null);
  const sparksRef = useRef<Points>(null);
  const wasActive = useRef(false);

  const sparks = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(SPARK_COUNT * 3), 3));
    return {
      geometry,
      velocity: new Float32Array(SPARK_COUNT * 3),
      age: new Float32Array(SPARK_COUNT).fill(SPARK_LIFE_S),
      next: 0,
      debt: 0,
    };
  }, []);
  useEffect(() => () => sparks.geometry.dispose(), [sparks]);

  useEffect(() => {
    laserRef.current?.traverse((object) => object.layers.set(LASER_LAYER));
    sparksRef.current?.layers.set(LASER_LAYER);
  }, []);

  useEffect(
    () => () => {
      materials.forEach((m) => (m.clippingPlanes = null));
    },
    [materials],
  );

  useFrame((_, delta) => {
    const group = groupRef.current;
    const progress = sweepProgress(sweepRef.current, performance.now());
    const active = progress !== null && group !== null;

    if (blankRef.current) blankRef.current.visible = active;
    if (laserRef.current) laserRef.current.visible = active;
    if (sparksRef.current) sparksRef.current.visible = active || sparks.age.some((a) => a < SPARK_LIFE_S);

    if (!active) {
      if (wasActive.current) {
        materials.forEach((m) => (m.clippingPlanes = null));
        wasActive.current = false;
        sweepRef.current = null;
        onDone();
      }
    } else {
      const halfW = metrics.widthUnits / 2 + 0.04;
      const x = MathUtils.lerp(-halfW, halfW, progress);
      group.updateMatrixWorld();
      planes.engravedLocal.constant = x;
      planes.blankLocal.constant = -x;
      planes.engravedPlane.copy(planes.engravedLocal).applyMatrix4(group.matrixWorld);
      planes.blankPlane.copy(planes.blankLocal).applyMatrix4(group.matrixWorld);
      for (const material of materials) {
        if (material.clippingPlanes !== planes.engraved) material.clippingPlanes = planes.engraved;
      }
      wasActive.current = true;
      if (laserRef.current) laserRef.current.position.x = x;
      if (lightRef.current) lightRef.current.intensity = 0.12 + Math.random() * 0.1;

      sparks.debt += delta * SPARKS_PER_SECOND;
      for (; sparks.debt >= 1; sparks.debt--) {
        const i = sparks.next;
        sparks.next = (i + 1) % SPARK_COUNT;
        const position = sparks.geometry.getAttribute("position");
        position.setXYZ(i, x, (Math.random() - 0.5) * metrics.heightUnits * 0.9, metrics.frontZ + 0.01);
        sparks.velocity[i * 3] = (Math.random() - 0.2) * 0.35;
        sparks.velocity[i * 3 + 1] = (Math.random() - 0.5) * 0.35;
        sparks.velocity[i * 3 + 2] = 0.2 + Math.random() * 0.5;
        sparks.age[i] = 0;
      }
    }

    const position = sparks.geometry.getAttribute("position");
    for (let i = 0; i < SPARK_COUNT; i++) {
      if ((sparks.age[i] ?? SPARK_LIFE_S) >= SPARK_LIFE_S) {
        position.setXYZ(i, 0, 0, -1000);
        continue;
      }
      sparks.age[i] = (sparks.age[i] ?? 0) + delta;
      position.setXYZ(
        i,
        position.getX(i) + (sparks.velocity[i * 3] ?? 0) * delta,
        position.getY(i) + (sparks.velocity[i * 3 + 1] ?? 0) * delta,
        position.getZ(i) + (sparks.velocity[i * 3 + 2] ?? 0) * delta,
      );
    }
    position.needsUpdate = true;
  });

  const lineHeight = metrics.heightUnits * 1.04;
  return (
    <group userData={{ [RASTER_ONLY]: true }}>
      <group ref={blankRef} visible={false}>
        {blank.map((part, slot) => (
          <mesh key={slot} geometry={part} material={blankMaterials[slot]} />
        ))}
      </group>
      <group ref={laserRef} visible={false} position={[0, 0, metrics.frontZ + 0.004]}>
        <mesh renderOrder={2}>
          <planeGeometry args={[0.005, lineHeight]} />
          <meshBasicMaterial color={LASER_CORE} toneMapped={false} transparent depthWrite={false} blending={AdditiveBlending} />
        </mesh>
        <mesh renderOrder={2}>
          <planeGeometry args={[0.04, lineHeight]} />
          <meshBasicMaterial
            color={LASER_HALO}
            toneMapped={false}
            transparent
            opacity={0.22}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
        <pointLight ref={lightRef} color={LASER_HALO} distance={0.5} decay={2} position={[0, 0, 0.08]} />
      </group>
      <points ref={sparksRef} geometry={sparks.geometry} frustumCulled={false} renderOrder={3}>
        <pointsMaterial
          color={LASER_HALO}
          size={0.018}
          toneMapped={false}
          transparent
          opacity={0.9}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </points>
    </group>
  );
}
