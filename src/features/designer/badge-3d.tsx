"use client";

import { ContactShadows, Environment, Float, Lightformer, PresentationControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  ExtrudeGeometry,
  MathUtils,
  NeutralToneMapping,
  Shape,
  ShapeGeometry,
  type BufferGeometry,
  type Group,
} from "three";
import {
  effectiveCornerRadius,
  getColor,
  getMaterial,
  type BadgeDocument,
  type MaterialFinish,
  type MountingId,
  type TextMeasurer,
} from "@/engine";
import { useBadgeTextures, type BadgeTextures } from "./use-badge-textures";

/** Scenenheter per mm. Fast skala så att storleksbyten syns i 3D. */
const UNITS_PER_MM = 0.034;
/** Riktiga skyltar är 0,8–1 mm; något tjockare i vyn så kanten läses. */
const MIN_VISUAL_THICKNESS_MM = 1.6;
const BEVEL_MM = 0.35;
const SPIN_RADIANS_PER_SECOND = 0.55;
const FOCUS_HOLD_MS = 2600;
const FOCUS_DAMPING = 6;
const CURVE_SEGMENTS = 64;

const HARDWARE_STEEL = "#c9ced4";
const MAGNET_BLACK = "#24272c";

function buildShape(doc: BadgeDocument): Shape {
  const w = doc.size.widthMm * UNITS_PER_MM;
  const h = doc.size.heightMm * UNITS_PER_MM;
  const shape = new Shape();

  if (doc.shape === "oval") {
    shape.absellipse(0, 0, w / 2, h / 2, 0, Math.PI * 2, false, 0);
    return shape;
  }

  const r = effectiveCornerRadius(doc) * UNITS_PER_MM;
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  if (r > 0) shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  if (r > 0) shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  if (r > 0) shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  if (r > 0) shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

/** ShapeGeometry ger UV i världskoordinater — mappa om till 0…1 över skylten. */
function faceGeometry(shape: Shape, widthUnits: number, heightUnits: number): BufferGeometry {
  const geometry = new ShapeGeometry(shape, CURVE_SEGMENTS);
  const position = geometry.attributes.position!;
  const uv = geometry.attributes.uv!;
  for (let i = 0; i < position.count; i++) {
    uv.setXY(i, position.getX(i) / widthUnits + 0.5, position.getY(i) / heightUnits + 0.5);
  }
  uv.needsUpdate = true;
  return geometry;
}

interface MountingProps {
  mounting: MountingId;
  widthUnits: number;
  heightUnits: number;
  backZ: number;
}

function Mounting({ mounting, widthUnits: w, heightUnits: h, backZ }: MountingProps) {
  const mm = UNITS_PER_MM;
  const steel = <meshStandardMaterial color={HARDWARE_STEEL} metalness={1} roughness={0.28} />;

  switch (mounting) {
    case "pin":
      return (
        <group position={[0, h * 0.14, backZ]}>
          <mesh position={[0, 0, -0.9 * mm]}>
            <boxGeometry args={[w * 0.62, 3.2 * mm, 0.6 * mm]} />
            {steel}
          </mesh>
          <mesh position={[0, 0, -1.8 * mm]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.38 * mm, 0.38 * mm, w * 0.66, 12]} />
            {steel}
          </mesh>
          <mesh position={[w * 0.31, 0, -1.6 * mm]}>
            <boxGeometry args={[3.6 * mm, 3.6 * mm, 2 * mm]} />
            {steel}
          </mesh>
        </group>
      );
    case "magnet":
      return (
        <group position={[0, 0, backZ]}>
          <mesh position={[0, 0, -0.6 * mm]}>
            <boxGeometry args={[w * 0.6, h * 0.5, 1.2 * mm]} />
            <meshStandardMaterial color={MAGNET_BLACK} metalness={0.4} roughness={0.55} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * w * 0.17, 0, -1.6 * mm]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[h * 0.16, h * 0.16, 1 * mm, 32]} />
              {steel}
            </mesh>
          ))}
        </group>
      );
    case "clip":
      return (
        <group position={[0, h * 0.2, backZ]}>
          <mesh position={[0, 0, -0.5 * mm]}>
            <boxGeometry args={[14 * mm, h * 0.5, 0.8 * mm]} />
            {steel}
          </mesh>
          <mesh position={[0, h * 0.35, -2.2 * mm]}>
            <boxGeometry args={[11 * mm, h * 0.9, 0.7 * mm]} />
            {steel}
          </mesh>
          <mesh position={[0, h * 0.25, -1.4 * mm]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[1 * mm, 1 * mm, 12 * mm, 16]} />
            {steel}
          </mesh>
        </group>
      );
    case "safety-pin":
      return (
        <group position={[0, h * 0.12, backZ - 1 * mm]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.3 * mm, 0.3 * mm, w * 0.56, 10]} />
            {steel}
          </mesh>
          <mesh position={[-w * 0.28, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[1.4 * mm, 0.3 * mm, 8, 24]} />
            {steel}
          </mesh>
          <mesh position={[w * 0.28, 0, 0]}>
            <boxGeometry args={[4 * mm, 3 * mm, 1.6 * mm]} />
            {steel}
          </mesh>
        </group>
      );
  }
}

function surfaceMaterialProps(finish: MaterialFinish) {
  if (finish === "plastic") {
    return { metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.35, anisotropy: 0 };
  }
  return { metalness: 1, clearcoat: 0, clearcoatRoughness: 0, anisotropy: finish === "aluminium" ? 0.8 : 0.5 };
}

/** Vrider skylten till en sida en stund — t.ex. baksidan när kunden byter fäste. */
export interface SpinFocus {
  side: "front" | "back";
  key: number;
}

interface BadgeMeshProps {
  doc: BadgeDocument;
  textures: BadgeTextures | null;
  spinning: boolean;
  focus: SpinFocus | null;
}

function BadgeMesh({ doc, textures, spinning, focus }: BadgeMeshProps) {
  const spinRef = useRef<Group>(null);
  const material = getMaterial(doc.materialId);
  const color = getColor(doc.materialId, doc.colorId);
  const widthUnits = doc.size.widthMm * UNITS_PER_MM;
  const heightUnits = doc.size.heightMm * UNITS_PER_MM;
  const depth = Math.max(material.thicknessMm, MIN_VISUAL_THICKNESS_MM) * UNITS_PER_MM;
  const bevel = BEVEL_MM * UNITS_PER_MM;

  const { body, face } = useMemo(() => {
    const shape = buildShape(doc);
    const extruded = new ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 4,
      curveSegments: CURVE_SEGMENTS,
    });
    extruded.translate(0, 0, -depth / 2);
    return { body: extruded, face: faceGeometry(shape, widthUnits, heightUnits) };
    // Geometrin beror bara på formens mått — inte på text eller färg.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.shape, doc.size.widthMm, doc.size.heightMm, doc.cornerRadiusMm, depth, bevel, widthUnits, heightUnits]);

  useEffect(
    () => () => {
      body.dispose();
      face.dispose();
    },
    [body, face],
  );

  const focusRef = useRef<{ targetY: number; until: number } | null>(null);

  useEffect(() => {
    const group = spinRef.current;
    if (!focus || !group) return;
    const base = focus.side === "front" ? 0 : Math.PI;
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

  const finish = surfaceMaterialProps(material.finish);
  // Tvålagersplast: kanten och baksidan är kärnan. Metall är samma rakt igenom.
  const bodyColor = material.finish === "plastic" ? color.engraving : color.surface;
  const frontZ = depth / 2 + bevel + 0.0006;

  return (
    <group ref={spinRef}>
      <mesh geometry={body}>
        <meshPhysicalMaterial
          color={bodyColor}
          metalness={finish.metalness}
          roughness={material.finish === "plastic" ? 0.45 : 0.32}
          clearcoat={finish.clearcoat}
        />
      </mesh>
      {textures && (
        <mesh geometry={face} position={[0, 0, frontZ]}>
          <meshPhysicalMaterial
            map={textures.color}
            bumpMap={textures.bump}
            bumpScale={material.finish === "plastic" ? 3 : 1.5}
            roughnessMap={textures.roughness}
            roughness={1}
            metalness={finish.metalness}
            metalnessMap={material.finish === "plastic" ? null : textures.bump}
            clearcoat={finish.clearcoat}
            clearcoatRoughness={finish.clearcoatRoughness}
            anisotropy={finish.anisotropy}
          />
        </mesh>
      )}
      <Mounting
        mounting={doc.mounting}
        widthUnits={widthUnits}
        heightUnits={heightUnits}
        backZ={-(depth / 2 + bevel)}
      />
    </group>
  );
}

interface Badge3DProps {
  doc: BadgeDocument;
  measure: TextMeasurer;
  spinning: boolean;
  focus: SpinFocus | null;
}

export default function Badge3D({ doc, measure, spinning, focus }: Badge3DProps) {
  const textures = useBadgeTextures(doc, measure);
  const shadowY = -(doc.size.heightMm * UNITS_PER_MM) / 2 - 0.45;

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 5.6], fov: 30 }}
      gl={{ antialias: true, alpha: true, toneMapping: NeutralToneMapping }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 6]} intensity={1.6} />
      <Environment resolution={256} environmentIntensity={1.35}>
        <Lightformer form="rect" intensity={2.4} position={[0, 5, -1]} scale={[10, 2, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[-5, 1, 2]} rotation-y={Math.PI / 2} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[5, 1, 2]} rotation-y={-Math.PI / 2} scale={[8, 2, 1]} />
        <Lightformer form="ring" intensity={1.2} position={[0, 0, 7]} scale={3} />
      </Environment>
      <PresentationControls
        global={false}
        cursor
        snap
        polar={[-0.45, 0.45]}
        azimuth={[-Math.PI, Math.PI]}
      >
        <Float speed={1.4} rotationIntensity={0.12} floatIntensity={0.35}>
          <BadgeMesh doc={doc} textures={textures} spinning={spinning} focus={focus} />
        </Float>
      </PresentationControls>
      <ContactShadows position={[0, shadowY, 0]} opacity={0.32} scale={9} blur={2.6} far={3} />
    </Canvas>
  );
}
