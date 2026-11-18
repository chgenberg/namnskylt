import { CLIP_MIN } from "./catalog";
import { clipOrientationOf } from "./document";
import { availableHalfWidth, effectiveCornerRadius, hasStraightSides } from "./shape";
import type { BadgeDocument, Mm } from "./types";

/**
 * Fästet på baksidan ska inte sticka ut bakom skylten. Ämnena är breda nog
 * där fästet sitter, men en egen form kan vara smal just där — en stjärnas
 * udd, en pil. Här flyttas fästet i höjdled och förminskas om det behövs.
 */

/** Ytan fästet täcker på baksidan: en rektangel mitt på skylten i sidled. */
export interface HardwareFootprint {
  widthMm: Mm;
  heightMm: Mm;
  /** Rektangelns mitt, mätt från skyltens överkant. */
  centerYMm: Mm;
  /** Luft mot skyltens kant. Utan värde gäller `EDGE_MARGIN_MM`. Klämman ligger kant i kant och har 0. */
  edgeMarginMm?: Mm;
  /** Så mycket får ytans hörn rundas för att den ska rymmas, i ytans egna mått. Utan värde rundas de inte. */
  maxCornerRadiusMm?: Mm;
}

interface HardwareFit {
  centerYMm: Mm;
  /** 1 = full storlek. */
  scale: number;
  /** Hörnens rundning när ytan bara ryms med rundade hörn, i ytans egna mått (före `scale`). */
  cornerRadiusMm?: Mm;
}

/** Luft mellan fästet och skyltens kant. */
const EDGE_MARGIN_MM = 1.5;
/** Storlekarna som prövas, störst först. */
const SCALES = [1, 0.75, 0.55, 0.4] as const;
const SHIFT_STEP_MM = 2;

/** Raderna som prövas när en yta med rundade hörn passas in. */
const ROW_STEP_MM = 0.5;
/** En egen form är en polygon, så dess rundade hörn ligger en hårsmån innanför den tänkta bågen. */
const FIT_TOLERANCE_MM = 0.05;
const EPS_MM = 1e-6;
/**
 * Raderna mäts en hårsmån innanför ytans över- och underkant. Precis i en egen
 * forms kant avgör avrundningen i dess rundade hörn om raden alls träffar formen.
 */
const ROW_INSET_MM = 0.02;

function fitsAt(doc: BadgeDocument, widthMm: Mm, heightMm: Mm, centerYMm: Mm, marginMm: Mm): boolean {
  const top = centerYMm - heightMm / 2;
  const bottom = centerYMm + heightMm / 2;
  if (top < marginMm - EPS_MM || bottom > doc.size.heightMm - marginMm + EPS_MM) return false;
  return availableHalfWidth(doc, marginMm, top, bottom) * 2 >= widthMm;
}

/** Sant när ytan ryms med hörnen rundade `radiusMm`: varje rad är smal nog för skylten på sin höjd. */
function fitsRounded(doc: BadgeDocument, widthMm: Mm, heightMm: Mm, centerYMm: Mm, marginMm: Mm, radiusMm: Mm): boolean {
  const top = centerYMm - heightMm / 2;
  const bottom = centerYMm + heightMm / 2;
  if (top < marginMm - EPS_MM || bottom > doc.size.heightMm - marginMm + EPS_MM) return false;
  const radius = Math.min(radiusMm, widthMm / 2, heightMm / 2);
  const rows = Math.max(1, Math.ceil(heightMm / ROW_STEP_MM));
  for (let i = 0; i <= rows; i++) {
    const y = Math.min(Math.max(top + (heightMm * i) / rows, top + ROW_INSET_MM), bottom - ROW_INSET_MM);
    const intoCorner = Math.max(0, top + radius - y, y - (bottom - radius));
    const neededMm = widthMm / 2 - radius + Math.sqrt(Math.max(0, radius * radius - intoCorner * intoCorner));
    if (availableHalfWidth(doc, marginMm, y, y) + FIT_TOLERANCE_MM < neededMm) return false;
  }
  return true;
}

/** Den minsta rundningen, högst `maxRadiusMm`, som får ytan att rymmas på platsen. `null` när ingen räcker. */
function roundingThatFits(
  doc: BadgeDocument,
  widthMm: Mm,
  heightMm: Mm,
  centerYMm: Mm,
  marginMm: Mm,
  maxRadiusMm: Mm,
): Mm | null {
  if (maxRadiusMm <= 0 || !fitsRounded(doc, widthMm, heightMm, centerYMm, marginMm, maxRadiusMm)) return null;
  let tooSharp = 0;
  let fits = maxRadiusMm;
  for (let i = 0; i < 8; i++) {
    const middle = (tooSharp + fits) / 2;
    if (fitsRounded(doc, widthMm, heightMm, centerYMm, marginMm, middle)) fits = middle;
    else tooSharp = middle;
  }
  return fits;
}

/**
 * Var fästet får plats: i full storlek så nära sin vanliga höjd som möjligt,
 * annars förminskat. Ett ämne har alltid fästet på sin vanliga plats.
 *
 * En yta som får rundas (`maxCornerRadiusMm`) rundas hellre i hörnen än den
 * flyttas eller förminskas: klämman på en egen form i klämmans mått ligger då
 * kant i kant och följer formens hörn.
 */
export function fitHardware(doc: BadgeDocument, footprint: HardwareFootprint): HardwareFit {
  const nominal: HardwareFit = { centerYMm: footprint.centerYMm, scale: 1 };
  if (doc.shape !== "custom") return nominal;
  const marginMm = footprint.edgeMarginMm ?? EDGE_MARGIN_MM;
  const steps = Math.ceil(doc.size.heightMm / SHIFT_STEP_MM);
  for (const scale of SCALES) {
    const widthMm = footprint.widthMm * scale;
    const heightMm = footprint.heightMm * scale;
    const maxRadiusMm = (footprint.maxCornerRadiusMm ?? 0) * scale;
    for (let step = 0; step <= steps; step++) {
      // Närmast först: den vanliga höjden, sedan lika långt nedåt och uppåt.
      for (const shift of step === 0 ? [0] : [step * SHIFT_STEP_MM, -step * SHIFT_STEP_MM]) {
        const centerYMm = footprint.centerYMm + shift;
        if (fitsAt(doc, widthMm, heightMm, centerYMm, marginMm)) return { centerYMm, scale };
        const radiusMm = roundingThatFits(doc, widthMm, heightMm, centerYMm, marginMm, maxRadiusMm);
        if (radiusMm !== null) return { centerYMm, scale, cornerRadiusMm: radiusMm / scale };
      }
    }
  }
  return { centerYMm: footprint.centerYMm, scale: SCALES[SCALES.length - 1] ?? 1 };
}

/** Klämmans egen hörnrundning, uppskattad från foto. */
const CLIP_CORNER_MM = 1.2;

/**
 * Så passas klämman in på en egen form: ända ut i kanten, och med hörnen
 * rundade så mycket som formens hörn kräver.
 */
export const CLIP_FIT = { edgeMarginMm: 0, maxCornerRadiusMm: 6 } as const;

/** Klämmans platta på skyltens baksida, i mm. */
interface ClipPlate {
  /** Längs klämman. */
  longMm: Mm;
  /** Tvärs över klämman. */
  wideMm: Mm;
  cornerRadiusMm: Mm;
}

/**
 * Klämmans platta är 80 × 25 mm, lika stor som den minsta skylt klämman får
 * sitta på (`CLIP_MIN`): skylten ligger kant i kant med klämman, varken
 * innanför eller utanför (besked av ägaren 2026-11-18). På Lång rektangel
 * täcker plattan alltså hela baksidan och har skyltens hörnrundning. På en
 * större skylt är klämman lika stor som alltid och sitter mitt på.
 *
 * En äldre skylt som är mindre än klämman får den i skyltens mått, och på en
 * oval eller kudde kortas den till det som ryms. En egen form passas in av
 * `fitHardware` med `CLIP_FIT`.
 */
export function clipPlate(doc: BadgeDocument): ClipPlate {
  const vertical = clipOrientationOf(doc) === "vertical";
  const alongMm = vertical ? doc.size.heightMm : doc.size.widthMm;
  const acrossMm = vertical ? doc.size.widthMm : doc.size.heightMm;
  const longMm = Math.min(alongMm, CLIP_MIN.longMm);
  const wideMm = Math.min(acrossMm, CLIP_MIN.shortMm);
  const plain: ClipPlate = { longMm, wideMm, cornerRadiusMm: CLIP_CORNER_MM };
  if (doc.shape === "custom") return plain;
  if (hasStraightSides(doc.shape)) {
    // Plattans hörn når in i skyltens rundade hörn först när det ligger nära kanten åt båda håll.
    const cornerMm = effectiveCornerRadius(doc);
    const endGapMm = (alongMm - longMm) / 2;
    const sideGapMm = (acrossMm - wideMm) / 2;
    const reaches =
      endGapMm < cornerMm && sideGapMm < cornerMm && (cornerMm - endGapMm) ** 2 + (cornerMm - sideGapMm) ** 2 > cornerMm ** 2;
    if (!reaches) return plain;
    const radiusMm = cornerMm - Math.min(endGapMm, sideGapMm);
    return { longMm, wideMm, cornerRadiusMm: Math.min(Math.max(radiusMm, CLIP_CORNER_MM), longMm / 2, wideMm / 2) };
  }
  if (vertical) return plain;
  // Oval, kudde och månghörning är smalare där klämmans hörn hamnar.
  const roomMm = availableHalfWidth(doc, 0, (acrossMm - wideMm) / 2, (acrossMm + wideMm) / 2) * 2;
  return { ...plain, longMm: Math.max(Math.min(longMm, roomMm), wideMm) };
}
