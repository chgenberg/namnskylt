import type { FontEngine, MeasureFont } from "./layout";

/**
 * Tabellbaserad bredd för Arial (em per tecken). Används i test och som
 * första bild innan fontfilerna laddats; skarpa mått kommer från
 * `createFontEngine` i `@/lib/fonts`.
 */
function arialAdvanceEm(char: string): number {
  if (char === " ") return 0.278;
  if (/[iljIt.,:;'!|]/.test(char)) return 0.278;
  if (/[mwMW]/.test(char)) return 0.86;
  if (/[0-9]/.test(char)) return 0.556;
  if (/[A-ZÅÄÖÆØÉ]/.test(char)) return 0.68;
  if (/[a-zåäöæøé]/.test(char)) return 0.54;
  return 0.5;
}

const BOLD_FACTOR = 1.07;
const NARROW_FACTOR = 0.82;
/** Versalhöjd / em i Liberation Sans (H = 1409 av 2048 enheter). */
const APPROX_CAP_HEIGHT_RATIO = 0.688;

export const approxFonts: FontEngine = {
  capHeightRatio: () => APPROX_CAP_HEIGHT_RATIO,
  measure(text: string, font: MeasureFont) {
    const em = [...text].reduce((sum, char) => sum + arialAdvanceEm(char), 0);
    const narrow = font.fontId === "arial-narrow" ? NARROW_FACTOR : 1;
    const bold = font.bold ? BOLD_FACTOR : 1;
    return em * font.sizeMm * narrow * bold;
  },
};
