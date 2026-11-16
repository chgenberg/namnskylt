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
