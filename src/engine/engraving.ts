import type { BadgeLayout, FontEngine } from "./layout";

export type FillRule = "nonzero" | "evenodd";

/** Allt som graveras, som fyllda konturer i mm. */
export interface EngravedPath {
  id: string;
  /** Satt för textrader — renderare kan t.ex. tona platshållare. */
  rowId?: string;
  d: string;
  fillRule: FillRule;
}

/**
 * Gravyren som vektorkonturer: ramringar och glyfer. Samma konturer blir
 * produktionsfil, ritning och 3D-geometri — så det kunden ser är det som
 * fräses. Returnerar `null` när typsnittet saknar konturer (fontfilerna inte
 * laddade); då får renderaren falla tillbaka på `<text>`.
 */
export function engravingPaths(layout: BadgeLayout, fonts: FontEngine): EngravedPath[] | null {
  const { outline } = fonts;
  if (!outline) return null;

  const frames = layout.frames.map(
    (frame, i): EngravedPath => ({ id: `frame-${i}`, d: frame.d, fillRule: "evenodd" }),
  );
  // TrueType-konturer lindas medurs/moturs och fylls med nonzero.
  const rows = layout.rows
    .map(
      (row): EngravedPath => ({
        id: `row-${row.id}`,
        rowId: row.id,
        d: outline(
          row.text,
          { fontId: layout.fontId, bold: row.bold, sizeMm: row.fontSizeMm },
          row.leftMm,
          row.baselineMm,
        ),
        fillRule: "nonzero",
      }),
    )
    .filter((path) => path.d.length > 0);

  return [...frames, ...rows];
}
