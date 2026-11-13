import {
  BLANKS,
  OFFERED_MATERIALS,
  SHAPES,
  TEXT_LIMITS,
  getBlank,
  getColor,
  getMaterial,
  getMounting,
  type BadgeBlank,
} from "./catalog";
import type { BadgeDocument, BadgeTextRow, BlankId, MaterialFinish, Mm } from "./types";

/** Versalhöjd per rad i ett nytt dokument: namn stort, titel mindre. */
const DEFAULT_ROW_CAP_MM: readonly Mm[] = [6, 3.4, 2.8];

/**
 * Delar den smarta rutans text i rader. "Anna Lindqvist, Projektledare" och
 * "Anna Lindqvist | Projektledare" blir två rader. Bindestreck inne i ett ord
 * ("Lars-Erik") delar inte — bara streck med mellanslag runt.
 */
export function parseSmartInput(raw: string): string[] {
  return raw
    .split(/\n|\||,|\s[-–—]\s/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 0)
    .slice(0, TEXT_LIMITS.maxRows)
    .map((part) => part.slice(0, TEXT_LIMITS.maxChars));
}

/** Id:t måste vara deterministiskt — dokumentet skapas både på servern och i klienten. */
export function createRow(index: number, text = "", id = `row-${index}`): BadgeTextRow {
  return {
    id,
    text,
    capHeightMm: DEFAULT_ROW_CAP_MM[index] ?? DEFAULT_ROW_CAP_MM.at(-1)!,
    bold: index === 0,
  };
}

export function createBadgeDocument(texts: readonly string[] = []): BadgeDocument {
  const rows = (texts.length > 0 ? texts : [""]).map((text, i) => createRow(i, text));
  return {
    version: 1,
    materialId: "metal",
    colorId: "metal-gold",
    ...blankGeometry(getBlank("rectangle")),
    frame: { style: "none", insetMm: 1.5, thicknessMm: 0.4 },
    font: "arial",
    align: "center",
    rows,
    mounting: "pin",
    quantity: 1,
  };
}

function blankGeometry(blank: BadgeBlank): Pick<BadgeDocument, "shape" | "size" | "cornerRadiusMm"> {
  return {
    shape: blank.shape,
    size: { widthMm: blank.widthMm, heightMm: blank.heightMm },
    cornerRadiusMm: blank.cornerRadiusMm,
  };
}

/** Ämnet dokumentet är ritat på, eller `null` för en äldre skylt med fritt mått. */
export function blankOf(doc: Pick<BadgeDocument, "shape" | "size" | "cornerRadiusMm">): BadgeBlank | null {
  return (
    BLANKS.find(
      (b) =>
        b.shape === doc.shape &&
        b.widthMm === doc.size.widthMm &&
        b.heightMm === doc.size.heightMm &&
        (b.shape !== "rounded" || b.cornerRadiusMm === doc.cornerRadiusMm),
    ) ?? null
  );
}

/** Formens namn så som kunden valde den: ämnets namn, eller formens för en äldre skylt med fritt mått. */
export function shapeLabel(doc: Pick<BadgeDocument, "shape" | "size" | "cornerRadiusMm">): string {
  return blankOf(doc)?.name ?? SHAPES.find((s) => s.id === doc.shape)?.name ?? doc.shape;
}

/** Byter ämne: form, mått och hörnradie följer med, allt annat ligger kvar. */
export function withBlank(doc: BadgeDocument, blankId: BlankId): BadgeDocument {
  return { ...doc, ...blankGeometry(getBlank(blankId)) };
}

/** Ämnet som ligger närmast en äldre skylt: samma formfamilj först, sedan närmast i höjd. */
function nearestBlank(doc: BadgeDocument): BadgeBlank {
  const family = (shape: BadgeDocument["shape"]) =>
    shape === "oval" || shape === "round" ? "ellipse" : shape === "cushion" ? "cushion" : "rect";
  const sameFamily = BLANKS.filter((b) => family(b.shape) === family(doc.shape));
  const candidates = sameFamily.length > 0 ? sameFamily : BLANKS;
  return candidates.reduce((best, b) =>
    Math.abs(b.heightMm - doc.size.heightMm) < Math.abs(best.heightMm - doc.size.heightMm) ? b : best,
  );
}

const METAL_FINISHES: ReadonlySet<MaterialFinish> = new Set(["aluminium", "steel", "brass"]);

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = channels(a);
  const [r2, g2, b2] = channels(b);
  return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
}

/** Går att beställa i dag: ett material som säljs, i en av dess ytor, på ett av ämnena, med ett fäste som säljs. */
export function isOfferedDocument(doc: BadgeDocument): boolean {
  const material = getMaterial(doc.materialId);
  return (
    material.offered &&
    material.colors.some((c) => c.id === doc.colorId) &&
    blankOf(doc) !== null &&
    getMounting(doc.mounting).offered
  );
}

/**
 * En skylt i dagens sortiment. Delade länkar och äldre skyltar kan bära ett
 * material, ett mått eller ett fäste som inte säljs längre; de flyttas till
 * närmaste yta, ämne och fäste. Text, logga och ram rörs inte.
 */
export function toOfferedDocument(doc: BadgeDocument): BadgeDocument {
  const offeredMaterial = getMaterial(doc.materialId).offered;
  const onBlank = blankOf(doc) !== null;
  const offeredMounting = getMounting(doc.mounting).offered;
  if (offeredMaterial && onBlank && offeredMounting) return doc;

  const material = OFFERED_MATERIALS[0];
  if (!material) return doc;
  const surface = getColor(doc.materialId, doc.colorId).surface;
  // Ljus metall ligger nära vitt i färg men ska bli borstad metall, inte vit lack.
  const wasMetal = METAL_FINISHES.has(getMaterial(doc.materialId).finish);
  const brushed = material.colors.filter((c) => !c.lacquered);
  const candidates = wasMetal && brushed.length > 0 ? brushed : material.colors;
  const color = candidates.reduce((best, c) =>
    colorDistance(c.surface, surface) < colorDistance(best.surface, surface) ? c : best,
  );
  return {
    ...doc,
    ...(offeredMaterial ? {} : { materialId: material.id, colorId: color.id }),
    ...(onBlank ? {} : blankGeometry(nearestBlank(doc))),
    // Säkerhetsnålen är en nål; den vanliga nålen är närmast.
    ...(offeredMounting ? {} : { mounting: "pin" as const }),
  };
}

/** Text som faktiskt graveras — tomma rader kostar inget och ritas inte. */
export function engravedRows(doc: BadgeDocument): BadgeTextRow[] {
  return doc.rows.filter((row) => row.text.trim().length > 0);
}
