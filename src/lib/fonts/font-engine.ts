import { parse, type Font, type PathCommand } from "opentype.js";
import type { FontEngine, FontFace } from "@/engine";
import { fontFileKey, type FontFileKey } from "./font-files";

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

/**
 * Typsnittsmotor över riktiga fontfiler: samma avancebredder, versalhöjd och
 * glyfkonturer i webbläsaren och på servern — previewn, 3D-gravyren och
 * produktionsfilen bygger på exakt samma mått.
 */
export function createFontEngine(buffers: ReadonlyMap<FontFileKey, ArrayBuffer>): FontEngine {
  const fonts = new Map<FontFileKey, { font: Font; capRatio: number }>();
  for (const [key, buffer] of buffers) {
    const font = parse(buffer);
    fonts.set(key, { font, capRatio: font.charToGlyph("H").getBoundingBox().y2 / font.unitsPerEm });
  }

  const get = (face: FontFace) => {
    const entry = fonts.get(fontFileKey(face));
    if (!entry) throw new Error(`Fontfil saknas: ${fontFileKey(face)}`);
    return entry;
  };

  return {
    capHeightRatio: (face) => get(face).capRatio,
    measure: (text, font) => get(font).font.getAdvanceWidth(text, font.sizeMm, RENDER),
    outline: (text, font, xMm, baselineMm) =>
      pathData(get(font).font.getPath(text, xMm, baselineMm, font.sizeMm, RENDER).commands),
  };
}
