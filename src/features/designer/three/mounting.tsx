import { useMemo } from "react";
import { fitHardware, type BadgeDocument, type HardwareFootprint, type MountingId } from "@/engine";
import { UNITS_PER_MM } from "./geometry";

const HARDWARE_STEEL = "#c9ced4";
const MAGNET_BLACK = "#24272c";
/** Hur högt över skyltens mitt fästet sitter, som andel av höjden. */
const HARDWARE_RISE: Record<MountingId, number> = { pin: 0.14, magnet: 0, clip: 0.2, "safety-pin": 0.12 };

/** Ytan fästet täcker på baksidan, i mm — samma mått som geometrin nedan. Klämmans arm sticker upp över kanten med flit. */
function footprint(mounting: MountingId, widthMm: number, heightMm: number): HardwareFootprint {
  const centerYMm = heightMm * (0.5 - HARDWARE_RISE[mounting]);
  switch (mounting) {
    case "pin":
      return { widthMm: Math.max(widthMm * 0.66, widthMm * 0.62 + 3.6), heightMm: 4, centerYMm };
    case "magnet":
      return { widthMm: widthMm * 0.6, heightMm: heightMm * 0.5, centerYMm };
    case "clip":
      return { widthMm: 14, heightMm: heightMm * 0.5, centerYMm };
    case "safety-pin":
      return { widthMm: widthMm * 0.56 + 4, heightMm: 3, centerYMm };
  }
}

interface MountingProps {
  doc: BadgeDocument;
  widthUnits: number;
  heightUnits: number;
  backZ: number;
}

/**
 * Fästet på baksidan. På en egen form flyttas det i höjdled och förminskas vid
 * behov, så att det inte sticker ut bakom en udd eller ett smalt parti.
 */
export function Mounting({ doc, widthUnits, heightUnits, backZ }: MountingProps) {
  const { mounting } = doc;
  const fit = useMemo(() => fitHardware(doc, footprint(doc.mounting, doc.size.widthMm, doc.size.heightMm)), [doc]);
  const lift = (doc.size.heightMm / 2 - fit.centerYMm) * UNITS_PER_MM - HARDWARE_RISE[mounting] * heightUnits * fit.scale;
  return (
    <group position={[0, lift, 0]} scale={[fit.scale, fit.scale, 1]}>
      {hardware(mounting, widthUnits, heightUnits, backZ)}
    </group>
  );
}

/** Fästets delar på sin vanliga plats på en skylt med bredden `w` och höjden `h`. */
function hardware(mounting: MountingId, w: number, h: number, backZ: number) {
  const mm = UNITS_PER_MM;
  const steel = <meshStandardMaterial color={HARDWARE_STEEL} metalness={1} roughness={0.28} />;

  switch (mounting) {
    case "pin":
      return (
        <group position={[0, h * HARDWARE_RISE.pin, backZ]}>
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
        <group position={[0, h * HARDWARE_RISE.clip, backZ]}>
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
        <group position={[0, h * HARDWARE_RISE["safety-pin"], backZ - 1 * mm]}>
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
