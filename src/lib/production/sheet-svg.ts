import { HAIRLINE_MM, PRODUCTION_INK, PROOF_STROKE_MM } from "./ink";
import type { Box, PackedSheet } from "./packing";
import type { SheetMark } from "./sheet-geometry";

export interface SheetSvgOptions {
  /** Tjocka linjer för granskning — aldrig till maskinen. */
  proof?: boolean;
  /** Editorläge: arkkant, träffytor och markering. */
  interactive?: boolean;
  /** Ordernummer på varje skylt. Graveras inte. */
  labels?: boolean;
  selectedKey?: string | null;
  /** `width`/`height` i mm — utskrift i skala 1:1. */
  physicalSize?: boolean;
  /** Visa bara den här delen av arket (skärmzoom). */
  crop?: Box | null;
}

const SELECTION = "#2F5DA8";
/** Ungefär så långt `[PO#2026-041] Skiva 10/12` blir vid 3 mm versalhöjd. */
const SHEET_HEADER_TEXT_SPAN_MM = 64;
const LABEL_INK = "rgba(47,93,168,.75)";
/**
 * En hårlinje på 0,03 mm syns inte på ett nedskalat ark. I editorn hålls de
 * en pixel breda vid varje zoom; filen och utskriften behåller sitt mått.
 */
const SCREEN_HAIRLINE_STYLE = `<style>[stroke-width="${HAIRLINE_MM}"]{stroke-width:1px;vector-effect:non-scaling-stroke}</style>`;

function num(value: number): string {
  return String(Number(value.toFixed(4)));
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function markMarkup(mark: SheetMark, strokeMm: number): string {
  const transform = mark.dx || mark.dy ? ` transform="translate(${num(mark.dx)} ${num(mark.dy)})"` : "";
  if (mark.ink === "engrave") {
    return `<path d="${mark.d}" fill="${PRODUCTION_INK.engrave}" fill-rule="${mark.fillRule ?? "nonzero"}"${transform}/>`;
  }
  const color = mark.ink === "cut" ? PRODUCTION_INK.cut : PRODUCTION_INK.throughCut;
  return `<path d="${mark.d}" fill="none" stroke="${color}" stroke-width="${strokeMm}" stroke-linecap="butt"${transform}/>`;
}

/**
 * Skärmens hjälp (arkkant, etiketter, markering) är märkt `data-screen` och
 * hör inte till gravyren.
 */
export function renderSheetSvg(sheet: PackedSheet, marks: readonly SheetMark[], opts: SheetSvgOptions = {}): string {
  const { widthMm: w, heightMm: h } = sheet;
  const strokeMm = opts.proof ? PROOF_STROKE_MM : HAIRLINE_MM;
  const parts: string[] = [];
  if (opts.interactive && !opts.proof) parts.push(SCREEN_HAIRLINE_STYLE);
  parts.push(
    `<rect data-screen="1" x="0" y="0" width="${num(w)}" height="${num(h)}" fill="#FFFFFF"${
      opts.interactive ? ` stroke="rgba(10,10,11,.25)" stroke-width="0.6"` : ""
    }/>`,
  );
  for (const mark of marks) parts.push(markMarkup(mark, strokeMm));

  for (const placement of sheet.placements) {
    const { xMm, yMm, widthMm, heightMm, unit } = placement;
    if (opts.labels) {
      const size = Math.min(heightMm * 0.28, 3);
      parts.push(
        `<text data-screen="1" x="${num(xMm + 1)}" y="${num(yMm + size + 0.6)}" font-family="ui-monospace, monospace" font-size="${num(size)}" fill="${LABEL_INK}">${escapeXml(`${unit.orderNo} · ${unit.copyNo}/${unit.copyCount}`)}</text>`,
      );
    }
    if (opts.interactive) {
      const selected = opts.selectedKey === unit.key;
      parts.push(
        `<rect data-screen="1" data-placement-key="${escapeXml(unit.key)}" x="${num(xMm)}" y="${num(yMm)}" width="${num(widthMm)}" height="${num(heightMm)}" fill="${
          selected ? "rgba(47,93,168,.08)" : "transparent"
        }" stroke="${selected ? SELECTION : "none"}" stroke-width="0.8" style="cursor:pointer"/>`,
      );
    }
  }

  const size = opts.physicalSize ? ` width="${num(w)}mm" height="${num(h)}mm"` : ` width="100%" height="100%"`;
  const view = opts.crop ?? { xMm: 0, yMm: 0, widthMm: w, heightMm: h };
  const viewBox = `${num(view.xMm)} ${num(view.yMm)} ${num(view.widthMm)} ${num(view.heightMm)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${size} preserveAspectRatio="xMidYMid meet">${parts.join("")}</svg>`;
}

/** Ytan skyltar och rubriker tar, med luft runt — för att zooma in på ett glest ark. */
export function usedArea(sheet: PackedSheet, marginMm = 6): Box {
  // Skivrubrikens band går över hela arket men texten är kort.
  const sheetHeader = sheet.sheetHeader
    ? [{ ...sheet.sheetHeader, widthMm: Math.min(sheet.sheetHeader.widthMm, SHEET_HEADER_TEXT_SPAN_MM) }]
    : [];
  const boxes: Box[] = [...sheet.placements, ...sheet.headers, ...sheetHeader];
  if (boxes.length === 0) return { xMm: 0, yMm: 0, widthMm: sheet.widthMm, heightMm: sheet.heightMm };
  const x1 = Math.max(0, Math.min(...boxes.map((b) => b.xMm)) - marginMm);
  const y1 = Math.max(0, Math.min(...boxes.map((b) => b.yMm)) - marginMm);
  const x2 = Math.min(sheet.widthMm, Math.max(...boxes.map((b) => b.xMm + b.widthMm)) + marginMm);
  const y2 = Math.min(sheet.heightMm, Math.max(...boxes.map((b) => b.yMm + b.heightMm)) + marginMm);
  return { xMm: x1, yMm: y1, widthMm: x2 - x1, heightMm: y2 - y1 };
}

/** Maskinfilen: bara det som skärs och graveras, i verkliga mm. */
export function renderMachineSvg(sheet: PackedSheet, marks: readonly SheetMark[]): string {
  const { widthMm: w, heightMm: h } = sheet;
  const body = marks.map((mark) => markMarkup(mark, HAIRLINE_MM)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(w)} ${num(h)}" width="${num(w)}mm" height="${num(h)}mm">${body}</svg>`;
}
