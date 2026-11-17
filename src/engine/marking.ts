import type { BadgeDocument, MarkingMethod, MarkingMode } from "./types";

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

/** Om metoden går att välja på skylten: de kombinerade kräver en logga. */
export function markingFits(method: MarkingMethod, doc: Pick<BadgeDocument, "logo">): boolean {
  return Boolean(doc.logo) || !getMarkingMethod(method).combined;
}

/**
 * Skylten med en vald metod. Fältet sparas bara när valet skiljer sig från det
 * skylten får av sig själv, så att en skylt som ingen har rört metoden på ser
 * ut precis som en äldre skylt.
 */
export function withMarking<T extends Marked>(doc: T, method: MarkingMethod): T {
  const rest = { ...doc };
  delete rest.marking;
  const wanted = markingFits(method, doc) ? method : getMarkingMethod(method).nameMode;
  return markingOf(rest) === wanted ? rest : { ...rest, marking: wanted };
}

/**
 * Metoden som föreslås när skylten får en ny logga: namnet behåller sin metod,
 * en logga i färg trycks och en svartvit följer namnet. Kunden kan byta sedan.
 */
export function withLogoMarking<T extends Marked>(doc: T): T {
  if (!doc.logo) return withMarking(doc, nameMarking(doc));
  const name = nameMarking(doc);
  return withMarking(doc, markingFor(name, doc.logo.image ? "print" : name));
}

/** Längsta färgkod kunden får ange för trycket. */
export const PRINT_COLOR_MAX = 40;

/** Det kunden skriver som färgkod, utan styrtecken och inom längden. Blanktecken i kanterna får stå kvar medan man skriver. */
export function cleanPrintColor(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, PRINT_COLOR_MAX);
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
 * Hexkoden i en färgkod, som `#RRGGBB` i versaler, eller `null` när koden är
 * något annat. Tre siffror kräver brädgården: `286` är ett PMS-nummer och
 * ingen färg. PMS och RAL går inte att rita, eftersom vi inte har deras färger.
 */
export function printColorHex(code: string | null | undefined): string | null {
  const text = code?.trim() ?? "";
  const long = /^#?([0-9a-f]{6})$/i.exec(text);
  if (long) return `#${long[1]!.toUpperCase()}`;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase() : null;
}

/**
 * Färgen trycket ritas i när kundens kod för hela trycket är en hexkod:
 * ramen, en svartvit logga som printas och rader utan egen kod. Annars `null`,
 * och trycket visas i gravyrens färg.
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
 * Färgen raden ritas i: radens egen hexkod, annars hexkoden för hela trycket.
 * En rad med en egen kod som inte går att rita (PMS) visas i gravyrens färg,
 * inte i tryckets, eftersom den inte ska få den färgen.
 */
export function rowPrintInkOf(doc: Printed, row: PrintedRow): string | null {
  if (nameMarking(doc) !== "print") return null;
  const own = rowPrintColorOf(doc, row);
  return own ? printColorHex(own) : printInkOf(doc);
}

/**
 * `Tryckfärg PMS 286 C, rad 2 #C8102E` för listor och underlag, eller `null`
 * när ingen kod gäller. Raderna räknas som de står på skylten, alltså utan
 * tomma rader.
 */
export function printColorLabel(doc: Printed & { rows: readonly PrintedRow[] }): string | null {
  const rows = doc.rows
    .filter((row) => row.text.trim().length > 0)
    .flatMap((row, i) => {
      const code = rowPrintColorOf(doc, row);
      return code ? [`rad ${i + 1} ${code}`] : [];
    });
  const parts = [printColorOf(doc), ...rows].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? `Tryckfärg ${parts.join(", ")}` : null;
}
