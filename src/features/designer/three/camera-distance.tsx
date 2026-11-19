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

/** I en ruta som är lägre än så går kameran så nära som skylten ryms. */
const LOW_VIEW_PX = 180;
/** Från den här höjden står kameran på sitt vanliga avstånd. Däremellan glider den. */
const TALL_VIEW_PX = 460;

interface CameraDistanceProps {
  doc: BadgeDocument;
  /** Kamerans vanliga avstånd — det ämnena ryms på. */
  baseZ: number;
  /** Avståndet följer rutans storlek: nära i en låg ruta, och aldrig närmare än att skylten ryms på bredden. */
  adaptive?: boolean;
  /** Kameran står så nära som hela skylten ryms, också när den är vriden. Till bilder där skylten ska fylla rutan. */
  fit?: boolean;
  /** Kameran har stannat på ett nytt avstånd. */
  onSettled: () => void;
}

/**
 * Backar kameran när skylten inte ryms i rutan. Ämnena ryms på det vanliga
 * avståndet, men en egen form får vara 120 × 120 mm och skulle annars klippas.
 *
 * I skyltmotorn följer avståndet också rutan (`adaptive`, besked av ägaren 2026-11-19 om
 * telefon och surfplatta). På telefon är rutan låg och bred: på det vanliga avståndet tog
 * skylten en tredjedel av höjden och blev 88 px bred. Där går kameran så nära som skylten
 * ryms. På en surfplatta med panelen bredvid är rutan smal och hög: där backar kameran
 * tills skylten ryms på bredden, också ett vanligt ämne.
 */
export function CameraDistance({ doc, baseZ, adaptive = false, fit = false, onSettled }: CameraDistanceProps) {
  const size = useThree((state) => state.size);
  const aspect = size.width / Math.max(1, size.height);
  const halfHeight = (doc.size.heightMm * UNITS_PER_MM) / 2;
  const halfWidth = (doc.size.widthMm * UNITS_PER_MM) / 2;
  const reach = Math.tan(MathUtils.degToRad(CAMERA_FOV_DEG / 2));
  // När skylten snurrar kring sin lodräta axel kommer kanten en halv bredd närmare
  // kameran, och hörnen ritas då högre upp. Avståndet räknas från den närmaste kanten.
  const fitHeight = (halfHeight * FIT_MARGIN) / reach + halfWidth;
  const fitWidth = (halfWidth * FIT_MARGIN) / (reach * aspect);
  const fits = Math.max(fitHeight, fitWidth);
  let target = Math.max(baseZ, doc.shape === "custom" ? fits : 0);
  if (fit) {
    target = Math.max(baseZ, fits);
  } else if (adaptive) {
    const far = Math.max(baseZ, doc.shape === "custom" ? fits : fitWidth);
    const roomy = MathUtils.clamp((size.height - LOW_VIEW_PX) / (TALL_VIEW_PX - LOW_VIEW_PX), 0, 1);
    target = MathUtils.lerp(Math.min(fits, far), far, roomy);
  }

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
