import {
  effectiveCornerRadius,
  getMaterial,
  hasStraightSides,
  type BadgeDocument,
  type MaterialFinish,
  type MountingId,
} from "@/engine";
import { CUTTER_OFFSET_MM } from "./ink";

/**
 * Arkplacering efter verkstadens modell (Skylt & Gravyrteknik): skyltarna
 * staplas i kolumner inom en ark-rad som aldrig är högre än kaplängden, så
 * operatören kan kapa av rader med gejder. Varje fästtyp får egna rader —
 * fästet monteras per rad efter gravyren. Varje order får en graverad rubrik
 * ovanför sina skyltar. Raka skyltar ligger kant i kant och delar skärlinje.
 *
 * Ren modul: editorn, utskriften och maskinfilerna packar exakt likadant.
 */

/** Plast graveras och skärs på arket; metall fiberlasras och skärs ut med verktygsoffset. */
export type ProductionMethod = "plastic-sheet" | "metal-cut";

export interface ProductionOrder {
  orderNo: string;
  customer: string;
  company?: string;
  placedAt: string;
  badges: readonly BadgeDocument[];
}

/** En fysisk skylt. */
export interface ProductionUnit {
  key: string;
  orderNo: string;
  /** Kopia nummer (1-baserat) av orderradens antal. */
  copyNo: number;
  copyCount: number;
  doc: BadgeDocument;
}

export interface ProductionBatch {
  key: string;
  materialId: BadgeDocument["materialId"];
  colorId: string;
  method: ProductionMethod;
  units: ProductionUnit[];
}

export interface SheetSettings {
  sheetWidthMm: number;
  sheetHeightMm: number;
  /** Var första skylten börjar från arkets kanter. */
  offsetXMm: number;
  offsetYMm: number;
  /** Maxhöjd på en ark-rad (kaplängd), rubriken inräknad. */
  maxStripHeightMm: number;
  stripGapMm: number;
  showHeaders: boolean;
  headerHeightMm: number;
  showSheetHeader: boolean;
  sheetHeaderHeightMm: number;
}

export const DEFAULT_SHEET_SETTINGS: SheetSettings = {
  sheetWidthMm: 600,
  sheetHeightMm: 600,
  offsetXMm: 5,
  offsetYMm: 8,
  maxStripHeightMm: 180,
  stripGapMm: 8,
  showHeaders: true,
  headerHeightMm: 6,
  showSheetHeader: true,
  sheetHeaderHeightMm: 6,
};

/** Luft mellan orderrubriken och skylten under — svansarna på j/p/g ska inte nå skärlinjen. */
export const HEADER_TO_PLACEMENT_GAP_MM = 3;
const HEADER_TOP_MARGIN_MM = 2;
/** Ovaler tangerar bara varandras måttrutor och kan inte dela skärlinje. */
export const ROUND_GAP_MM = 2;
/** Två utbommade konturer plus luft, så verktyget aldrig går in i grannen. */
export const METAL_GAP_MM = CUTTER_OFFSET_MM * 2 + 2;

/** Ordningen fästena monteras i. */
const MOUNTING_ORDER: readonly MountingId[] = ["pin", "magnet", "clip", "safety-pin"];

export interface Box {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

export interface PackedPlacement extends Box {
  unit: ProductionUnit;
}

export interface PackedHeader extends Box {
  orderNo: string;
  mounting: MountingId;
  /** Rubrikblockets nummer för ordern och orderns totala antal block i batchen. */
  sectionNo: number;
  sectionCount: number;
}

export interface PackedSheet {
  index: number;
  widthMm: number;
  heightMm: number;
  placements: PackedPlacement[];
  headers: PackedHeader[];
  sheetHeader: Box | null;
}

export interface PackingResult {
  settings: SheetSettings;
  method: ProductionMethod;
  sheets: PackedSheet[];
  unplaced: Array<{ unit: ProductionUnit; reason: string }>;
}

/** Skivmaterial som skärs i ark med delade skärlinjer; metall frässkärs styckvis. */
const SHEET_FINISHES: ReadonlySet<MaterialFinish> = new Set(["plastic", "acrylic", "epoxy"]);

export function productionMethod(doc: BadgeDocument): ProductionMethod {
  return SHEET_FINISHES.has(getMaterial(doc.materialId).finish) ? "plastic-sheet" : "metal-cut";
}

/** Ordrarnas skyltar uppdelade i batcher: en batch är ett material i en färg. */
export function productionBatches(orders: readonly ProductionOrder[]): ProductionBatch[] {
  const batches = new Map<string, ProductionBatch>();
  for (const order of orders) {
    order.badges.forEach((doc, line) => {
      const key = `${doc.materialId}/${doc.colorId}`;
      let batch = batches.get(key);
      if (!batch) {
        batch = { key, materialId: doc.materialId, colorId: doc.colorId, method: productionMethod(doc), units: [] };
        batches.set(key, batch);
      }
      for (let copy = 1; copy <= doc.quantity; copy += 1) {
        batch.units.push({
          key: `${order.orderNo}:${line + 1}#${copy}`,
          orderNo: order.orderNo,
          copyNo: copy,
          copyCount: doc.quantity,
          doc,
        });
      }
    });
  }
  return [...batches.values()];
}

/** Raka, rundade och kapselformade skyltar har raka sidor som kan delas med grannen. */
export function sharesCutLines(doc: BadgeDocument, method: ProductionMethod): boolean {
  return method === "plastic-sheet" && hasStraightSides(doc.shape);
}

export function sheetCornerRadiusMm(doc: BadgeDocument): number {
  return effectiveCornerRadius(doc);
}

function gapFor(doc: BadgeDocument, method: ProductionMethod): number {
  if (method === "metal-cut") return METAL_GAP_MM;
  return hasStraightSides(doc.shape) ? 0 : ROUND_GAP_MM;
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function normalizeSheetSettings(input: Partial<SheetSettings> = {}): SheetSettings {
  const s = { ...DEFAULT_SHEET_SETTINGS, ...input };
  const d = DEFAULT_SHEET_SETTINGS;
  return {
    ...s,
    sheetWidthMm: positive(s.sheetWidthMm, d.sheetWidthMm),
    sheetHeightMm: positive(s.sheetHeightMm, d.sheetHeightMm),
    offsetXMm: nonNegative(s.offsetXMm),
    offsetYMm: nonNegative(s.offsetYMm),
    maxStripHeightMm: positive(s.maxStripHeightMm, d.maxStripHeightMm),
    stripGapMm: nonNegative(s.stripGapMm),
    headerHeightMm: positive(s.headerHeightMm, d.headerHeightMm),
    sheetHeaderHeightMm: positive(s.sheetHeaderHeightMm, d.sheetHeaderHeightMm),
  };
}

/** Skivans rubrikband överst, eller `null` när det är avstängt. */
export function sheetHeaderBox(settings: SheetSettings): Box | null {
  if (!settings.showSheetHeader) return null;
  const insetX = 2;
  const widthMm = settings.sheetWidthMm - settings.offsetXMm * 2 - insetX;
  if (widthMm <= 0) return null;
  return {
    xMm: settings.offsetXMm + insetX,
    yMm: HEADER_TOP_MARGIN_MM,
    widthMm,
    heightMm: settings.sheetHeaderHeightMm,
  };
}

function groupInOrder<T>(items: readonly T[], keyOf: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()];
}

/** Fäste först, sedan order i inläggningsordning, sedan storlek — samma mått hålls samlade. */
function sortUnits(units: readonly ProductionUnit[]): ProductionUnit[] {
  const byMounting = [...units].sort(
    (a, b) => MOUNTING_ORDER.indexOf(a.doc.mounting) - MOUNTING_ORDER.indexOf(b.doc.mounting),
  );
  return groupInOrder(byMounting, (u) => `${u.doc.mounting}|${u.orderNo}`).flatMap((block) =>
    groupInOrder(block, (u) => `${u.doc.size.widthMm}x${u.doc.size.heightMm}`).flat(),
  );
}

interface Column {
  blockKey: string;
  sizeKey: string;
  xMm: number;
  widthMm: number;
  bottomMm: number;
  gapMm: number;
}

interface Strip {
  topMm: number;
  bottomMm: number;
  rightMm: number | null;
  rightGapMm: number;
}

/**
 * Packar en batch på ark. Kolumnerna fylls uppifrån och ned; när raden är
 * full fortsätter blocket i en ny ark-rad under, och när skivan är full på
 * en ny skiva.
 */
export function packSheets(
  units: readonly ProductionUnit[],
  method: ProductionMethod,
  settingsInput: Partial<SheetSettings> = {},
): PackingResult {
  const settings = normalizeSheetSettings(settingsInput);
  const { sheetWidthMm, sheetHeightMm, offsetXMm, offsetYMm } = settings;
  const headerBox = sheetHeaderBox(settings);
  const firstStripTopMm = Math.max(offsetYMm, headerBox ? headerBox.yMm + headerBox.heightMm : 0);
  const headerBandMm = settings.showHeaders ? settings.headerHeightMm + HEADER_TO_PLACEMENT_GAP_MM : 0;
  const leftMm = offsetXMm;
  const rightMm = sheetWidthMm - offsetXMm;
  const bottomLimitMm = sheetHeightMm - offsetXMm;
  const maxContentHeightMm = Math.min(settings.maxStripHeightMm, bottomLimitMm - firstStripTopMm) - headerBandMm;

  const sheets: PackedSheet[] = [];
  const unplaced: PackingResult["unplaced"] = [];
  let sheet: PackedSheet | null = null;
  let strip: Strip = { topMm: firstStripTopMm, bottomMm: firstStripTopMm, rightMm: null, rightGapMm: 0 };
  const open: { column: Column | null; header: { blockKey: string; box: PackedHeader } | null } = {
    column: null,
    header: null,
  };

  const openSheet = (): PackedSheet => {
    const next: PackedSheet = {
      index: sheets.length,
      widthMm: sheetWidthMm,
      heightMm: sheetHeightMm,
      placements: [],
      headers: [],
      sheetHeader: headerBox,
    };
    sheets.push(next);
    strip = { topMm: firstStripTopMm, bottomMm: firstStripTopMm, rightMm: null, rightGapMm: 0 };
    open.column = null;
    open.header = null;
    return next;
  };

  const openStrip = (contentHeightMm: number): PackedSheet => {
    const current = sheet ?? openSheet();
    const empty = strip.rightMm === null;
    const topMm = empty ? strip.topMm : strip.bottomMm + settings.stripGapMm;
    if (topMm + headerBandMm + contentHeightMm > bottomLimitMm) return openSheet();
    if (empty) return current;
    strip = { topMm, bottomMm: topMm, rightMm: null, rightGapMm: 0 };
    open.column = null;
    open.header = null;
    return current;
  };

  let previousMounting: MountingId | null = null;
  for (const unit of sortUnits(units)) {
    const { widthMm, heightMm } = unit.doc.size;
    if (widthMm > rightMm - leftMm || heightMm > maxContentHeightMm) {
      unplaced.push({ unit, reason: "Större än arket" });
      continue;
    }
    if (unit.doc.mounting !== previousMounting) {
      sheet = openStrip(heightMm);
      previousMounting = unit.doc.mounting;
    }
    const gapMm = gapFor(unit.doc, method);
    const blockKey = `${unit.doc.mounting}|${unit.orderNo}`;
    const sizeKey = `${widthMm}x${heightMm}`;

    for (;;) {
      sheet ??= openSheet();
      const contentTopMm = strip.topMm + headerBandMm;
      const stripLimitMm = Math.min(strip.topMm + settings.maxStripHeightMm, bottomLimitMm);
      const current = open.column;
      if (current && current.blockKey === blockKey && current.sizeKey === sizeKey) {
        const yMm = current.bottomMm + Math.max(current.gapMm, gapMm);
        if (yMm + heightMm <= stripLimitMm) {
          sheet.placements.push({ unit, xMm: current.xMm, yMm, widthMm, heightMm });
          current.bottomMm = yMm + heightMm;
          current.gapMm = Math.max(current.gapMm, gapMm);
          strip.bottomMm = Math.max(strip.bottomMm, current.bottomMm);
          break;
        }
      }
      const xMm = strip.rightMm === null ? leftMm : strip.rightMm + Math.max(strip.rightGapMm, gapMm);
      if (xMm + widthMm > rightMm || contentTopMm + heightMm > stripLimitMm) {
        sheet = openStrip(heightMm);
        continue;
      }
      sheet.placements.push({ unit, xMm, yMm: contentTopMm, widthMm, heightMm });
      open.column = { blockKey, sizeKey, xMm, widthMm, bottomMm: contentTopMm + heightMm, gapMm };
      strip.rightMm = xMm + widthMm;
      strip.rightGapMm = gapMm;
      strip.bottomMm = Math.max(strip.bottomMm, contentTopMm + heightMm);
      if (settings.showHeaders) {
        const header = open.header;
        if (header && header.blockKey === blockKey) {
          header.box.widthMm = xMm + widthMm - header.box.xMm;
        } else {
          const box: PackedHeader = {
            orderNo: unit.orderNo,
            mounting: unit.doc.mounting,
            xMm,
            yMm: strip.topMm,
            widthMm,
            heightMm: settings.headerHeightMm,
            sectionNo: 1,
            sectionCount: 1,
          };
          open.header = { blockKey, box };
          sheet.headers.push(box);
        }
      }
      break;
    }
  }

  numberSections(sheets);
  return { settings, method, sheets, unplaced };
}

/**
 * Den som plockar ihop leveransen räknar rubrikblock, inte skivor: `2/3`
 * betyder att ordern har tre block i batchen och att det här är det andra.
 */
function numberSections(sheets: readonly PackedSheet[]): void {
  const all = sheets.flatMap((sheet) => sheet.headers);
  const totals = new Map<string, number>();
  for (const header of all) totals.set(header.orderNo, (totals.get(header.orderNo) ?? 0) + 1);
  const seen = new Map<string, number>();
  for (const header of all) {
    const no = (seen.get(header.orderNo) ?? 0) + 1;
    seen.set(header.orderNo, no);
    header.sectionNo = no;
    header.sectionCount = totals.get(header.orderNo) ?? no;
  }
}

/** Skyltarnas yta delat med arkets. */
export function sheetUtilization(sheet: PackedSheet): number {
  const used = sheet.placements.reduce((sum, p) => sum + p.widthMm * p.heightMm, 0);
  return used / (sheet.widthMm * sheet.heightMm);
}
