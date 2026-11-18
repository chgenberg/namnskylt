import { TEXT_LIMITS } from "./catalog";
import { engravedRows } from "./document";
import { availableHalfWidth, isEllipseShape, outlinePath } from "./shape";
import { logoEngravingPath, placeLogoPath } from "./logo";
import { logoMarking, logoPrintInkOf, nameMarking, printInkOf, rowPrintInkOf } from "./marking";
import { ZERO_OFFSET, clampOffset, moveRect, rectsOverlap, unionRect } from "./placement";
import type { BadgeDocument, BadgeLogo, FontId, LogoPlacement, Mm, Offset, Rect, TextAlign } from "./types";

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
  /**
   * Versalhöjd som andel av em — skiljer mellan typsnitt. `text` är raden som
   * ska ritas: saknar typsnittet ett av dess tecken ritas raden i
   * reservtypsnittet, och då är det reservens versalhöjd som gäller.
   */
  capHeightRatio(face: FontFace, text?: string): number;
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
  /** Kundens hexfärg för radens tryck, när namnet printas. Utan den ritas raden i gravyrens färg. */
  ink?: string;
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
  /** Loggan printas i stället för att graveras: banorna hör då till trycket och inte till gravyren. */
  printed?: true;
  /** Loggan i färg när den printas. Bilden trycks i rutan; utan den trycks banorna i en färg. */
  imageSrc?: string;
  /** Färgen en svartvit logga som printas ritas i, när kundens kod går att rita. Utan den gäller gravyrens färg. */
  ink?: string;
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
  /** Namnet, alltså text och ram, printas i stället för att graveras. */
  namePrinted: boolean;
  /** Färgen för hela trycket, när kundens kod går att rita: ramen och rader utan egen kod. `null` ger gravyrens färg. */
  printInk: string | null;
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
/** Steg för att krympa texten under en flyttad logga: felet halveras för varje steg. */
const HEIGHT_FIT_STEPS = 40;
/** Luft mellan loggan och texten. */
const LOGO_TEXT_GAP_MM = 2;
/** Loggan bredvid texten får ta högst så stor del av innehållets bredd. */
const LOGO_SIDE_MAX_WIDTH_RATIO = 0.4;
/** Loggan ovanför texten får ta högst så stor del av innehållets höjd. */
const LOGO_TOP_MAX_HEIGHT_RATIO = 0.5;
/**
 * Taken när kunden själv har satt loggans storlek (`BadgeLogo.sizing`, besked via ägaren
 * 2026-11-18, som drog reglaget i botten utan att loggan växte mer än marginellt): loggan får
 * ta så stor del av bredden bredvid texten, och av höjden ovanför den. Resten är textens.
 */
const LOGO_FREE_SIDE_MAX_WIDTH_RATIO = 0.72;
const LOGO_FREE_TOP_MAX_HEIGHT_RATIO = 0.7;
/** Så stor del av innehållets bredd eller höjd behöver texten för att få plats bredvid en flyttad logga. */
const MIN_TEXT_SHARE = 0.25;

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

/**
 * Textytan bredvid loggan där loggan faktiskt står (besked via ägaren 2026-11-18, som såg texten
 * ligga över en logga som hade flyttats: "behöver lägga någon minsta marginal mellan logo och
 * text, så att det ligger automatiskt"). Förut räknades textytan alltid från loggans ursprungliga
 * plats, så en flyttad logga hamnade under texten.
 *
 * Texten får den större av de två ytorna på var sin sida om loggan, med `LOGO_TEXT_GAP_MM` luft:
 * till höger eller vänster om en logga som står bredvid texten, under eller över en som står
 * ovanför. Ryms texten inte på någon sida gäller placeringens egen yta, och då varnar
 * skyltmotorn för att loggan ligger över texten.
 */
function clearOfLogo(planned: TextRegion, logo: Rect, placement: LogoPlacement, bounds: TextRegion, block: Mm): TextRegion {
  if (placement === "top") {
    const above = logo.y - LOGO_TEXT_GAP_MM - bounds.top;
    const below = bounds.bottom - (logo.y + logo.height + LOGO_TEXT_GAP_MM);
    if (Math.max(above, below) < (bounds.bottom - bounds.top) * MIN_TEXT_SHARE) return planned;
    if (below >= above) {
      const top = logo.y + logo.height + LOGO_TEXT_GAP_MM;
      return { left: bounds.left, right: bounds.right, top, bottom: Math.min(top + block, bounds.bottom) };
    }
    const bottom = logo.y - LOGO_TEXT_GAP_MM;
    return { left: bounds.left, right: bounds.right, top: Math.max(bottom - block, bounds.top), bottom };
  }
  const left = logo.x - LOGO_TEXT_GAP_MM - bounds.left;
  const right = bounds.right - (logo.x + logo.width + LOGO_TEXT_GAP_MM);
  if (Math.max(left, right) < (bounds.right - bounds.left) * MIN_TEXT_SHARE) return planned;
  return right >= left
    ? { ...planned, left: logo.x + logo.width + LOGO_TEXT_GAP_MM, right: bounds.right }
    : { ...planned, left: bounds.left, right: logo.x - LOGO_TEXT_GAP_MM };
}

/**
 * Textens flytt med luft mot loggan. Hamnar texten över loggan eller närmare den än
 * `LOGO_TEXT_GAP_MM`, dras den tillbaka bort från loggan så långt som behövs och ryms inom
 * säkerhetszonen. En flytt som passade ett kort namn drar annars ett långt namn i samma
 * design in över loggan.
 */
function awayFromLogo(doc: BadgeDocument, inset: Mm, boxes: readonly Rect[], offset: Offset, logo: Rect, placement: LogoPlacement): Offset {
  const text = unionRect(boxes.map((box) => moveRect(box, offset)));
  if (!text) return offset;
  const near = { x: logo.x - LOGO_TEXT_GAP_MM, y: logo.y - LOGO_TEXT_GAP_MM, width: logo.width + LOGO_TEXT_GAP_MM * 2, height: logo.height + LOGO_TEXT_GAP_MM * 2 };
  if (!rectsOverlap(text, near)) return offset;
  if (placement === "top") {
    const below = text.y + text.height / 2 >= logo.y + logo.height / 2;
    const dy = below ? near.y + near.height - text.y : near.y - (text.y + text.height);
    return clampOffset(doc, inset, boxes, { xMm: offset.xMm, yMm: offset.yMm + dy });
  }
  const rightOf = text.x + text.width / 2 >= logo.x + logo.width / 2;
  const dx = rightOf ? near.x + near.width - text.x : near.x - (text.x + text.width);
  return clampOffset(doc, inset, boxes, { xMm: offset.xMm + dx, yMm: offset.yMm });
}

/** Loggan ovanför centreras ihop med texten, så båda beror av textblockets höjd. */
interface LogoPlan {
  /** Höjd kvar åt textblocket bredvid eller under loggan. */
  textHeightMm: Mm;
  boxFor(blockHeightMm: Mm): Rect;
  regionFor(blockHeightMm: Mm): TextRegion;
}

/**
 * Loggan bredvid texten när kunden själv har satt storleken: så stor som önskat, men aldrig
 * bredare än sin del av skyltens bredd där loggan står. På en oval smalnar skylten uppåt och
 * nedåt, så en högre logga har mindre bredd att ta av. Höjden söks därför fram.
 */
function fitFreeSide(doc: BadgeDocument, inset: Mm, fit: (maxW: Mm, maxH: Mm) => { w: Mm; h: Mm }): { w: Mm; h: Mm } {
  const { heightMm } = doc.size;
  const contentH = heightMm - inset * 2;
  const wanted = fit(Infinity, contentH);
  const aspect = wanted.w / wanted.h;
  const fits = (h: Mm) => {
    const top = (heightMm - h) / 2;
    return h * aspect <= availableHalfWidth(doc, inset, top, top + h) * 2 * LOGO_FREE_SIDE_MAX_WIDTH_RATIO;
  };
  if (fits(wanted.h)) return wanted;
  let low = 0;
  let high = wanted.h;
  for (let step = 0; step < 24; step++) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return { w: low * aspect, h: low };
}

/**
 * Hur hög loggan ritas nu, och hur hög den som mest kan bli på skylten med den placering den
 * har. Reglaget för loggans storlek går mellan de två, så att hela reglaget gör skillnad.
 */
export function logoHeightLimits(doc: BadgeDocument): { drawnMm: Mm; maxMm: Mm } | null {
  if (!doc.logo) return null;
  const inset = safeInsetMm(doc);
  const drawn = planLogo(doc, inset);
  const largest = planLogo({ ...doc, logo: { ...doc.logo, heightMm: Number.MAX_SAFE_INTEGER, sizing: "free" } }, inset);
  if (!drawn || !largest) return null;
  return { drawnMm: drawn.boxFor(0).height, maxMm: largest.boxFor(0).height };
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

  // En skylt utan text bär bara loggan (beslut av ägaren 2026-11-18): den står mitt på skylten
  // och får ta hela ytan, i stället för att stå vid sidan av en text som inte finns.
  if (engravedRows(doc).length === 0) {
    let { w, h } = fit(contentW, contentH);
    const top = (heightMm - h) / 2;
    const widest = availableHalfWidth(doc, inset, top, top + h) * 2;
    if (w > widest) {
      w = widest;
      h = w / aspect;
    }
    const box: Rect = { x: (widthMm - w) / 2, y: (heightMm - h) / 2, width: w, height: h };
    const region: TextRegion = { left: inset, right: widthMm - inset, top: inset, bottom: heightMm - inset };
    return { textHeightMm: contentH, boxFor: () => box, regionFor: () => region };
  }

  const free = logo.sizing === "free";
  if (logo.placement === "top") {
    const { w, h } = fit(contentW, contentH * (free ? LOGO_FREE_TOP_MAX_HEIGHT_RATIO : LOGO_TOP_MAX_HEIGHT_RATIO));
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

  const { w, h } = free ? fitFreeSide(doc, inset, fit) : fit(contentW * LOGO_SIDE_MAX_WIDTH_RATIO, contentH);
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
  const bounds: TextRegion = { left: inset, right: widthMm - inset, top: inset, bottom: heightMm - inset };
  /** Loggans ruta som den ritas: där placeringen lägger den, flyttad dit kunden har dragit den. */
  const logoAt = (block: Mm) => {
    if (!logoPlan || !doc.logo) return null;
    const auto = logoPlan.boxFor(block);
    const offset = doc.logo.offsetMm ? clampOffset(doc, inset, [auto], doc.logo.offsetMm) : ZERO_OFFSET;
    return { offset, box: moveRect(auto, offset), moved: offset.xMm !== 0 || offset.yMm !== 0 };
  };
  const regionFor = (caps: readonly Mm[]): TextRegion => {
    const block = blockHeight(caps);
    const planned = logoPlan?.regionFor(block) ?? bounds;
    const placed = logoAt(block);
    // Står loggan där placeringen lade den gäller placeringens egen textyta, som alltid. Har kunden
    // flyttat loggan följer textytan med, så att texten inte hamnar under den.
    return placed?.moved && doc.logo ? clearOfLogo(planned, placed.box, doc.logo.placement, bounds, block) : planned;
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
  const sizeFor = (i: number, cap: Mm): Mm => cap / fonts.capHeightRatio(faces[i]!, rows[i]!.text);

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

  /**
   * En flyttad logga ovanför texten kan ta höjd från den: raderna krymps tills de ryms under
   * (eller över) loggan. Loggans egen plats beror på textens höjd, så höjden söks fram stegvis.
   * Görs före bredden, eftersom en rad som hamnar utanför säkerhetszonen annars får bredden noll.
   */
  const fitHeight = () => {
    for (let step = 0; step < HEIGHT_FIT_STEPS && logoAt(blockHeight(caps))?.moved; step++) {
      const fitted = regionFor(caps);
      const room = fitted.bottom - fitted.top;
      const block = blockHeight(caps);
      if (!(room > 0) || block <= room + 1e-9) break;
      caps = caps.map((cap) => cap * (room / block));
    }
  };

  fitHeight();
  for (let pass = 0; pass < FIT_PASSES; pass++) {
    const { region, tops } = topsFor(caps);
    caps = caps.map((cap, i) => {
      const span = rowSpan(region, tops[i]!, tops[i]! + cap);
      const available = span.right - span.left;
      const width = widthAt(i, cap);
      return width > available && width > 0 ? cap * (available / width) : cap;
    });
  }
  // Raderna kan ha krympts på bredden: då står loggan ovanför lite lägre, och höjden prövas igen.
  fitHeight();

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
    const ink = rowPrintInkOf(doc, row);
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
      ...(ink && { ink }),
    };
  });

  const placedLogo = logoAt(blockHeight(caps));
  const logoOffsetMm = placedLogo?.offset ?? ZERO_OFFSET;
  const logoBox = placedLogo?.box ?? null;
  // Texten får flyttas fritt inom säkerhetszonen, men aldrig närmare loggan än marginalen.
  const wantedTextOffset = doc.textOffsetMm ? clampOffset(doc, inset, laidOut.map(rowBox), doc.textOffsetMm) : ZERO_OFFSET;
  const textOffsetMm =
    doc.textOffsetMm && logoBox && doc.logo
      ? awayFromLogo(doc, inset, laidOut.map(rowBox), wantedTextOffset, logoBox, doc.logo.placement)
      : wantedTextOffset;
  const placedRows = laidOut.map((row) => moveRow(row, textOffsetMm));
  const rowBoxes = placedRows.map(rowBox);

  return {
    widthMm,
    heightMm,
    outline: outlinePath(doc),
    fontId: doc.font,
    frames,
    contentInsetMm: inset,
    rows: placedRows,
    logo: logoBox && doc.logo ? placeLogo(doc.logo, logoBox, logoMarking(doc) === "print", logoPrintInkOf(doc)) : null,
    issues,
    textOffsetMm,
    logoOffsetMm,
    textBox: unionRect(rowBoxes),
    logoOverlapsText: logoBox !== null && rowBoxes.some((box) => rectsOverlap(box, logoBox)),
    namePrinted: nameMarking(doc) === "print",
    printInk: printInkOf(doc),
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

function placeLogo(logo: BadgeLogo, box: Rect, printed: boolean, ink: string | null): LaidOutLogo {
  return {
    ...box,
    // Trycket följer loggans siluett; gravyren följer gravyrformen, när loggan i färg har en.
    d: placeLogoPath(printed ? logo.d : logoEngravingPath(logo), box.width / logo.viewWidth, box.x, box.y),
    ...(printed && { printed: true as const }),
    ...(printed && logo.image && { imageSrc: logo.image.src }),
    // Bilden har sina egna färger; bara en logga som trycks i en färg har en färg att rita.
    ...(printed && !logo.image && ink && { ink }),
  };
}
