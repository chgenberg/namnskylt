import { parse, type Font, type Glyph, type PathCommand } from "opentype.js";
import type { FontEngine, FontFace } from "@/engine";
import { STAND_IN_FONT, fallbackFileKey, fontFileKey, type FontFileKey } from "./font-files";

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

/** Parkerning mellan två glyfer i typsnittets enheter. Ett typsnitt vars tabell inte går att läsa har ingen. */
function kerning(font: Font, left: Glyph, right: Glyph): number {
  try {
    return font.getKerningValue(left, right) || 0;
  } catch {
    return 0;
  }
}

/**
 * Raden ritad glyf för glyf: varje tecken blir sin glyf, med typsnittets bredder och parkerning.
 * Så ritas typsnitt vars egna regler för sammansatta tecken biblioteket inte kan läsa: det kastar
 * då ett fel för varje rad på mer än ett tecken. Ligaturer används inte, och det gör de inte för
 * övriga typsnitt heller.
 */
function plainRun(font: Font, text: string, xMm: number, baselineMm: number, sizeMm: number, draw: boolean): { width: number; commands: PathCommand[] } {
  const scale = sizeMm / font.unitsPerEm;
  const glyphs = [...text].map((char) => font.charToGlyph(char));
  const commands: PathCommand[] = [];
  let x = xMm;
  glyphs.forEach((glyph, index) => {
    if (draw) commands.push(...glyph.getPath(x, baselineMm, sizeMm).commands);
    x += (glyph.advanceWidth ?? 0) * scale;
    const next = glyphs[index + 1];
    if (next) x += kerning(font, glyph, next) * scale;
  });
  return { width: x - xMm, commands };
}

/**
 * Kan biblioteket sätta en rad i typsnittet, eller ska raden ritas glyf för glyf? Prövas med
 * samma anrop som raderna sedan mäts med, så att ett typsnitt biblioteket klarar ritas av det.
 */
function needsPlainRun(font: Font): boolean {
  try {
    font.getAdvanceWidth("Hå", 10, RENDER);
    return false;
  } catch {
    return true;
  }
}

interface LoadedFont {
  font: Font;
  capRatio: number;
  plain: boolean;
}

function advanceOf(entry: LoadedFont, text: string, sizeMm: number): number {
  if (!entry.plain) {
    try {
      return entry.font.getAdvanceWidth(text, sizeMm, RENDER);
    } catch {
      // En enstaka rad som biblioteket inte klarar ritas glyf för glyf, i både mått och kontur.
    }
  }
  return plainRun(entry.font, text, 0, 0, sizeMm, false).width;
}

function commandsOf(entry: LoadedFont, text: string, xMm: number, baselineMm: number, sizeMm: number): PathCommand[] {
  if (!entry.plain) {
    try {
      return entry.font.getPath(text, xMm, baselineMm, sizeMm, RENDER).commands;
    } catch {
      // Se `advanceOf`.
    }
  }
  return plainRun(entry.font, text, xMm, baselineMm, sizeMm, true).commands;
}

interface FontEngineOptions {
  /**
   * Läser en fontfil som inte är inläst, direkt. Servern läser från disk: där finns ingen
   * anledning att läsa in alla typsnitt i förväg.
   */
  read?: (key: FontFileKey) => ArrayBuffer | null;
  /**
   * Anropas när en rad behöver en fil som inte är inläst och inte går att läsa direkt.
   * Webbläsaren hämtar den då, och raden ritas om när filen har kommit (`addFonts`).
   */
  onMissing?: (key: FontFileKey) => void;
}

/** En typsnittsmotor som kan få fler fontfiler i efterhand, som reservtypsnittet i webbläsaren. */
export interface LoadedFontEngine extends FontEngine {
  /**
   * Lägger till fontfiler. Svarar `true` när någon rad redan har ritats utan en fil den
   * behövde, reservtypsnittet eller radens eget typsnitt: den raden ska ritas om nu.
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
export function createFontEngine(buffers: ReadonlyMap<FontFileKey, ArrayBuffer>, options: FontEngineOptions = {}): LoadedFontEngine {
  const fonts = new Map<FontFileKey, LoadedFont>();
  const add = (more: ReadonlyMap<FontFileKey, ArrayBuffer>) => {
    for (const [key, buffer] of more) {
      const font = parse(buffer);
      fonts.set(key, { font, capRatio: font.charToGlyph("H").getBoundingBox().y2 / font.unitsPerEm, plain: needsPlainRun(font) });
    }
  };
  add(buffers);
  /** En rad har ritats utan en fil den behövde: den ska ritas om när filen har kommit. */
  let missed = false;

  /** Radens eget typsnitt. Är filen inte inläst ritas raden i grundtypsnittet så länge. */
  const own = (face: FontFace): LoadedFont => {
    const key = fontFileKey(face);
    const loaded = fonts.get(key);
    if (loaded) return loaded;
    const buffer = options.read?.(key);
    if (buffer) {
      add(new Map([[key, buffer]]));
      return fonts.get(key)!;
    }
    const standIn = fonts.get(fontFileKey({ fontId: STAND_IN_FONT, bold: face.bold }));
    if (!standIn) throw new Error(`Fontfil saknas: ${key}`);
    missed = true;
    options.onMissing?.(key);
    return standIn;
  };

  const get = (face: FontFace, drawn = "") => {
    const entry = own(face);
    if (covers(entry.font, drawn)) return entry;
    const fallback = fonts.get(fallbackFileKey(face));
    if (!fallback) missed = true;
    return fallback ?? entry;
  };

  return {
    capHeightRatio: (face, text) => get(face, drawnText(text ?? "")).capRatio,
    measure: (text, font) => {
      const drawn = drawnText(text);
      return advanceOf(get(font, drawn), drawn, font.sizeMm);
    },
    outline: (text, font, xMm, baselineMm) => {
      const drawn = drawnText(text);
      return pathData(commandsOf(get(font, drawn), drawn, xMm, baselineMm, font.sizeMm));
    },
    addFonts(more) {
      add(more);
      const stale = missed;
      missed = false;
      return stale;
    },
  };
}
