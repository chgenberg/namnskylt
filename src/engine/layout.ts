import { TEXT_LIMITS } from "./catalog";
import { engravedRows } from "./document";
import { availableHalfWidth, isEllipseShape, outlinePath } from "./shape";
import { placeLogoPath } from "./logo";
import { ZERO_OFFSET, clampOffset, moveRect, rectsOverlap, unionRect } from "./placement";
import type { BadgeDocument, FontId, Mm, Offset, Rect, TextAlign } from "./types";

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

/** Ett ramband: skyltens kontur indragen `insetMm`, `thicknessMm` bred inåt. */
export interface FrameBand {
  insetMm: Mm;
  thicknessMm: Mm;
}

export type LayoutIssue =
  | { code: "row-shrunk"; rowId: string }
  | { code: "row-too-long"; rowId: string };

/** Loggan placerad på skylten: ruta i mm och banorna flyttade dit. */
export interface LaidOutLogo extends Rect {
  d: string;
}

export interface BadgeLayout {
  widthMm: Mm;
  heightMm: Mm;
  outline: string;
  fontId: FontId;
  frames: FrameRing[];
  /** Säkerhetszonen: konturen indragen så här mycket. Text och logga stannar innanför. */
  contentInsetMm: Mm;
  rows: LaidOutRow[];
  logo: LaidOutLogo | null;
  issues: LayoutIssue[];
  /** Kundens förflyttningar efter att de hållits inom zonen. */
  textOffsetMm: Offset;
  logoOffsetMm: Offset;
  /** Versalernas ruta runt alla rader — det som dras i editorn. */
  textBox: Rect | null;
  logoOverlapsText: boolean;
}

/**
 * Leverantörens kantmarginal (samma som Skylt & Gravyrs editor): 3 mm på en
 * rak skylt, 2,5 mm på en skylt lägre än 11 mm, 2 mm längs en oval kontur.
 */
const EDGE_MARGIN_MM = 3;
const LOW_BADGE_EDGE_MARGIN_MM = 2.5;
const LOW_BADGE_HEIGHT_MM = 11;
const OVAL_EDGE_MARGIN_MM = 2;
/** Luft mellan ramens insida och text. */
const FRAME_TEXT_GAP_MM = 1.5;
/** Radavstånd som andel av de två grannradernas medelversalhöjd. */
const ROW_GAP_RATIO = 0.5;
/** Hur mycket mindre än önskat en rad får bli innan kunden behöver veta. */
const SHRINK_NOTICE_RATIO = 0.97;
const FIT_PASSES = 3;
/** Luft mellan loggan och texten. */
const LOGO_TEXT_GAP_MM = 2;
/** Loggan bredvid texten får ta högst så stor del av innehållets bredd. */
const LOGO_SIDE_MAX_WIDTH_RATIO = 0.4;
/** Loggan ovanför texten får ta högst så stor del av innehållets höjd. */
const LOGO_TOP_MAX_HEIGHT_RATIO = 0.5;

const ANCHOR_BY_ALIGN: Record<TextAlign, TextAnchor> = {
  left: "start",
  center: "middle",
  right: "end",
};

/** Ramarnas band utifrån, som indrag från skyltkanten. */
export function frameBands(doc: BadgeDocument): FrameBand[] {
  const { style, insetMm, thicknessMm } = doc.frame;
  if (style === "none") return [];
  const outer = { insetMm, thicknessMm };
  if (style === "solid") return [outer];
  const gapMm = Math.max(0.6, thicknessMm * 2);
  return [outer, { insetMm: insetMm + thicknessMm + gapMm, thicknessMm }];
}

function frameRings(doc: BadgeDocument): { frames: FrameRing[]; innerEdgeMm: Mm } {
  const bands = frameBands(doc);
  const frames = bands.map(({ insetMm, thicknessMm }) => ({
    d: `${outlinePath(doc, insetMm)}${outlinePath(doc, insetMm + thicknessMm)}`,
  }));
  const innermost = bands.at(-1);
  return { frames, innerEdgeMm: innermost ? innermost.insetMm + innermost.thicknessMm : 0 };
}

function edgeMarginMm(doc: BadgeDocument): Mm {
  if (isEllipseShape(doc.shape)) return OVAL_EDGE_MARGIN_MM;
  return doc.size.heightMm < LOW_BADGE_HEIGHT_MM ? LOW_BADGE_EDGE_MARGIN_MM : EDGE_MARGIN_MM;
}

/** Säkerhetszonens indrag: kantmarginalen, eller luft innanför ramen om den är större. */
export function safeInsetMm(doc: BadgeDocument): Mm {
  const { innerEdgeMm } = frameRings(doc);
  const edge = edgeMarginMm(doc);
  return doc.frame.style === "none" ? edge : Math.max(edge, innerEdgeMm + FRAME_TEXT_GAP_MM);
}

function rowGaps(caps: readonly Mm[]): Mm[] {
  return caps.slice(1).map((cap, i) => ROW_GAP_RATIO * ((caps[i]! + cap) / 2));
}

function blockHeight(caps: readonly Mm[]): Mm {
  return caps.reduce((sum, c) => sum + c, 0) + rowGaps(caps).reduce((sum, g) => sum + g, 0);
}

/** Raderna centrerade vertikalt mellan `top` och `bottom`. */
function rowTops(caps: readonly Mm[], top: Mm, bottom: Mm): Mm[] {
  const gaps = rowGaps(caps);
  let y = top + (bottom - top - blockHeight(caps)) / 2;
  return caps.map((cap, i) => {
    const top = y;
    y += cap + (gaps[i] ?? 0);
    return top;
  });
}

/** Ytan texten får använda — hela säkerhetszonen, minus loggans plats. */
interface TextRegion {
  left: Mm;
  right: Mm;
  top: Mm;
  bottom: Mm;
}

/** Loggan ovanför centreras ihop med texten, så båda beror av textblockets höjd. */
interface LogoPlan {
  /** Höjd kvar åt textblocket bredvid eller under loggan. */
  textHeightMm: Mm;
  boxFor(blockHeightMm: Mm): Rect;
  regionFor(blockHeightMm: Mm): TextRegion;
}

function planLogo(doc: BadgeDocument, inset: Mm): LogoPlan | null {
  const { logo } = doc;
  const { widthMm, heightMm } = doc.size;
  const contentW = widthMm - inset * 2;
  const contentH = heightMm - inset * 2;
  if (!logo || contentW <= 0 || contentH <= 0 || logo.viewWidth <= 0 || logo.viewHeight <= 0) {
    return null;
  }
  const aspect = logo.viewWidth / logo.viewHeight;
  const fit = (maxW: Mm, maxH: Mm) => {
    let h = Math.min(logo.heightMm, maxH);
    let w = h * aspect;
    if (w > maxW) {
      w = maxW;
      h = w / aspect;
    }
    return { w, h };
  };

  if (logo.placement === "top") {
    const { w, h } = fit(contentW, contentH * LOGO_TOP_MAX_HEIGHT_RATIO);
    const placeFor = (block: Mm) => {
      const total = h + (block > 0 ? LOGO_TEXT_GAP_MM + block : 0);
      return Math.max(inset, (heightMm - total) / 2);
    };
    return {
      textHeightMm: contentH - h - LOGO_TEXT_GAP_MM,
      boxFor: (block) => ({ x: (widthMm - w) / 2, y: placeFor(block), width: w, height: h }),
      regionFor(block) {
        const top = placeFor(block) + h + LOGO_TEXT_GAP_MM;
        return { left: inset, right: widthMm - inset, top, bottom: Math.min(top + block, heightMm - inset) };
      },
    };
  }

  const { w, h } = fit(contentW * LOGO_SIDE_MAX_WIDTH_RATIO, contentH);
  const y = (heightMm - h) / 2;
  const edge = widthMm / 2 - availableHalfWidth(doc, inset, y, y + h);
  const x = logo.placement === "left" ? edge : widthMm - edge - w;
  const region: TextRegion =
    logo.placement === "left"
      ? { left: x + w + LOGO_TEXT_GAP_MM, right: widthMm - inset, top: inset, bottom: heightMm - inset }
      : { left: inset, right: x - LOGO_TEXT_GAP_MM, top: inset, bottom: heightMm - inset };
  return { textHeightMm: contentH, boxFor: () => ({ x, y, width: w, height: h }), regionFor: () => region };
}

/**
 * Placerar loggan och textraderna. Raderna staplas vertikalt centrerade inom
 * textytan; en rad som inte ryms i bredd krymps — aldrig kondenseras —
 * eftersom gravyren ska se ut exakt som previewn.
 */
export function layoutBadge(doc: BadgeDocument, fonts: FontEngine): BadgeLayout {
  const { widthMm, heightMm } = doc.size;
  const { frames } = frameRings(doc);
  const inset = safeInsetMm(doc);
  const logoPlan = planLogo(doc, inset);
  const regionFor = (caps: readonly Mm[]): TextRegion =>
    logoPlan?.regionFor(blockHeight(caps)) ?? {
      left: inset,
      right: widthMm - inset,
      top: inset,
      bottom: heightMm - inset,
    };
  /** Radens vänster- och högerkant: textytan, och på en oval även konturen. */
  const rowSpan = (region: TextRegion, top: Mm, bottom: Mm) => {
    const half = availableHalfWidth(doc, inset, top, bottom);
    const left = Math.max(region.left, widthMm / 2 - half);
    const right = Math.min(region.right, widthMm / 2 + half);
    return { left, right: Math.max(left, right) };
  };
  const rows = engravedRows(doc);
  const faces = rows.map((r): FontFace => ({ fontId: doc.font, bold: r.bold }));
  const sizeFor = (i: number, cap: Mm): Mm => cap / fonts.capHeightRatio(faces[i]!);

  const requested = rows.map((r) =>
    Math.min(Math.max(r.capHeightMm, TEXT_LIMITS.minCapHeightMm), TEXT_LIMITS.maxCapHeightMm),
  );
  let caps = [...requested];

  const availableHeight = Math.max(0, logoPlan?.textHeightMm ?? heightMm - inset * 2);
  const stacked = blockHeight(caps);
  if (stacked > availableHeight && stacked > 0) {
    const scale = availableHeight / stacked;
    caps = caps.map((c) => c * scale);
  }

  const widthAt = (i: number, cap: Mm): Mm =>
    fonts.measure(rows[i]!.text, { ...faces[i]!, sizeMm: sizeFor(i, cap) });
  const topsFor = (current: readonly Mm[]) => {
    const region = regionFor(current);
    return { region, tops: rowTops(current, region.top, region.bottom) };
  };

  for (let pass = 0; pass < FIT_PASSES; pass++) {
    const { region, tops } = topsFor(caps);
    caps = caps.map((cap, i) => {
      const span = rowSpan(region, tops[i]!, tops[i]! + cap);
      const available = span.right - span.left;
      const width = widthAt(i, cap);
      return width > available && width > 0 ? cap * (available / width) : cap;
    });
  }

  const issues: LayoutIssue[] = [];
  const { region, tops } = topsFor(caps);
  const laidOut = rows.map((row, i): LaidOutRow => {
    let cap = caps[i]!;
    if (cap < TEXT_LIMITS.minCapHeightMm) {
      issues.push({ code: "row-too-long", rowId: row.id });
      cap = TEXT_LIMITS.minCapHeightMm;
    } else if (cap < requested[i]! * SHRINK_NOTICE_RATIO) {
      issues.push({ code: "row-shrunk", rowId: row.id });
    }

    const top = tops[i]!;
    const span = rowSpan(region, top, top + cap);
    const xMm =
      doc.align === "left" ? span.left : doc.align === "right" ? span.right : (span.left + span.right) / 2;
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

  const textOffsetMm = doc.textOffsetMm ? clampOffset(doc, inset, laidOut.map(rowBox), doc.textOffsetMm) : ZERO_OFFSET;
  const placedRows = laidOut.map((row) => moveRow(row, textOffsetMm));
  const autoLogo = logoPlan && doc.logo ? logoPlan.boxFor(blockHeight(caps)) : null;
  const logoOffsetMm =
    autoLogo && doc.logo?.offsetMm ? clampOffset(doc, inset, [autoLogo], doc.logo.offsetMm) : ZERO_OFFSET;
  const logoBox = autoLogo ? moveRect(autoLogo, logoOffsetMm) : null;
  const rowBoxes = placedRows.map(rowBox);

  return {
    widthMm,
    heightMm,
    outline: outlinePath(doc),
    fontId: doc.font,
    frames,
    contentInsetMm: inset,
    rows: placedRows,
    logo: logoBox && doc.logo ? placeLogo(doc.logo.d, doc.logo.viewWidth, logoBox) : null,
    issues,
    textOffsetMm,
    logoOffsetMm,
    textBox: unionRect(rowBoxes),
    logoOverlapsText: logoBox !== null && rowBoxes.some((box) => rectsOverlap(box, logoBox)),
  };
}

/** Radens versaler — marginalen mäts mot bokstäverna, inte mot radavståndet. */
function rowBox(row: LaidOutRow): Rect {
  return { x: row.leftMm, y: row.baselineMm - row.capHeightMm, width: row.widthMm, height: row.capHeightMm };
}

function moveRow(row: LaidOutRow, offset: Offset): LaidOutRow {
  if (offset.xMm === 0 && offset.yMm === 0) return row;
  return { ...row, xMm: row.xMm + offset.xMm, leftMm: row.leftMm + offset.xMm, baselineMm: row.baselineMm + offset.yMm };
}

function placeLogo(d: string, viewWidth: number, box: Rect): LaidOutLogo {
  return { ...box, d: placeLogoPath(d, box.width / viewWidth, box.x, box.y) };
}
