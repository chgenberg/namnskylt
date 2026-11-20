/** Den delmängd av opentype.js 2 som används — paketet saknar egna typer. */
declare module "opentype.js" {
  export interface RenderOptions {
    kerning?: boolean;
  }

  export type PathCommand =
    | { type: "M" | "L"; x: number; y: number }
    | { type: "Q"; x1: number; y1: number; x: number; y: number }
    | { type: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { type: "Z" };

  export class Path {
    commands: PathCommand[];
  }

  export class Glyph {
    /** Glyfens bredd i typsnittets enheter. Saknas på en glyf utan mått. */
    advanceWidth?: number;
    getBoundingBox(): { x1: number; y1: number; x2: number; y2: number };
    getPath(x: number, y: number, fontSize: number): Path;
  }

  export class Font {
    unitsPerEm: number;
    charToGlyph(char: string): Glyph;
    /** Glyfens plats i typsnittet. 0 är den tomma rutan, alltså ett tecken typsnittet inte har. */
    charToGlyphIndex(char: string): number;
    getAdvanceWidth(text: string, fontSize: number, options?: RenderOptions): number;
    getPath(text: string, x: number, y: number, fontSize: number, options?: RenderOptions): Path;
    /** Parkerningen mellan två glyfer, i typsnittets enheter. */
    getKerningValue(left: Glyph, right: Glyph): number;
  }

  export function parse(buffer: ArrayBuffer): Font;
}
