import { parse, type Font, type PathCommand } from "opentype.js";
import type { FontEngine, FontFace } from "@/engine";
import { fallbackFileKey, fontFileKey, type FontFileKey } from "./font-files";

const PATH_DECIMALS = 3;
const RENDER = { kerning: true } as const;

function num(value: number): string {
  return String(Number(value.toFixed(PATH_DECIMALS)));
}

/**
 * Egen serialisering: opentype.js `toPathData` avrundar via strängar och ger
 * `NaN` när decimaldelen är liten nog att skrivas med exponent (1e-15).
 */
function pathData(commands: readonly PathCommand[]): string {
  return commands
    .map((c) => {
      switch (c.type) {
        case "M":
        case "L":
          return `${c.type}${num(c.x)} ${num(c.y)}`;
        case "Q":
          return `Q${num(c.x1)} ${num(c.y1)} ${num(c.x)} ${num(c.y)}`;
        case "C":
          return `C${num(c.x1)} ${num(c.y1)} ${num(c.x2)} ${num(c.y2)} ${num(c.x)} ${num(c.y)}`;
        case "Z":
          return "Z";
      }
    })
    .join("");
}

/** Blankstegsvarianter (tabb, hårt blanksteg, tunna blanksteg) som ritas som ett vanligt blanksteg. */
const SPACE_VARIANTS = /[\t\u00a0\u2000-\u200a\u202f\u205f\u3000]/g;
/** Noll-breda tecken: ordbrytare, sammanfogare och BOM. De ritas inte alls. */
const ZERO_WIDTH = /[\u200b-\u200d\ufeff]/g;

/**
 * Raden som den faktiskt mäts och ritas. Samma regel som verkstadens
 * (`normaliseraTextrad` hos dem): ett inklistrat noll-brett tecken eller ett
 * hårt blanksteg finns inte i typsnittet och skulle annars byta hela raden till
 * reservtypsnittet hos oss men inte hos dem.
 */
export function drawnText(text: string): string {
  return text.replace(SPACE_VARIANTS, " ").replace(ZERO_WIDTH, "");
}

/** Har typsnittet en glyf för varje tecken i raden? Blanktecken ritas inte och räknas inte. */
function covers(font: Font, drawn: string): boolean {
  for (const char of drawn) {
    if (/\s/.test(char)) continue;
    // Glyf 0 är typsnittets tomma ruta, som ett tecken det inte har pekar på.
    if (font.charToGlyphIndex(char) === 0) return false;
  }
  return true;
}

/** En typsnittsmotor som kan få fler fontfiler i efterhand, som reservtypsnittet i webbläsaren. */
export interface LoadedFontEngine extends FontEngine {
  /**
   * Lägger till fontfiler. Svarar `true` när någon rad redan har ritats utan
   * reservtypsnittet fast den behövde det: den raden ska ritas om nu.
   */
  addFonts(buffers: ReadonlyMap<FontFileKey, ArrayBuffer>): boolean;
}

/**
 * Typsnittsmotor över riktiga fontfiler: samma avancebredder, versalhöjd och
 * glyfkonturer i webbläsaren och på servern — previewn, 3D-gravyren och
 * produktionsfilen bygger på exakt samma mått.
 *
 * Saknar radens typsnitt ett tecken ritas hela raden i reservtypsnittet, med
 * dess mått. Det är verkstadens regel, så raden ser likadan ut i tillverkningen.
 * Är reservtypsnittet inte laddat än ritas raden i sitt eget typsnitt så länge.
 */
export function createFontEngine(buffers: ReadonlyMap<FontFileKey, ArrayBuffer>): LoadedFontEngine {
  const fonts = new Map<FontFileKey, { font: Font; capRatio: number }>();
  const add = (more: ReadonlyMap<FontFileKey, ArrayBuffer>) => {
    for (const [key, buffer] of more) {
      const font = parse(buffer);
      fonts.set(key, { font, capRatio: font.charToGlyph("H").getBoundingBox().y2 / font.unitsPerEm });
    }
  };
  add(buffers);
  let missedFallback = false;

  const get = (face: FontFace, drawn = "") => {
    const entry = fonts.get(fontFileKey(face));
    if (!entry) throw new Error(`Fontfil saknas: ${fontFileKey(face)}`);
    if (covers(entry.font, drawn)) return entry;
    const fallback = fonts.get(fallbackFileKey(face));
    if (!fallback) missedFallback = true;
    return fallback ?? entry;
  };

  return {
    capHeightRatio: (face, text) => get(face, drawnText(text ?? "")).capRatio,
    measure: (text, font) => {
      const drawn = drawnText(text);
      return get(font, drawn).font.getAdvanceWidth(drawn, font.sizeMm, RENDER);
    },
    outline: (text, font, xMm, baselineMm) => {
      const drawn = drawnText(text);
      return pathData(get(font, drawn).font.getPath(drawn, xMm, baselineMm, font.sizeMm, RENDER).commands);
    },
    addFonts(more) {
      add(more);
      const stale = missedFallback;
      missedFallback = false;
      return stale;
    },
  };
}
