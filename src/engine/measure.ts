import type { MeasureFont, TextMeasurer } from "./layout";

/**
 * Tabellbaserad bredd för Arial (em per tecken). Används på servern och i
 * test där ingen canvas finns. Webbläsaren använder `createCanvasMeasurer`
 * så att previewn mäter med exakt det typsnitt den ritar med.
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

export const approxMeasure: TextMeasurer = (text: string, font: MeasureFont) => {
  const em = [...text].reduce((sum, char) => sum + arialAdvanceEm(char), 0);
  const narrow = font.css.includes("Narrow") ? NARROW_FACTOR : 1;
  const bold = font.bold ? BOLD_FACTOR : 1;
  return em * font.sizeMm * narrow * bold;
};

/** Mäter i px på 100 px-skala och räknar om till mm. Resultatet cachas per sträng. */
export function createCanvasMeasurer(): TextMeasurer {
  if (typeof document === "undefined") return approxMeasure;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return approxMeasure;

  const REFERENCE_PX = 100;
  const cache = new Map<string, number>();
  return (text, font) => {
    const key = `${font.bold ? 1 : 0}|${font.css}|${text}`;
    let emWidth = cache.get(key);
    if (emWidth === undefined) {
      context.font = `${font.bold ? 700 : 400} ${REFERENCE_PX}px ${font.css}`;
      emWidth = context.measureText(text).width / REFERENCE_PX;
      cache.set(key, emWidth);
    }
    return emWidth * font.sizeMm;
  };
}
