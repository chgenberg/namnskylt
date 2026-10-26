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
    getBoundingBox(): { x1: number; y1: number; x2: number; y2: number };
  }

  export class Font {
    unitsPerEm: number;
    charToGlyph(char: string): Glyph;
    getAdvanceWidth(text: string, fontSize: number, options?: RenderOptions): number;
    getPath(text: string, x: number, y: number, fontSize: number, options?: RenderOptions): Path;
  }

  export function parse(buffer: ArrayBuffer): Font;
}
