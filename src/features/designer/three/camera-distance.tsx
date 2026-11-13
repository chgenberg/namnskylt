import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils } from "three";
import type { BadgeDocument } from "@/engine";
import { UNITS_PER_MM } from "./geometry";

/** Kamerans bildvinkel på höjden, i grader. */
export const CAMERA_FOV_DEG = 30;
/** Luft mellan skylten och rutans kant när kameran har backat. */
const FIT_MARGIN = 1.16;
const DAMPING = 7;
/** Så nära målet räknas kameran som framme. */
const SETTLED_UNITS = 1e-3;

interface CameraDistanceProps {
  doc: BadgeDocument;
  /** Kamerans vanliga avstånd — det ämnena ryms på. */
  baseZ: number;
  /** Kameran har stannat på ett nytt avstånd. */
  onSettled: () => void;
}

/**
 * Backar kameran när skylten inte ryms i rutan. Ämnena ryms på det vanliga
 * avståndet, men en egen form får vara 120 × 120 mm och skulle annars klippas.
 */
export function CameraDistance({ doc, baseZ, onSettled }: CameraDistanceProps) {
  const aspect = useThree((state) => state.size.width / Math.max(1, state.size.height));
  const halfHeight = (doc.size.heightMm * UNITS_PER_MM) / 2;
  const halfWidth = (doc.size.widthMm * UNITS_PER_MM) / 2;
  const reach = Math.tan(MathUtils.degToRad(CAMERA_FOV_DEG / 2));
  // När skylten snurrar kring sin lodräta axel kommer kanten en halv bredd närmare
  // kameran, och hörnen ritas då högre upp. Avståndet räknas från den närmaste kanten.
  const fitHeight = (halfHeight * FIT_MARGIN) / reach + halfWidth;
  const fitWidth = (halfWidth * FIT_MARGIN) / (reach * aspect);
  const needed = doc.shape === "custom" ? Math.max(fitHeight, fitWidth) : 0;
  const target = Math.max(baseZ, needed);

  useFrame(({ camera }, delta) => {
    const gap = target - camera.position.z;
    if (gap === 0) return;
    const settled = Math.abs(gap) < SETTLED_UNITS;
    camera.position.z = settled ? target : MathUtils.damp(camera.position.z, target, DAMPING, delta);
    // Fotoläget spårar med kamerans läge från start och måste börja om när den har flyttat sig.
    if (settled) onSettled();
  });

  return null;
}
