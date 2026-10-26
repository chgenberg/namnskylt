import { CAP_HEIGHT_RATIO, TEXT_LIMITS, getFont } from "./catalog";
import { engravedRows } from "./document";
import { availableHalfWidth, outlinePath } from "./shape";
import type { BadgeDocument, Mm, TextAlign } from "./types";

export interface MeasureFont {
  css: string;
  sizeMm: Mm;
  bold: boolean;
}

/** Textbredd i mm. Injiceras: canvas i webbläsaren, tabell på servern och i test. */
export type TextMeasurer = (text: string, font: MeasureFont) => Mm;

export type TextAnchor = "start" | "middle" | "end";

export interface LaidOutRow {
  id: string;
  text: string;
  xMm: Mm;
  baselineMm: Mm;
  capHeightMm: Mm;
  requestedCapHeightMm: Mm;
  fontSizeMm: Mm;
  bold: boolean;
  anchor: TextAnchor;
  widthMm: Mm;
}

export interface FramePath {
  d: string;
  strokeMm: Mm;
}

export type LayoutIssue =
  | { code: "row-shrunk"; rowId: string }
  | { code: "row-too-long"; rowId: string };

export interface BadgeLayout {
  widthMm: Mm;
  heightMm: Mm;
  outline: string;
  frames: FramePath[];
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

function framePaths(doc: BadgeDocument): { frames: FramePath[]; innerEdgeMm: Mm } {
  const { style, insetMm, thicknessMm: t } = doc.frame;
  if (style === "none") return { frames: [], innerEdgeMm: 0 };

  const outer: FramePath = { d: outlinePath(doc, insetMm + t / 2), strokeMm: t };
  if (style === "solid") return { frames: [outer], innerEdgeMm: insetMm + t };

  const gap = Math.max(0.6, t * 2);
  const inner: FramePath = { d: outlinePath(doc, insetMm + t + gap + t / 2), strokeMm: t };
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
export function layoutBadge(doc: BadgeDocument, measure: TextMeasurer): BadgeLayout {
  const { widthMm, heightMm } = doc.size;
  const { frames, innerEdgeMm } = framePaths(doc);
  const inset = doc.frame.style === "none" ? EDGE_MARGIN_MM : innerEdgeMm + FRAME_TEXT_GAP_MM;
  const font = getFont(doc.font);
  const rows = engravedRows(doc);

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
    measure(rows[i]!.text, { css: font.css, sizeMm: cap / CAP_HEIGHT_RATIO, bold: rows[i]!.bold });

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

    return {
      id: row.id,
      text: row.text,
      xMm,
      baselineMm: top + cap,
      capHeightMm: cap,
      requestedCapHeightMm: requested[i]!,
      fontSizeMm: cap / CAP_HEIGHT_RATIO,
      bold: row.bold,
      anchor: ANCHOR_BY_ALIGN[doc.align],
      widthMm: widthAt(i, cap),
    };
  });

  return {
    widthMm,
    heightMm,
    outline: outlinePath(doc),
    frames,
    contentInsetMm: inset,
    rows: laidOut,
    issues,
  };
}
