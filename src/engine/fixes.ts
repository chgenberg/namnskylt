import { BLANKS, LOGO_LIMITS, blankFits, getColor, getMaterial, offeredColors } from "./catalog";
import { GOOD_CONTRAST, LOW_CONTRAST, PRINT_PALETTE, contrastRatio } from "./color-choice";
import { printColorHex } from "./color-code";
import { blankOf, isOfferedDocument, withBlank, withFittingMounting, withoutOffsets } from "./document";
import { layoutBadge, logoHeightLimits, type BadgeLayout, type FontEngine } from "./layout";
import { logoMarking, printInkOf, printsInOneColor, rowPrintColorOf, withTextColor, withVisibleInk } from "./marking";
import type { BadgeDocument } from "./types";

/**
 * Rätta med en knapp (beslut av ägaren 2026-11-24, efter granskaren i Merchin). En anmärkning på
 * skylten som går att rätta säkert får en knapp som ändrar skylten direkt, och efteråt "Ändrat: …
 * Ångra". Rättningarna är regler, ingen AI: varje regel föreslår några nya skyltar, minsta ändringen
 * först, och knappen blir den första som tar bort anmärkningen utan att ge en ny (`chooseFix`).
 * Allt räknas med samma layout som ritningen, 3D-vyn och verkstadens underlag.
 */

/**
 * Var på skylten anmärkningen gäller. Samma nyckel i panelen och i stegrutan:
 * tryckets färg, en rads färg eller plats, loggan över texten, eller loggan mot ytan.
 */
export type FixTarget = "text-color" | "logo-overlap" | "logo-contrast" | `row-color:${string}` | `row-fit:${string}`;

/** En anmärkning på skylten. */
export type BadgeProblem =
  /** Färgen på trycket syns dåligt mot ytan. */
  | { target: "text-color" }
  /** En rads egen färg syns dåligt mot ytan. */
  | { target: `row-color:${string}`; rowId: string }
  /** Raden ryms inte (`tooLong`), eller ryms bara i en mindre versalhöjd än kunden valde. */
  | { target: `row-fit:${string}`; rowId: string; tooLong: boolean }
  /** Loggan ligger över texten efter att kunden har flyttat någon av dem. */
  | { target: "logo-overlap" }
  /** En logga som trycks i sina färger syns dåligt mot skyltens yta: vit text på en vit skylt. */
  | { target: "logo-contrast" };

/** En rättning: knappens text, vad som ändrades, och skylten efter rättningen. */
export interface BadgeFix {
  target: FixTarget;
  /** Knappens text, i imperativ: "Byt till svart". */
  label: string;
  /** Vad som ändrades, för raden "Ändrat: …": "Trycket är svart". */
  done: string;
  doc: BadgeDocument;
}

interface Candidate {
  label: string;
  done: string;
  doc: BadgeDocument;
}

/** Svart och vitt ur paletten: det säkraste bytet när en färg inte syns. */
const SAFE_INKS = PRINT_PALETTE.filter((color) => color.name === "Svart" || color.name === "Vit");
/** Loggan görs mindre i steg om en millimeter. */
const LOGO_STEP_MM = 1;
/**
 * Hur liten loggan får bli, som andel av sin höjd: halva när en rad inte ryms alls, men bara en
 * fjärdedel mindre när raden ryms krympt. Att halvera loggan för att namnet ska få några tiondels
 * millimeter till är ett sämre råd än att låta raden vara.
 */
const LOGO_MIN_SHARE_TOO_LONG = 0.5;
const LOGO_MIN_SHARE_SHRUNK = 0.75;

function surfaceOf(doc: BadgeDocument): string {
  return getColor(doc.materialId, doc.colorId).surface;
}

function lowContrast(hex: string | null, surface: string): boolean {
  return hex !== null && contrastRatio(hex, surface) < LOW_CONTRAST;
}

/** Huvudfärgen i en logga som trycks i sina egna färger, när den är avläst. */
function printedLogoColor(doc: BadgeDocument): string | null {
  if (!doc.logo?.image || logoMarking(doc) !== "print") return null;
  return printColorHex(doc.logo.colors?.[0]) ?? null;
}

/**
 * Anmärkningarna på skylten, i den ordning de står i panelen. Tryckets färg räknas bara när något
 * faktiskt printas i en färg, och en rads färg bara när namnet printas, som i färgvalet.
 */
export function badgeProblems(doc: BadgeDocument, layout: BadgeLayout): BadgeProblem[] {
  const problems: BadgeProblem[] = [];
  const surface = surfaceOf(doc);
  if (printsInOneColor(doc) && lowContrast(printInkOf(doc), surface)) problems.push({ target: "text-color" });
  for (const row of doc.rows) {
    if (!row.text.trim()) continue;
    if (lowContrast(printColorHex(rowPrintColorOf(doc, row)), surface)) {
      problems.push({ target: `row-color:${row.id}`, rowId: row.id });
    }
    const issue = layout.issues.find((x) => x.rowId === row.id);
    if (issue) problems.push({ target: `row-fit:${row.id}`, rowId: row.id, tooLong: issue.code === "row-too-long" });
  }
  if (doc.logo && layout.logoOverlapsText) problems.push({ target: "logo-overlap" });
  if (lowContrast(printedLogoColor(doc), surface)) problems.push({ target: "logo-contrast" });
  return problems;
}

/** Valfritt underlag för rättningarna, som skyltmotorn har men motorn inte räknar själv. */
export interface FixOptions {
  /** Layouten för `doc`, om den redan är räknad. */
  layout?: BadgeLayout;
  /**
   * Ytorna att pröva först när loggan syns dåligt, i ordning: skyltmotorns förslag ur loggans
   * färger (`logoColorCombo`). Utan dem prövas ytorna med bäst kontrast mot loggan.
   */
  logoColorIds?: readonly string[];
}

/** En rättning per anmärkning som går att rätta säkert. Anmärkningar utan säker rättning har ingen knapp. */
export function badgeFixes(doc: BadgeDocument, fonts: FontEngine, options: FixOptions = {}): BadgeFix[] {
  const layout = options.layout ?? layoutBadge(doc, fonts);
  const problems = badgeProblems(doc, layout);
  if (problems.length === 0) return [];
  const layouts = new Map<BadgeDocument, BadgeLayout>([[doc, layout]]);
  const layoutOf = (candidate: BadgeDocument) => {
    const known = layouts.get(candidate);
    if (known) return known;
    const fresh = layoutBadge(candidate, fonts);
    layouts.set(candidate, fresh);
    return fresh;
  };
  const sellable = isOfferedDocument(doc);
  const known = new Set(problems.map((problem) => problem.target));
  const fixes: BadgeFix[] = [];
  for (const problem of problems) {
    const fix = chooseFix(doc, problem, candidatesFor(doc, problem, layout, options), layoutOf, { sellable, known });
    if (fix) fixes.push({ target: problem.target, ...fix });
  }
  return fixes;
}

/**
 * Den första rättningen som tar bort anmärkningen utan att ge en ny: ingen anmärkning som inte
 * fanns förut (en annan färg som inte syns, en rad till som krymps, loggan över texten), ingen
 * rad som inte ryms där den rymdes, och en skylt som går att beställa om den gick förut.
 */
function chooseFix(
  doc: BadgeDocument,
  problem: BadgeProblem,
  candidates: readonly Candidate[],
  layoutOf: (doc: BadgeDocument) => BadgeLayout,
  { sellable, known }: { sellable: boolean; known: ReadonlySet<FixTarget> },
): Candidate | null {
  const before = layoutOf(doc);
  const tooLongBefore = before.issues.filter((issue) => issue.code === "row-too-long").length;
  for (const candidate of candidates) {
    if (candidate.doc === doc) continue;
    if (sellable && !isOfferedDocument(candidate.doc)) continue;
    const after = layoutOf(candidate.doc);
    const remaining = badgeProblems(candidate.doc, after);
    if (remaining.some((other) => persists(problem, other) || !known.has(other.target))) continue;
    if (after.issues.filter((issue) => issue.code === "row-too-long").length > tooLongBefore) continue;
    return candidate;
  }
  return null;
}

/**
 * Anmärkningen står kvar efter rättningen. En rad som inte rymdes är rättad när den ryms, också
 * om den då ryms i en mindre versalhöjd än kunden valde: det säger raden själv, som förut.
 */
function persists(problem: BadgeProblem, other: BadgeProblem): boolean {
  if (other.target !== problem.target) return false;
  if ("tooLong" in problem && problem.tooLong) return "tooLong" in other && other.tooLong;
  return true;
}

function candidatesFor(doc: BadgeDocument, problem: BadgeProblem, layout: BadgeLayout, options: FixOptions): Candidate[] {
  switch (problem.target) {
    case "text-color":
      return safeInks(surfaceOf(doc)).map((ink) => ({
        label: `Byt till ${ink.name.toLowerCase()}`,
        done: `trycket är ${ink.name.toLowerCase()}`,
        doc: withTextColor(doc, ink.hex),
      }));
    case "logo-overlap": {
      // Först tillbaka till sina platser. Ligger de över varandra också där görs loggan mindre.
      const placed = withoutOffsets(doc);
      return [
        { label: "Lägg tillbaka text och logga", done: "text och logga står på sina platser", doc: placed },
        ...smallerLogos(placed, LOGO_MIN_SHARE_TOO_LONG).map((smaller) => ({
          ...smaller,
          label: "Lägg tillbaka och gör loggan mindre",
          done: `text och logga står på sina platser, och ${smaller.done}`,
        })),
      ];
    }
    case "logo-contrast":
      return logoSurfaces(doc, options.logoColorIds ?? []);
    default:
      return "tooLong" in problem ? rowFits(doc, layout, problem.tooLong) : rowColors(doc, problem.rowId);
  }
}

/** Svart och vitt, det som syns bäst mot ytan först. Bara färger som syns bra. */
function safeInks(surface: string) {
  return [...SAFE_INKS]
    .sort((a, b) => contrastRatio(b.hex, surface) - contrastRatio(a.hex, surface))
    .filter((ink) => contrastRatio(ink.hex, surface) >= GOOD_CONTRAST);
}

/** En rad i en färg som inte syns: först samma färg som övriga texten, sedan svart eller vitt. */
function rowColors(doc: BadgeDocument, rowId: string): Candidate[] {
  const rowWith = (color: string | null) => ({
    ...doc,
    rows: doc.rows.map((row) => {
      if (row.id !== rowId) return row;
      const rest = { ...row };
      delete rest.printColor;
      return color ? { ...rest, printColor: color } : rest;
    }),
  });
  return [
    { label: "Samma färg som övriga texten", done: "raden har samma färg som övriga texten", doc: rowWith(null) },
    ...safeInks(surfaceOf(doc)).map((ink) => ({
      label: `Byt raden till ${ink.name.toLowerCase()}`,
      done: `raden är ${ink.name.toLowerCase()}`,
      doc: rowWith(ink.hex),
    })),
  ];
}

/**
 * En rad som inte ryms, eller bara ryms mindre än kunden valde. Minsta ändringen först: en mindre
 * logga, så stor som möjligt, sedan det smalare typsnittet, sedan ett större ämne på samma material.
 * Texten ändras aldrig.
 */
function rowFits(doc: BadgeDocument, layout: BadgeLayout, tooLong: boolean): Candidate[] {
  const candidates: Candidate[] = layout.logo ? smallerLogos(doc, tooLong ? LOGO_MIN_SHARE_TOO_LONG : LOGO_MIN_SHARE_SHRUNK) : [];
  if (doc.font === "arial") {
    candidates.push({ label: "Byt till Arial Narrow", done: "texten är i Arial Narrow", doc: { ...doc, font: "arial-narrow" } });
  }
  if (doc.shape !== "custom") {
    const current = blankOf(doc);
    const larger = BLANKS.filter(
      (blank) =>
        blank.id !== current?.id &&
        blankFits(blank, doc.materialId) &&
        blank.widthMm >= doc.size.widthMm &&
        blank.heightMm >= doc.size.heightMm,
    ).sort((a, b) => a.widthMm * a.heightMm - b.widthMm * b.heightMm);
    for (const blank of larger) {
      const moved = withFittingMounting(withBlank(doc, blank.id));
      // Ett större ämne får inte byta fästet i det tysta.
      if (moved.mounting !== doc.mounting) continue;
      const size = `${blank.widthMm} × ${blank.heightMm} mm`;
      candidates.push({ label: `Byt till ${blank.name}, ${size}`, done: `skylten är ${blank.name}, ${size}`, doc: moved });
    }
  }
  return candidates;
}

/** Loggan en millimeter i taget mindre, ner till en andel av sin höjd: den största som räcker prövas först. */
function smallerLogos(doc: BadgeDocument, minShare: number): Candidate[] {
  const limits = logoHeightLimits(doc);
  if (!doc.logo || !limits) return [];
  const logo = doc.logo;
  const floor = Math.max(LOGO_LIMITS.minHeightMm, limits.drawnMm * minShare);
  const candidates: Candidate[] = [];
  for (let height = Math.ceil(limits.drawnMm) - LOGO_STEP_MM; height >= floor; height -= LOGO_STEP_MM) {
    candidates.push({
      label: "Gör loggan mindre",
      done: `loggan är ${height} mm hög`,
      doc: { ...doc, logo: { ...logo, heightMm: height, sizing: "free" } },
    });
  }
  return candidates;
}

/**
 * En logga som trycks i sina färger och inte syns mot ytan. Ytan byts: först skyltmotorns förslag
 * ur loggans färger, när loggan syns bra mot det, sedan materialets ytor med bäst kontrast mot
 * loggans huvudfärg. En textfärg som inte syns mot den nya ytan tas bort, som när kunden byter färg.
 */
function logoSurfaces(doc: BadgeDocument, preferred: readonly string[]): Candidate[] {
  const main = printedLogoColor(doc);
  if (!main) return [];
  const colors = offeredColors(getMaterial(doc.materialId)).filter((color) => color.id !== doc.colorId);
  const clear = colors.filter((color) => contrastRatio(main, color.surface) >= GOOD_CONTRAST);
  const ordered = [
    ...preferred.flatMap((id) => clear.filter((color) => color.id === id)),
    ...[...colors].sort((a, b) => contrastRatio(main, b.surface) - contrastRatio(main, a.surface)),
  ];
  const seen = new Set<string>();
  return ordered
    .filter((color) => (seen.has(color.id) ? false : (seen.add(color.id), true)))
    .map((color) => ({
      label: `Byt skylten till ${color.name}`,
      done: `skylten är ${color.name}`,
      doc: withVisibleInk({ ...doc, colorId: color.id }),
    }));
}
