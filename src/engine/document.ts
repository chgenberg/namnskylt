import {
  BLANKS,
  CUSTOM_SHAPE_LIMITS,
  OFFERED_MATERIALS,
  SHAPES,
  TEXT_LIMITS,
  blankArticle,
  blankFits,
  clipOrientations,
  getBlank,
  getColor,
  getMaterial,
  getMounting,
  mountingFits,
  type BadgeBlank,
  type BadgeMaterial,
  type BlankArticle,
  type ColorCombo,
  offeredColors,
} from "./catalog";
import { customOutlineIssue, scaleOutline } from "./custom-outline";
import { getShapePreset, presetOutline } from "./shape-presets";
import type { BadgeDocument, BadgeTextRow, BlankId, ClipOrientation, MaterialFinish, Mm, MountingId } from "./types";

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

/** Ämnet en ny skylt börjar på: metallens rektangel, 60 × 30 mm. */
const DEFAULT_BLANK: BlankId = "metal-rectangle";

export function createBadgeDocument(texts: readonly string[] = []): BadgeDocument {
  const rows = (texts.length > 0 ? texts : [""]).map((text, i) => createRow(i, text));
  return {
    version: 1,
    materialId: "metal",
    colorId: "metal-gold",
    ...blankGeometry(getBlank(DEFAULT_BLANK)),
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

/**
 * Ämnet på skyltens material som ligger närmast skylten: samma formfamilj
 * först, sedan närmast i mått. Metallens och plastens ämnen har olika mått,
 * så ett byte av material byter också ämne: rektangel blir rektangel, oval
 * blir oval och TV-brickan blir kudde.
 */
function nearestBlank(doc: BadgeDocument): BadgeBlank {
  const family = (shape: BadgeDocument["shape"]) =>
    shape === "oval" || shape === "round" ? "ellipse" : shape === "cushion" ? "cushion" : "rect";
  const offered = BLANKS.filter((b) => blankFits(b, doc.materialId));
  const sameFamily = offered.filter((b) => family(b.shape) === family(doc.shape));
  const candidates = sameFamily.length > 0 ? sameFamily : offered;
  const distance = (b: BadgeBlank) => Math.abs(b.widthMm - doc.size.widthMm) + Math.abs(b.heightMm - doc.size.heightMm);
  // Vid lika avstånd gäller det som står först i katalogen.
  return candidates.reduce((best, b) => (distance(b) < distance(best) ? b : best));
}

/**
 * Skylten på ett ämne som finns på dess material. En skylt som redan ligger
 * på ett sådant, eller har en egen form i ett material som tillåter det, rörs
 * inte. Annars flyttas den till närmaste ämne, till exempel när materialet byts.
 */
export function withFittingBlank(doc: BadgeDocument): BadgeDocument {
  return hasOfferedBlank(doc) || isValidCustomShape(doc) ? doc : withBlank(doc, nearestBlank(doc).id);
}

/** Verkstadens artikel för skylten, när den ligger på ett färdigt ämne: benämningen och plåtens tjocklek. */
export function blankArticleOf(doc: Pick<BadgeDocument, "shape" | "size" | "cornerRadiusMm" | "colorId">): BlankArticle | null {
  const blank = blankOf(doc);
  return blank ? blankArticle(blank, doc.colorId) : null;
}

/** Skyltens tjocklek: ämnets i den valda ytan när den är känd, annars materialets. */
export function thicknessOf(doc: Pick<BadgeDocument, "materialId" | "shape" | "size" | "cornerRadiusMm" | "colorId">): Mm {
  return blankArticleOf(doc)?.thicknessMm ?? getMaterial(doc.materialId).thicknessMm;
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

/** Skylten ligger på ett ämne som finns på dess material. */
function hasOfferedBlank(doc: BadgeDocument): boolean {
  const blank = blankOf(doc);
  return blank !== null && blankFits(blank, doc.materialId);
}

/**
 * Sant när fästet går att få på just den här skylten: det finns på materialet,
 * och klämman ryms på måttet i någon riktning. Utan `mountingId` prövas
 * skyltens eget fäste.
 */
export function mountingFitsDocument(
  doc: Pick<BadgeDocument, "materialId" | "size" | "mounting">,
  mountingId: MountingId = doc.mounting,
): boolean {
  if (!mountingFits(mountingId, doc.materialId)) return false;
  return mountingId !== "clip" || clipOrientations(doc.size).length > 0;
}

/**
 * Riktningen klämman sitter i: den valda när den ryms, annars den som ryms,
 * liggande först. `null` när fästet inte är klämma eller klämman inte ryms.
 */
export function clipOrientationOf(doc: Pick<BadgeDocument, "mounting" | "size" | "clipOrientation">): ClipOrientation | null {
  if (doc.mounting !== "clip") return null;
  const fitting = clipOrientations(doc.size);
  return doc.clipOrientation && fitting.includes(doc.clipOrientation) ? doc.clipOrientation : (fitting[0] ?? null);
}

/** Fästets namn så som det ska läsas av kund och verkstad: klämman med sin riktning. */
export function mountingLabel(doc: Pick<BadgeDocument, "mounting" | "size" | "clipOrientation">): string {
  const { name } = getMounting(doc.mounting);
  const orientation = clipOrientationOf(doc);
  if (!orientation) return name;
  return `${name}, ${orientation === "vertical" ? "vertikalt" : "horisontellt"}`;
}

/** Byter fäste. Riktningen hör till klämman och följer inte med till ett annat fäste. */
export function withMounting(doc: BadgeDocument, mountingId: MountingId): BadgeDocument {
  const rest = { ...doc, mounting: mountingId };
  if (mountingId !== "clip") delete rest.clipOrientation;
  return rest;
}

/**
 * Skylten efter att materialet, formen eller måttet har ändrats: en klämma som
 * inte längre ryms eller finns byts mot nålen, och en riktning som inte ryms
 * släpps, så att den som ryms gäller.
 */
export function withFittingMounting(doc: BadgeDocument): BadgeDocument {
  if (!mountingFitsDocument(doc)) return withMounting(doc, "pin");
  if (doc.clipOrientation && clipOrientationOf(doc) !== doc.clipOrientation) {
    const rest = { ...doc };
    delete rest.clipOrientation;
    return rest;
  }
  return doc;
}

/**
 * Går att beställa i dag: ett material som säljs, i en av dess ytor, på ett av
 * materialets ämnen eller i en giltig egen form, med ett fäste som säljs och
 * går att få på skylten (klämman kräver plast och minst 80 × 25 mm).
 */
export function isOfferedDocument(doc: BadgeDocument): boolean {
  const material = getMaterial(doc.materialId);
  return (
    material.offered &&
    offeredColors(material).some((c) => c.id === doc.colorId) &&
    (hasOfferedBlank(doc) || isValidCustomShape(doc)) &&
    getMounting(doc.mounting).offered &&
    mountingFitsDocument(doc)
  );
}

/** Ytan i `material` som ligger närmast skyltens nuvarande färg. */
function nearestColor(doc: BadgeDocument, material: BadgeMaterial): ColorCombo {
  const surface = getColor(doc.materialId, doc.colorId).surface;
  // Ljus metall ligger nära vitt i färg men ska bli borstad metall, inte vit lack.
  const wasMetal = METAL_FINISHES.has(getMaterial(doc.materialId).finish);
  const colors = offeredColors(material);
  const brushed = colors.filter((c) => !c.lacquered);
  const candidates = wasMetal && brushed.length > 0 ? brushed : colors;
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
  const sold = offeredColors(material).some((c) => c.id === doc.colorId);
  const offeredColor = offeredMaterial && sold;
  // Finns samma kombination i det nya materialet (äldre plast till dagens plast) behålls den. Annars den som
  // ligger närmast: en kombination som har utgått blir samma framsida med en gravyrfärg som säljs.
  const colorId = sold ? doc.colorId : nearestColor(doc, material).id;
  const moved: BadgeDocument = offeredColor ? doc : { ...doc, materialId: material.id, colorId };
  const offeredShape = hasOfferedBlank(moved) || isValidCustomShape(moved);
  const shaped = offeredShape ? moved : withBlank(moved, nearestBlank(moved).id);
  // Fästet ska både säljas och gå att få på skylten där den hamnar: klämman finns inte på metall
  // och inte på en skylt under 80 × 25 mm.
  const offeredMounting = getMounting(doc.mounting).offered && mountingFitsDocument(shaped);
  if (offeredColor && offeredShape && offeredMounting) return doc;
  // Säkerhetsnålen är en nål; den vanliga nålen är närmast. Den gäller också när fästet inte går att få på skylten.
  return offeredMounting ? shaped : withMounting(shaped, "pin");
}

/** Text som faktiskt graveras — tomma rader kostar inget och ritas inte. */
export function engravedRows(doc: BadgeDocument): BadgeTextRow[] {
  return doc.rows.filter((row) => row.text.trim().length > 0);
}

/**
 * Skylten har inget på sig än: ingen text och ingen logga. Bara då ritar editorn grå
 * platshållare ("Ditt namn") för att visa var texten hamnar. En skylt med logga men utan
 * text är en färdig skylt utan namn, och en tom rad bredvid en ifylld är en rad utan text.
 */
export function isBlankBadge(doc: Pick<BadgeDocument, "rows" | "logo">): boolean {
  return !doc.logo && doc.rows.every((row) => row.text.trim().length === 0);
}
