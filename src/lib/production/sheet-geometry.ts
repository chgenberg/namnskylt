import {
  engravingPaths,
  hasStraightSides,
  isEllipseShape,
  layoutBadge,
  outlinePath,
  type BadgeDocument,
  type FillRule,
  type FontEngine,
} from "@/engine";
import { computeCutGrid } from "./cut-grid";
import {
  fitHeader,
  HEADER_FACE,
  orderHeaderText,
  ORDER_HEADER_CAP_MAX_MM,
  SHEET_HEADER_CAP_MAX_MM,
  sheetHeaderText,
} from "./headers";
import { CUTTER_OFFSET_MM } from "./ink";
import { sharesCutLines, sheetCornerRadiusMm, type Box, type PackedSheet, type ProductionMethod } from "./packing";

/**
 * Allt som skärs och graveras på ett ark, i arkets mm (y nedåt). Skärmen,
 * utskriften och maskinfilen ritar samma lista — operatören granskar exakt
 * det maskinen kör.
 */
export type MarkInk = "cut" | "throughCut" | "engrave";

export interface SheetMark {
  ink: MarkInk;
  /** SVG-path i lokala koordinater; flyttas med `dx`/`dy`. */
  d: string;
  dx: number;
  dy: number;
  /** Satt för gravyr — fylld kontur. Skär är alltid ett streck. */
  fillRule?: FillRule;
  /** Skylten märket hör till, för markering i editorn. */
  placementKey?: string;
}

export interface SheetContext {
  fonts: FontEngine;
  method: ProductionMethod;
  productionNo: string | null;
  sheetNo: number;
  sheetCount: number;
}

function num(value: number): string {
  return String(Number(value.toFixed(4)));
}

function roundedRectPath(x: number, y: number, w: number, h: number, r0: number): string {
  const r = Math.max(0, Math.min(r0, w / 2, h / 2));
  if (r === 0) return `M${num(x)} ${num(y)}H${num(x + w)}V${num(y + h)}H${num(x)}Z`;
  const a = `A${num(r)} ${num(r)} 0 0 1`;
  return [
    `M${num(x + r)} ${num(y)}H${num(x + w - r)}`,
    `${a} ${num(x + w)} ${num(y + r)}V${num(y + h - r)}`,
    `${a} ${num(x + w - r)} ${num(y + h)}H${num(x + r)}`,
    `${a} ${num(x)} ${num(y + h - r)}V${num(y + r)}`,
    `${a} ${num(x + r)} ${num(y)}Z`,
  ].join("");
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${num(cx - rx)} ${num(cy)}A${num(rx)} ${num(ry)} 0 1 0 ${num(cx + rx)} ${num(cy)}A${num(rx)} ${num(ry)} 0 1 0 ${num(cx - rx)} ${num(cy)}Z`;
}

/** Fyra öppna 90°-bågar. Arkets rutnät skär de raka sidorna. */
function cornerArcPaths(w: number, h: number, r0: number): string[] {
  const r = Math.min(Math.max(0, r0), w / 2, h / 2);
  if (r <= 0) return [];
  const a = `A${num(r)} ${num(r)} 0 0 1`;
  return [
    `M${num(w - r)} 0${a} ${num(w)} ${num(r)}`,
    `M${num(w)} ${num(h - r)}${a} ${num(w - r)} ${num(h)}`,
    `M${num(r)} ${num(h)}${a} 0 ${num(h - r)}`,
    `M0 ${num(r)}${a} ${num(r)} 0`,
  ];
}

/**
 * Skyltens egen kontur. Metall skärs med verktygsoffset: konturen bommas ut
 * med verktygsradien (en skarp ytterkant får då radien som hörn — så går
 * verktygets centrum). Ovaler, runda och kantiga former genomskärs; raka kanter skärs.
 */
function outlineMarks(doc: BadgeDocument, method: ProductionMethod): Array<Pick<SheetMark, "ink" | "d">> {
  const { widthMm: w, heightMm: h } = doc.size;
  const r = sheetCornerRadiusMm(doc);
  if (!hasStraightSides(doc.shape)) {
    const o = method === "metal-cut" ? CUTTER_OFFSET_MM : 0;
    const d = isEllipseShape(doc.shape) ? ellipsePath(w / 2, h / 2, w / 2 + o, h / 2 + o) : outlinePath(doc, -o);
    return [{ ink: "throughCut", d }];
  }
  if (method === "metal-cut") {
    const o = CUTTER_OFFSET_MM;
    return [{ ink: "cut", d: roundedRectPath(-o, -o, w + o * 2, h + o * 2, r + o) }];
  }
  return cornerArcPaths(w, h, r).map((d) => ({ ink: "throughCut", d }));
}

export function sheetMarks(sheet: PackedSheet, ctx: SheetContext): SheetMark[] {
  const { fonts, method } = ctx;
  const { outline } = fonts;
  // Maskinen kan inte gravera <text> — utan glyfkonturer finns inget ark att köra.
  if (!outline) throw new Error("Typsnittets konturer är inte laddade");
  const marks: SheetMark[] = [];
  const engrave = (d: string, dx = 0, dy = 0, fillRule: FillRule = "nonzero", placementKey?: string) => {
    if (d) marks.push({ ink: "engrave", d, dx, dy, fillRule, ...(placementKey ? { placementKey } : {}) });
  };
  const headerOutline = (text: string, box: Box, maxCap: number) => {
    const fitted = fitHeader(text, box, maxCap, fonts);
    if (!fitted) return;
    engrave(outline(fitted.text, { ...HEADER_FACE, sizeMm: fitted.fontSizeMm }, fitted.xMm, fitted.baselineMm));
  };

  if (sheet.sheetHeader) {
    headerOutline(sheetHeaderText(ctx.productionNo, ctx.sheetNo, ctx.sheetCount), sheet.sheetHeader, SHEET_HEADER_CAP_MAX_MM);
  }
  for (const header of sheet.headers) headerOutline(orderHeaderText(header), header, ORDER_HEADER_CAP_MAX_MM);

  for (const placement of sheet.placements) {
    const { doc, key } = placement.unit;
    const paths = engravingPaths(layoutBadge(doc, fonts), fonts);
    for (const path of paths ?? []) engrave(path.d, placement.xMm, placement.yMm, path.fillRule, key);
    for (const outline of outlineMarks(doc, method)) {
      marks.push({ ...outline, dx: placement.xMm, dy: placement.yMm, placementKey: key });
    }
  }

  const grid = computeCutGrid(
    sheet.placements
      .filter((p) => sharesCutLines(p.unit.doc, method))
      .map((p) => ({ ...p, cornerRadiusMm: sheetCornerRadiusMm(p.unit.doc) })),
  );
  for (const s of grid.horizontal) {
    marks.push({ ink: "cut", d: `M${num(s.x1Mm)} ${num(s.yMm)}H${num(s.x2Mm)}`, dx: 0, dy: 0 });
  }
  for (const s of grid.vertical) {
    marks.push({ ink: "cut", d: `M${num(s.xMm)} ${num(s.y1Mm)}V${num(s.y2Mm)}`, dx: 0, dy: 0 });
  }
  return marks;
}
