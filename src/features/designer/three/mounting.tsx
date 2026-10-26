import type { MountingId } from "@/engine";
import { UNITS_PER_MM } from "./geometry";

const HARDWARE_STEEL = "#c9ced4";
const MAGNET_BLACK = "#24272c";

interface MountingProps {
  mounting: MountingId;
  widthUnits: number;
  heightUnits: number;
  backZ: number;
}

export function Mounting({ mounting, widthUnits: w, heightUnits: h, backZ }: MountingProps) {
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
