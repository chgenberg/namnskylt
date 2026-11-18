import { getMaterial } from "./catalog";
import { printColorHex, printColorText } from "./color-code";
import type { BadgeDocument, MarkingMethod, MarkingMode, MaterialId } from "./types";

/**
 * Märkningsmetoden: hur namnet och loggan hamnar på skylten. Gravyr fräser ner
 * i ytan, print trycker på den. En metod ingår i skylten; att kombinera båda
 * är ett eget val med eget pris i prismodellen (beslut av ägaren 2026-11-16).
 */
export interface MarkingMethodInfo {
  id: MarkingMethod;
  name: string;
  description: string;
  /** Namnet, alltså skyltens text och ram. */
  nameMode: MarkingMode;
  logoMode: MarkingMode;
  /** Båda metoderna på samma skylt. Går bara att välja när skylten har en logga. */
  combined: boolean;
}

export const MARKING_METHODS: readonly MarkingMethodInfo[] = [
  { id: "engrave", name: "Endast gravyr", description: "Namn och logotyp graveras", nameMode: "engrave", logoMode: "engrave", combined: false },
  { id: "print", name: "Endast print", description: "Namn och logotyp printas", nameMode: "print", logoMode: "print", combined: false },
  {
    id: "engrave-name-print-logo",
    name: "Namn graveras · logotyp printas",
    description: "Kombinerad märkning",
    nameMode: "engrave",
    logoMode: "print",
    combined: true,
  },
  {
    id: "print-name-engrave-logo",
    name: "Namn printas · logotyp graveras",
    description: "Kombinerad märkning",
    nameMode: "print",
    logoMode: "engrave",
    combined: true,
  },
];

export const MARKING_METHOD_IDS = ["engrave", "print", "engrave-name-print-logo", "print-name-engrave-logo"] as const satisfies readonly MarkingMethod[];

export const MARKING_MODE_NAME: Record<MarkingMode, string> = { engrave: "Gravyr", print: "Print" };

export function getMarkingMethod(id: MarkingMethod): MarkingMethodInfo {
  const method = MARKING_METHODS.find((m) => m.id === id);
  if (!method) throw new Error(`Okänd märkningsmetod: ${id}`);
  return method;
}

type Marked = Pick<BadgeDocument, "marking" | "logo">;

/** Hur namnet märks. En skylt utan vald metod graveras, som alla skyltar gjorde före valet fanns. */
export function nameMarking(doc: Pick<BadgeDocument, "marking">): MarkingMode {
  return doc.marking ? getMarkingMethod(doc.marking).nameMode : "engrave";
}

/**
 * Hur loggan märks. Utan vald metod avgör loggan själv, som förut: en logga i
 * färg trycks och en svartvit graveras.
 */
export function logoMarking(doc: Marked): MarkingMode {
  if (doc.marking) return getMarkingMethod(doc.marking).logoMode;
  return doc.logo?.image ? "print" : "engrave";
}

/** Metoden för ett läge på namnet och ett på loggan. */
export function markingFor(name: MarkingMode, logo: MarkingMode): MarkingMethod {
  if (name === logo) return name;
  return name === "engrave" ? "engrave-name-print-logo" : "print-name-engrave-logo";
}

/**
 * Metoden som gäller för skylten, den som ritas, tillverkas och prissätts.
 * En skylt utan logga har bara namnets metod, så ett kombinerat val faller
 * tillbaka dit när loggan tas bort.
 */
export function markingOf(doc: Marked): MarkingMethod {
  const name = nameMarking(doc);
  return doc.logo ? markingFor(name, logoMarking(doc)) : name;
}

type MarkedBadge = Marked & Pick<BadgeDocument, "materialId">;

/**
 * Materialet graveras inte: det går bara att printa på (beslut av ägaren 2026-11-18: "det
 * ska inte gå att gravera i metall"). Gäller metallen, se `BadgeMaterial.printOnly`.
 */
export function isPrintOnly(materialId: MaterialId): boolean {
  return getMaterial(materialId).printOnly === true;
}

/**
 * Om metoden går att välja på skylten. På ett material som bara printas finns bara
 * "Endast print". De kombinerade metoderna kräver en logga.
 */
export function markingFits(method: MarkingMethod, doc: Pick<BadgeDocument, "logo" | "materialId">): boolean {
  if (isPrintOnly(doc.materialId)) return method === "print";
  return Boolean(doc.logo) || !getMarkingMethod(method).combined;
}

/** Metoden skylten har går att få på dess material: en metallskylt som graveras säljs inte. */
export function hasFittingMarking(doc: MarkedBadge): boolean {
  return markingFits(markingOf(doc), doc);
}

/**
 * Skylten med en vald metod. Fältet sparas bara när valet skiljer sig från det
 * skylten får av sig själv, så att en skylt som ingen har rört metoden på ser
 * ut precis som en äldre skylt. En metod som inte finns på materialet blir den
 * som finns: på metall alltid print.
 */
export function withMarking<T extends MarkedBadge>(doc: T, method: MarkingMethod): T {
  const rest = { ...doc };
  delete rest.marking;
  const wanted = isPrintOnly(doc.materialId) ? "print" : markingFits(method, doc) ? method : getMarkingMethod(method).nameMode;
  return markingOf(rest) === wanted ? rest : { ...rest, marking: wanted };
}

/**
 * Metoden som föreslås när skylten får en ny logga: namnet behåller sin metod,
 * en logga i färg trycks och en svartvit följer namnet. Kunden kan byta sedan.
 */
export function withLogoMarking<T extends MarkedBadge>(doc: T): T {
  if (!doc.logo) return withMarking(doc, nameMarking(doc));
  const name = nameMarking(doc);
  return withMarking(doc, markingFor(name, doc.logo.image ? "print" : name));
}

/**
 * Skylten med materialets förvalda metod, när materialet har bytts: på ett material som
 * bara printas är det print. På ett som graveras, som plasten, börjar skylten om på gravyr
 * (en logga i färg trycks), eftersom print bara var valt för att metallen krävde det.
 */
export function withMaterialMarking<T extends MarkedBadge>(doc: T): T {
  const rest = { ...doc };
  delete rest.marking;
  return isPrintOnly(doc.materialId) ? withMarking(rest, "print") : withLogoMarking(rest);
}

/** Längsta färgkod kunden får ange för trycket, och för en rad. */
export const PRINT_COLOR_MAX = 40;
/** Loggans fält är längre: en logga kan ha flera färger, som skrivs efter varandra. */
export const LOGO_PRINT_COLOR_MAX = 120;

/** Det kunden skriver som färgkod, utan styrtecken och inom längden. Blanktecken i kanterna får stå kvar medan man skriver. */
export function cleanPrintColor(raw: string, maxLength: number = PRINT_COLOR_MAX): string {
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength);
}

type Printed = Marked & Pick<BadgeDocument, "printColor">;
type PrintedRow = Pick<BadgeDocument["rows"][number], "text" | "printColor">;

/**
 * Kundens färgkod för trycket (beslut av ägaren 2026-11-16), när något på
 * skylten faktiskt printas. Annars `null`: en kod som står kvar efter att
 * kunden bytt till gravyr ska inte följa med ordern.
 */
export function printColorOf(doc: Printed): string | null {
  const code = doc.printColor?.trim();
  if (!code) return null;
  const printed = nameMarking(doc) === "print" || (Boolean(doc.logo) && logoMarking(doc) === "print");
  return printed ? code : null;
}

/**
 * Färgen trycket ritas i när kundens kod för hela trycket går att rita, alltså
 * är CMYK eller hex: ramen, en svartvit logga som printas och rader utan egen
 * kod. Annars `null`, och trycket visas i gravyrens färg.
 */
export function printInkOf(doc: Printed): string | null {
  return printColorHex(printColorOf(doc));
}

/**
 * Radens egen färgkod (besked via ägaren 2026-11-17), när namnet printas.
 * Gravyr har en enda färg, materialets, så där gäller koden inte. Samma regel
 * som i verkstadens eget format.
 */
export function rowPrintColorOf(doc: Pick<BadgeDocument, "marking">, row: PrintedRow): string | null {
  const code = row.printColor?.trim();
  return code && nameMarking(doc) === "print" ? code : null;
}

/**
 * Färgen raden ritas i: radens egen kod, annars koden för hela trycket. En rad
 * med en egen kod som inte går att rita (PMS) visas i gravyrens färg, inte i
 * tryckets, eftersom den inte ska få den färgen.
 */
export function rowPrintInkOf(doc: Printed, row: PrintedRow): string | null {
  if (nameMarking(doc) !== "print") return null;
  const own = rowPrintColorOf(doc, row);
  return own ? printColorHex(own) : printInkOf(doc);
}

/**
 * Loggans egna färgkoder (besked via ägaren 2026-11-17), när loggan printas.
 * Fritext, eftersom en logga i färg kan ha flera färger. En logga som graveras
 * får materialets färg, så där gäller koderna inte.
 */
export function logoPrintColorOf(doc: Marked): string | null {
  const code = doc.logo?.printColor?.trim();
  return code && logoMarking(doc) === "print" ? code : null;
}

/**
 * Färgen en svartvit logga som printas ritas i: loggans egen kod, annars koden
 * för hela trycket. Samma regel som för en rad: en egen kod som inte går att
 * rita ger gravyrens färg. En logga i färg trycks som bild och har ingen
 * sådan färg.
 */
export function logoPrintInkOf(doc: Printed): string | null {
  if (!doc.logo || logoMarking(doc) !== "print") return null;
  const own = logoPrintColorOf(doc);
  return own ? printColorHex(own) : printInkOf(doc);
}

/**
 * `Tryckfärg CMYK 100/60/0/20, rad 2 #C8102E, logga PMS 286 C` för listor och
 * underlag, eller `null` när ingen kod gäller. Raderna räknas som de står på
 * skylten, alltså utan tomma rader. Loggan står sist, eftersom dess fält är
 * fritext och kan innehålla kommatecken.
 */
export function printColorLabel(doc: Printed & { rows: readonly PrintedRow[] }): string | null {
  const whole = printColorOf(doc);
  const rows = doc.rows
    .filter((row) => row.text.trim().length > 0)
    .flatMap((row, i) => {
      const code = rowPrintColorOf(doc, row);
      return code ? [`rad ${i + 1} ${printColorText(code)}`] : [];
    });
  const logo = logoPrintColorOf(doc);
  const parts = [...(whole ? [printColorText(whole)] : []), ...rows, ...(logo ? [`logga ${printColorText(logo)}`] : [])];
  return parts.length > 0 ? `Tryckfärg ${parts.join(", ")}` : null;
}
