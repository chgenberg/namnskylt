import type { BadgeLayout, FontEngine } from "./layout";

export type FillRule = "nonzero" | "evenodd";
export type EngravingKind = "frame" | "text" | "logo";

/** En märkt yta, graverad eller printad, som fylld kontur i mm. */
export interface EngravedPath {
  id: string;
  kind: EngravingKind;
  /** Satt för textrader — renderare kan t.ex. tona platshållare. */
  rowId?: string;
  d: string;
  fillRule: FillRule;
}

/**
 * Allt som märks på skylten som vektorkonturer, delat efter metod: ramringar
 * och glyfer följer namnets metod, loggan sin egen. En logga i färg som printas
 * är en bild och finns inte bland konturerna alls. Returnerar `null` när
 * typsnittet saknar konturer (fontfilerna inte laddade).
 */
function markedPaths(layout: BadgeLayout, fonts: FontEngine): { engraved: EngravedPath[]; printed: EngravedPath[] } | null {
  const { outline } = fonts;
  if (!outline) return null;

  const frames = layout.frames.map(
    (frame, i): EngravedPath => ({ id: `frame-${i}`, kind: "frame", d: frame.d, fillRule: "evenodd" }),
  );
  const logo: EngravedPath[] =
    layout.logo && !layout.logo.imageSrc ? [{ id: "logo", kind: "logo", d: layout.logo.d, fillRule: "evenodd" }] : [];
  // TrueType-konturer lindas medurs/moturs och fylls med nonzero.
  const rows = layout.rows
    .map(
      (row): EngravedPath => ({
        id: `row-${row.id}`,
        kind: "text",
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

  const engraved: EngravedPath[] = [];
  const printed: EngravedPath[] = [];
  (layout.namePrinted ? printed : engraved).push(...frames);
  (layout.logo?.printed ? printed : engraved).push(...logo);
  (layout.namePrinted ? printed : engraved).push(...rows);
  return { engraved, printed };
}

/**
 * Gravyren som vektorkonturer: ramringar, logga och glyfer. Samma konturer
 * blir produktionsfil, ritning och 3D-geometri — så det kunden ser är det som
 * fräses. Det som printas är inte med. Returnerar `null` när typsnittet saknar
 * konturer; då får renderaren falla tillbaka på `<text>`.
 */
export function engravingPaths(layout: BadgeLayout, fonts: FontEngine): EngravedPath[] | null {
  return markedPaths(layout, fonts)?.engraved ?? null;
}

/**
 * Det som printas i gravyrens färg, plant på ytan: namnet när det printas, och
 * en svartvit logga som printas. En logga i färg trycks som bild
 * (`LaidOutLogo.imageSrc`) och finns inte här. Konturerna hör aldrig till
 * fräsningen eller maskinfilerna.
 */
export function printedPaths(layout: BadgeLayout, fonts: FontEngine): EngravedPath[] | null {
  return markedPaths(layout, fonts)?.printed ?? null;
}
