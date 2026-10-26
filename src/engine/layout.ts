import { TEXT_LIMITS } from "./catalog";
import { engravedRows } from "./document";
import { availableHalfWidth, outlinePath } from "./shape";
import type { BadgeDocument, FontId, Mm, TextAlign } from "./types";

export interface FontFace {
  fontId: FontId;
  bold: boolean;
}

export interface MeasureFont extends FontFace {
  sizeMm: Mm;
}

/**
 * Typsnittet som graveras. Injiceras: riktiga fontfiler (opentype) i
 * webbläsaren och på servern, tabell i test och innan filerna laddats.
 */
export interface FontEngine {
  /** Versalhöjd som andel av em — skiljer mellan typsnitt. */
  capHeightRatio(face: FontFace): number;
  /** Avancebredd i mm, inklusive kerning. */
  measure(text: string, font: MeasureFont): Mm;
  /**
   * Glyfkonturer som SVG-path i mm, baslinjen börjar i (xMm, baselineMm).
   * Saknas när fontfilerna inte är laddade — då ritas `<text>` i stället.
   */
  outline?(text: string, font: MeasureFont, xMm: Mm, baselineMm: Mm): string;
}

export type TextAnchor = "start" | "middle" | "end";

export interface LaidOutRow {
  id: string;
  text: string;
  /** Ankarpunkt enligt `anchor` — för `<text>`. */
  xMm: Mm;
  /** Radens vänsterkant — för glyfkonturer. */
  leftMm: Mm;
  baselineMm: Mm;
  capHeightMm: Mm;
  requestedCapHeightMm: Mm;
  fontSizeMm: Mm;
  bold: boolean;
  anchor: TextAnchor;
  widthMm: Mm;
}

/** Ram som fylld ring: yttre och inre kontur i samma path, fylls med evenodd. */
export interface FrameRing {
  d: string;
}

export type LayoutIssue =
  | { code: "row-shrunk"; rowId: string }
  | { code: "row-too-long"; rowId: string };

export interface BadgeLayout {
  widthMm: Mm;
  heightMm: Mm;
  outline: string;
  fontId: FontId;
  frames: FrameRing[];
  contentInsetMm: Mm;
  rows: LaidOutRow[];
  issues: LayoutIssue[];
}

/** Luft mellan skyltkant och text när ingen ram finns. */
const EDGE_MARGIN_MM = 2.5;
/** Luft mellan ramens insida och text. */
const FRAME_TEXT_GAP_MM = 1.5;
/** Radavstånd som andel av de två grannradernas medelversalhöjd. */
const ROW_GAP_RATIO = 0.5;
/** Hur mycket mindre än önskat en rad får bli innan kunden behöver veta. */
const SHRINK_NOTICE_RATIO = 0.97;
const FIT_PASSES = 3;

const ANCHOR_BY_ALIGN: Record<TextAlign, TextAnchor> = {
  left: "start",
  center: "middle",
  right: "end",
};

function ring(doc: BadgeDocument, outerInsetMm: Mm, thicknessMm: Mm): FrameRing {
  return { d: `${outlinePath(doc, outerInsetMm)}${outlinePath(doc, outerInsetMm + thicknessMm)}` };
}

function frameRings(doc: BadgeDocument): { frames: FrameRing[]; innerEdgeMm: Mm } {
  const { style, insetMm, thicknessMm: t } = doc.frame;
  if (style === "none") return { frames: [], innerEdgeMm: 0 };

  const outer = ring(doc, insetMm, t);
  if (style === "solid") return { frames: [outer], innerEdgeMm: insetMm + t };

  const gap = Math.max(0.6, t * 2);
  const inner = ring(doc, insetMm + t + gap, t);
  return { frames: [outer, inner], innerEdgeMm: insetMm + 2 * t + gap };
}

function rowGaps(caps: readonly Mm[]): Mm[] {
  return caps.slice(1).map((cap, i) => ROW_GAP_RATIO * ((caps[i]! + cap) / 2));
}

function blockHeight(caps: readonly Mm[]): Mm {
  return caps.reduce((sum, c) => sum + c, 0) + rowGaps(caps).reduce((sum, g) => sum + g, 0);
}

function rowTops(caps: readonly Mm[], heightMm: Mm): Mm[] {
  const gaps = rowGaps(caps);
  let y = (heightMm - blockHeight(caps)) / 2;
  return caps.map((cap, i) => {
    const top = y;
    y += cap + (gaps[i] ?? 0);
    return top;
  });
}

/**
 * Placerar textraderna. Raderna staplas vertikalt centrerade inom
 * säkerhetszonen; en rad som inte ryms i bredd krymps — aldrig kondenseras —
 * eftersom gravyren ska se ut exakt som previewn.
 */
export function layoutBadge(doc: BadgeDocument, fonts: FontEngine): BadgeLayout {
  const { widthMm, heightMm } = doc.size;
  const { frames, innerEdgeMm } = frameRings(doc);
  const inset = doc.frame.style === "none" ? EDGE_MARGIN_MM : innerEdgeMm + FRAME_TEXT_GAP_MM;
  const rows = engravedRows(doc);
  const faces = rows.map((r): FontFace => ({ fontId: doc.font, bold: r.bold }));
  const sizeFor = (i: number, cap: Mm): Mm => cap / fonts.capHeightRatio(faces[i]!);

  const requested = rows.map((r) =>
    Math.min(Math.max(r.capHeightMm, TEXT_LIMITS.minCapHeightMm), TEXT_LIMITS.maxCapHeightMm),
  );
  let caps = [...requested];

  const availableHeight = Math.max(0, heightMm - inset * 2);
  const stacked = blockHeight(caps);
  if (stacked > availableHeight && stacked > 0) {
    const scale = availableHeight / stacked;
    caps = caps.map((c) => c * scale);
  }

  const widthAt = (i: number, cap: Mm): Mm =>
    fonts.measure(rows[i]!.text, { ...faces[i]!, sizeMm: sizeFor(i, cap) });

  for (let pass = 0; pass < FIT_PASSES; pass++) {
    const tops = rowTops(caps, heightMm);
    caps = caps.map((cap, i) => {
      const available = 2 * availableHalfWidth(doc, inset, tops[i]!, tops[i]! + cap);
      const width = widthAt(i, cap);
      return width > available && width > 0 ? cap * (available / width) : cap;
    });
  }

  const issues: LayoutIssue[] = [];
  const tops = rowTops(caps, heightMm);
  const laidOut = rows.map((row, i): LaidOutRow => {
    let cap = caps[i]!;
    if (cap < TEXT_LIMITS.minCapHeightMm) {
      issues.push({ code: "row-too-long", rowId: row.id });
      cap = TEXT_LIMITS.minCapHeightMm;
    } else if (cap < requested[i]! * SHRINK_NOTICE_RATIO) {
      issues.push({ code: "row-shrunk", rowId: row.id });
    }

    const top = tops[i]!;
    const half = availableHalfWidth(doc, inset, top, top + cap);
    const xMm =
      doc.align === "left" ? widthMm / 2 - half : doc.align === "right" ? widthMm / 2 + half : widthMm / 2;
    const rowWidth = widthAt(i, cap);
    const leftMm =
      doc.align === "left" ? xMm : doc.align === "right" ? xMm - rowWidth : xMm - rowWidth / 2;

    return {
      id: row.id,
      text: row.text,
      xMm,
      leftMm,
      baselineMm: top + cap,
      capHeightMm: cap,
      requestedCapHeightMm: requested[i]!,
      fontSizeMm: sizeFor(i, cap),
      bold: row.bold,
      anchor: ANCHOR_BY_ALIGN[doc.align],
      widthMm: rowWidth,
    };
  });

  return {
    widthMm,
    heightMm,
    outline: outlinePath(doc),
    fontId: doc.font,
    frames,
    contentInsetMm: inset,
    rows: laidOut,
    issues,
  };
}
