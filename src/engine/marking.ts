import { getColor, getMaterial } from "./catalog";
import { INVISIBLE_CONTRAST, contrastRatio } from "./color-choice";
import { cmykOf, cmykText, isPrintHex, printColorHex, printColorText, printHex } from "./color-code";
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

/**
 * Ramen finns bara på plastskyltar (beslut av ägaren 2026-11-18: "Graverad ram ska endast
 * gälla för plastskyltar. Inget valbart alternativ vid metall"). Regeln följer materialet:
 * ett material som bara printas har ingen ram.
 */
export function frameFits(materialId: MaterialId): boolean {
  return !isPrintOnly(materialId);
}

type FramedBadge = Pick<BadgeDocument, "frame" | "materialId">;

/** Skyltens ram går att få på dess material: en metallskylt med ram säljs inte. */
export function hasFittingFrame(doc: FramedBadge): boolean {
  return doc.frame.style === "none" || frameFits(doc.materialId);
}

/** Skylten utan ram, när dess material inte har någon. En äldre skylt ritas ändå med sin ram tills den görs om. */
export function withFittingFrame<T extends FramedBadge>(doc: T): T {
  return hasFittingFrame(doc) ? doc : { ...doc, frame: { ...doc.frame, style: "none" } };
}

/**
 * Ramen i skyltens specifikation, "Ram" eller "Dubbel ram", eller `null` utan ram. Ramen kostar
 * extra sedan 2026-11-20, så den står där priset står: på offert och ordersidor.
 */
export function frameLabel(doc: Pick<BadgeDocument, "frame">): string | null {
  if (doc.frame.style === "none") return null;
  return doc.frame.style === "double" ? "Dubbel ram" : "Ram";
}

/** Längsta färgkod en äldre skylt får bära för trycket, och för en rad. I dag sparas bara `#RRGGBB`. */
export const PRINT_COLOR_MAX = 40;
/** En äldre logga kan bära flera koder efter varandra. I dag har loggan ingen egen färg. */
export const LOGO_PRINT_COLOR_MAX = 120;

/**
 * Tryckets färg är en skärmfärg, `#RRGGBB`, eller en CMYK-kod som kunden själv har angett
 * (beslut av ägaren 2026-11-20: tryckfilen är i CMYK, och kunden ska kunna välja värdena själv).
 * Från 2026-11-18 till 2026-11-20 gällde bara skärmfärger. Loggan har ingen egen färg. En skylt
 * med en kod som inte går att trycka efter, som PMS, säljs inte som den är.
 */
export function hasScreenPrintColors(doc: Pick<BadgeDocument, "printColor" | "rows" | "logo">): boolean {
  const fine = (code: string | undefined) => code === undefined || isPrintHex(code) || cmykOf(code) !== null;
  return fine(doc.printColor) && doc.rows.every((row) => fine(row.printColor)) && doc.logo?.printColor === undefined;
}

/** Tryckets färg som den sparas: skärmfärgen, eller CMYK-koden på samma form hur kunden än skrev den. `null` för allt annat. */
export function printColorCode(input: string): string | null {
  const cmyk = cmykOf(input);
  return printHex(input) ?? (cmyk ? cmykText(cmyk) : null);
}

/**
 * Skylten med en textfärg för hela trycket (beslut av ägaren 2026-11-19). Valet gäller alla
 * rader: radernas egna färger tas bort, så att ett klick alltid syns på skylten. Förut vann
 * radens egen färg, och ett val för hela trycket kunde se ut att inte göra någonting. En rad
 * kan få en egen färg igen efteråt. `null` tar bort färgen, och trycket får ytans förvalda.
 */
export function withTextColor<T extends Pick<BadgeDocument, "printColor" | "rows">>(doc: T, color: string | null): T {
  // En skärmfärg, eller en CMYK-kod som kunden har angett. En halvskriven kod sparas aldrig.
  const code = color === null ? null : printColorCode(color);
  if (color !== null && !code) return doc;
  return { ...withColor(doc, code), rows: doc.rows.map((row) => (row.printColor === undefined ? row : withColor(row, null))) };
}

/**
 * Skylten utan textfärger som inte syns mot dess yta, till exempel vitt på vit lack. Används
 * när materialet eller ytan byts: namnet ska inte försvinna för att skylten fick en ny färg
 * (felet ägaren mötte 2026-11-19, där ett byte från plast till metall gav en vit yta under
 * en vit text). Färgen tas bort, så att trycket får ytans förvalda. En färg som bara syns
 * dåligt får stå kvar; där varnar färgvalet i stället.
 */
export function withVisibleInk<T extends Marked & Pick<BadgeDocument, "printColor" | "rows" | "materialId" | "colorId">>(doc: T): T {
  // Bara en färg som faktiskt printas kan dölja något. På en skylt som graveras ligger kundens
  // textfärg kvar oanvänd, och ska finnas där när skylten printas igen på en yta där den syns.
  if (!printsInOneColor(doc)) return doc;
  const surface = getColor(doc.materialId, doc.colorId).surface;
  const hidden = (code: string | undefined) => {
    const hex = printColorHex(code);
    return hex !== null && contrastRatio(hex, surface) < INVISIBLE_CONTRAST;
  };
  const hiddenRow = (row: T["rows"][number]) => nameMarking(doc) === "print" && hidden(row.printColor);
  if (!hidden(doc.printColor) && !doc.rows.some(hiddenRow)) return doc;
  const whole = hidden(doc.printColor) ? withColor(doc, null) : doc;
  return { ...whole, rows: doc.rows.map((row) => (hiddenRow(row) ? withColor(row, null) : row)) };
}

/** Fältet utan värde är borta, inte `undefined`, så att skylten ser ut som en som aldrig haft det. */
function withColor<T extends { printColor?: string }>(item: T, color: string | null): T {
  const rest = { ...item };
  delete rest.printColor;
  return color ? { ...rest, printColor: color } : rest;
}

/**
 * Skylten med tryckets färger som de säljs: en skärmfärg eller en CMYK-kod står kvar, och en kod
 * som inte går att trycka efter, som PMS, tas bort. Trycket visades aldrig i en sådan kod. En rad
 * som bar en får tryckets färg, om trycket har någon. Loggans egna koder tas bort: en svartvit
 * logga som printas får tryckets färg.
 */
export function withScreenPrintColors<T extends Pick<BadgeDocument, "printColor" | "rows" | "logo">>(doc: T): T {
  if (hasScreenPrintColors(doc)) return doc;
  // En CMYK-kod behåller sina värden. Allt annat som går att rita, som en hexkod med tre siffror, blir skärmfärgen.
  const sold = (code: string) => {
    const cmyk = cmykOf(code);
    return cmyk ? cmykText(cmyk) : printColorHex(code);
  };
  const moved = doc.printColor === undefined ? doc : withColor(doc, sold(doc.printColor));
  return {
    ...moved,
    rows: doc.rows.map((row) => (row.printColor === undefined ? row : withColor(row, sold(row.printColor)))),
    ...(doc.logo && { logo: withColor(doc.logo, null) }),
  };
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
  return code && printsInOneColor(doc) ? code : null;
}

/**
 * Sant när något på skylten printas i en färg: namnet (och ramen, som följer det), eller en
 * svartvit logga. En logga i färg trycks ur sin bild och har ingen sådan färg. Printas bara
 * den gäller alltså ingen färg för trycket: fältet visas inte, och ingen "Tryckfärg" följer
 * med ordern (hittat i genomgången 2026-11-19, där en plastskylt med graverat namn och en
 * logga i färg bar tryckfärgen från skylten före).
 */
export function printsInOneColor(doc: Marked): boolean {
  return nameMarking(doc) === "print" || (Boolean(doc.logo) && !doc.logo?.image && logoMarking(doc) === "print");
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
