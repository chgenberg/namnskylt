import { getMaterial, type FontId, type MaterialId } from "@/engine";
import { colorDistance, parseCssColor } from "./color";

/**
 * Leverantören graverar bara Arial och Arial Narrow, så sidans typsnitt
 * översätts till det av dem som liknar mest: smala/kondenserade familjer blir
 * Arial Narrow, allt annat Arial.
 */
const CONDENSED_FAMILY =
  /condensed|narrow|compressed|oswald|bebas|league gothic|fjalla|anton|antonio|teko|saira (extra )?condensed|pathway gothic|big shoulders|barlow semi condensed|six caps|smooch sans/i;

export interface FontMatch {
  fontId: FontId;
  /** Typsnittet vi utgick från, för att kunna visa "Inter → Arial". */
  sourceFamily: string | null;
  /** Uppmätt textbredd mot Arial när sidan renderades; `null` = gissat ur namnet. */
  widthRatio: number | null;
}

export function matchFont(families: readonly string[]): FontMatch {
  const source = families[0] ?? null;
  return {
    fontId: source && CONDENSED_FAMILY.test(source) ? "arial-narrow" : "arial",
    sourceFamily: source,
    widthRatio: null,
  };
}

/** Arial Narrow ritar ≈ 0,82 av Arials bredd; under gränsen är typsnittet närmast Narrow. */
export const NARROW_WIDTH_RATIO = 0.9;
/** Rubriker bär varumärkets typografi mer än brödtext. */
const ROLE_WEIGHT = { heading: 3, button: 2, nav: 1, body: 1 } as const;

export interface RenderedFontSample {
  stack: string;
  widthRatio: number;
  heading: number;
  nav: number;
  button: number;
  body: number;
}

function sampleScore(sample: RenderedFontSample): number {
  return (
    sample.heading * ROLE_WEIGHT.heading +
    sample.button * ROLE_WEIGHT.button +
    sample.nav * ROLE_WEIGHT.nav +
    sample.body * ROLE_WEIGHT.body
  );
}

/** Sidans typsnitt, viktigast först, med uppmätt bredd per familj. */
export function renderedFamilies(
  samples: readonly RenderedFontSample[],
  familyOf: (stack: string) => string | null,
): { family: string; widthRatio: number; score: number }[] {
  const families = new Map<string, { score: number; widthSum: number }>();
  for (const sample of samples) {
    const family = familyOf(sample.stack);
    const score = sampleScore(sample);
    if (!family || score === 0) continue;
    const entry = families.get(family) ?? { score: 0, widthSum: 0 };
    entry.score += score;
    entry.widthSum += sample.widthRatio * score;
    families.set(family, entry);
  }
  return [...families.entries()]
    .map(([family, { score, widthSum }]) => ({ family, score, widthRatio: Math.round((widthSum / score) * 1000) / 1000 }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Det tillverkningsbara typsnitt som liknar sidans mest, utifrån hur brett
 * rubriktypsnittet faktiskt ritas. `null` = inga prov att gå på.
 */
export function matchRenderedFont(
  samples: readonly RenderedFontSample[],
  familyOf: (stack: string) => string | null,
): FontMatch | null {
  const top = renderedFamilies(samples, familyOf)[0];
  if (!top) return null;
  const narrow = top.widthRatio < NARROW_WIDTH_RATIO || CONDENSED_FAMILY.test(top.family);
  return {
    fontId: narrow ? "arial-narrow" : "arial",
    sourceFamily: isFamilyAlias(top.family) ? null : top.family,
    widthRatio: top.widthRatio,
  };
}

/** Sajter som döper sina webbtypsnitt till "regular" eller "headline" — inget att visa kunden. */
const FAMILY_ALIAS =
  /^(regular|medium|light|bold|black|thin|book|headline|heading|header|title|display|body|text|copy|primary|secondary|main|base|brand|font|sans|serif)(\s*\d+)?$/i;

export function isFamilyAlias(family: string): boolean {
  return FAMILY_ALIAS.test(family.trim());
}

/** En färg som gravyr i stället för yta får ett litet påslag — ytan bär varumärket bäst. */
const ENGRAVING_MATCH_PENALTY = 6;
/** Längre bort än så finns ingen kombination som påminner om varumärket. */
const MAX_COLOR_DISTANCE = 45;

/**
 * Färgkombinationen i materialet som bäst bär varumärkets färg — som yta
 * (mörkblå skylt för ett mörkblått varumärke) eller som gravyr (blå text på
 * vitt). `null` = ingen kombination ligger nära nog.
 */
export function matchColorCombo(brandHexes: readonly string[], materialId: MaterialId): string | null {
  const { colors } = getMaterial(materialId);
  let best: { id: string; score: number } | null = null;
  for (const [rank, hex] of brandHexes.slice(0, 3).entries()) {
    const brand = parseCssColor(hex);
    if (!brand) continue;
    for (const combo of colors) {
      const surface = parseCssColor(combo.surface);
      const engraving = parseCssColor(combo.engraving);
      const asSurface = surface ? colorDistance(brand, surface) : Infinity;
      const asEngraving = engraving ? colorDistance(brand, engraving) + ENGRAVING_MATCH_PENALTY : Infinity;
      const score = Math.min(asSurface, asEngraving) + rank * 8;
      if (score <= MAX_COLOR_DISTANCE && (!best || score < best.score)) best = { id: combo.id, score };
    }
  }
  return best?.id ?? null;
}
