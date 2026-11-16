import {
  BLANKS,
  CUSTOM_SHAPE_LIMITS,
  OFFERED_MATERIALS,
  SHAPES,
  TEXT_LIMITS,
  getBlank,
  getColor,
  getMaterial,
  getMounting,
  mountingFits,
  type BadgeBlank,
  type BadgeMaterial,
  type ColorCombo,
} from "./catalog";
import { customOutlineIssue, scaleOutline } from "./custom-outline";
import { getShapePreset, presetOutline } from "./shape-presets";
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

/** Formens namn så som kunden valde den: ämnets namn, "Egen form", eller formens för en äldre skylt med fritt mått. */
export function shapeLabel(doc: Pick<BadgeDocument, "shape" | "size" | "cornerRadiusMm">): string {
  return blankOf(doc)?.name ?? SHAPES.find((s) => s.id === doc.shape)?.name ?? doc.shape;
}

/** Byter ämne: form, mått och hörnradie följer med, allt annat ligger kvar. En egen kontur släpps. */
export function withBlank(doc: BadgeDocument, blankId: BlankId): BadgeDocument {
  const rest = { ...doc };
  delete rest.customOutline;
  return { ...rest, ...blankGeometry(getBlank(blankId)) };
}

/** Byter till egen form utifrån ett formförslag, i förslagets mått. */
export function withShapePreset(doc: BadgeDocument, presetId: string): BadgeDocument {
  const preset = getShapePreset(presetId);
  return {
    ...doc,
    shape: "custom",
    size: { widthMm: preset.widthMm, heightMm: preset.heightMm },
    cornerRadiusMm: preset.cornerRadiusMm,
    customOutline: presetOutline(preset),
  };
}

function clampSide(value: Mm): Mm {
  return Math.min(CUSTOM_SHAPE_LIMITS.maxSideMm, Math.max(CUSTOM_SHAPE_LIMITS.minSideMm, Math.round(value)));
}

/** Nytt mått på en egen form: konturen skalas med, så att formen behåller sitt utseende. */
export function resizeCustomShape(doc: BadgeDocument, size: { widthMm?: Mm; heightMm?: Mm }): BadgeDocument {
  if (doc.shape !== "custom") return doc;
  const next = { widthMm: clampSide(size.widthMm ?? doc.size.widthMm), heightMm: clampSide(size.heightMm ?? doc.size.heightMm) };
  return { ...doc, size: next, customOutline: scaleOutline(doc.customOutline ?? [], doc.size, next) };
}

/** En egen form som går att skära: i ett material som tillåter det, inom måttet och utan fel i konturen. */
export function isValidCustomShape(doc: BadgeDocument): boolean {
  const { minSideMm, maxSideMm, maxCornerRadiusMm } = CUSTOM_SHAPE_LIMITS;
  const { widthMm, heightMm } = doc.size;
  return (
    doc.shape === "custom" &&
    getMaterial(doc.materialId).customShape === true &&
    widthMm >= minSideMm &&
    widthMm <= maxSideMm &&
    heightMm >= minSideMm &&
    heightMm <= maxSideMm &&
    doc.cornerRadiusMm <= maxCornerRadiusMm &&
    customOutlineIssue(doc.customOutline ?? [], doc.size) === null
  );
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

/**
 * Går att beställa i dag: ett material som säljs, i en av dess ytor, på ett av
 * ämnena eller i en giltig egen form, med ett fäste som säljs och finns på materialet.
 */
export function isOfferedDocument(doc: BadgeDocument): boolean {
  const material = getMaterial(doc.materialId);
  return (
    material.offered &&
    material.colors.some((c) => c.id === doc.colorId) &&
    (blankOf(doc) !== null || isValidCustomShape(doc)) &&
    getMounting(doc.mounting).offered &&
    mountingFits(doc.mounting, doc.materialId)
  );
}

/** Ytan i `material` som ligger närmast skyltens nuvarande färg. */
function nearestColor(doc: BadgeDocument, material: BadgeMaterial): ColorCombo {
  const surface = getColor(doc.materialId, doc.colorId).surface;
  // Ljus metall ligger nära vitt i färg men ska bli borstad metall, inte vit lack.
  const wasMetal = METAL_FINISHES.has(getMaterial(doc.materialId).finish);
  const brushed = material.colors.filter((c) => !c.lacquered);
  const candidates = wasMetal && brushed.length > 0 ? brushed : material.colors;
  return candidates.reduce((best, c) => (colorDistance(c.surface, surface) < colorDistance(best.surface, surface) ? c : best));
}

const PLASTIC_FINISHES: ReadonlySet<MaterialFinish> = new Set(["plastic", "acrylic", "epoxy"]);

/** Materialet i dagens sortiment som ligger närmast ett äldre: plast blir plast, metall blir metall. */
function nearestOfferedMaterial(doc: BadgeDocument) {
  const wasPlastic = PLASTIC_FINISHES.has(getMaterial(doc.materialId).finish);
  return OFFERED_MATERIALS.find((m) => PLASTIC_FINISHES.has(m.finish) === wasPlastic) ?? OFFERED_MATERIALS[0];
}

/**
 * En skylt i dagens sortiment. Delade länkar och äldre skyltar kan bära ett
 * material, ett mått eller ett fäste som inte säljs längre; de flyttas till
 * närmaste material, yta, ämne och fäste. Text, logga och ram rörs inte.
 */
export function toOfferedDocument(doc: BadgeDocument): BadgeDocument {
  const offeredMaterial = getMaterial(doc.materialId).offered;
  const material = offeredMaterial ? getMaterial(doc.materialId) : nearestOfferedMaterial(doc);
  if (!material) return doc;
  const offeredColor = offeredMaterial && material.colors.some((c) => c.id === doc.colorId);
  const moved: BadgeDocument = offeredColor ? doc : { ...doc, materialId: material.id, colorId: nearestColor(doc, material).id };
  const offeredShape = blankOf(moved) !== null || isValidCustomShape(moved);
  // Fästet ska både säljas och finnas på materialet skylten hamnar på: klämman finns inte på metall.
  const offeredMounting = getMounting(doc.mounting).offered && mountingFits(doc.mounting, moved.materialId);
  if (offeredColor && offeredShape && offeredMounting) return doc;
  return {
    ...(offeredShape ? moved : withBlank(moved, nearestBlank(moved).id)),
    // Säkerhetsnålen är en nål; den vanliga nålen är närmast. Den gäller också när fästet inte finns på materialet.
    ...(offeredMounting ? {} : { mounting: "pin" as const }),
  };
}

/** Text som faktiskt graveras — tomma rader kostar inget och ritas inte. */
export function engravedRows(doc: BadgeDocument): BadgeTextRow[] {
  return doc.rows.filter((row) => row.text.trim().length > 0);
}
