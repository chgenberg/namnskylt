import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approxFonts, createBadgeDocument, type BadgeDocument, type FontEngine } from "@/engine";
import { computeCutGrid } from "./cut-grid";
import { sheetToDxf } from "./dxf";
import { flattenPath } from "./flatten-path";
import { fitHeader, HEADER_CAP_MIN_MM, orderHeaderText, sheetHeaderText } from "./headers";
import { CUTTER_OFFSET_MM } from "./ink";
import {
  DEFAULT_SHEET_SETTINGS,
  HEADER_TO_PLACEMENT_GAP_MM,
  METAL_GAP_MM,
  packSheets,
  productionBatches,
  ROUND_GAP_MM,
  type PackedPlacement,
  type ProductionOrder,
} from "./packing";
import { sheetMarks } from "./sheet-geometry";
import { renderMachineSvg } from "./sheet-svg";

/** Tabellmått plus en ruta per textrad som "kontur" — räcker för geometri. */
const fonts: FontEngine = {
  ...approxFonts,
  outline: (text, font, x, baseline) => {
    const w = approxFonts.measure(text, font);
    const cap = font.sizeMm * approxFonts.capHeightRatio(font);
    return `M${x} ${baseline}h${w}v${-cap}h${-w}Z`;
  },
};

function badge(patch: Partial<BadgeDocument> = {}, texts = ["Anna Lind", "Butikschef"]): BadgeDocument {
  return { ...createBadgeDocument(texts), ...patch };
}

function order(orderNo: string, badges: BadgeDocument[]): ProductionOrder {
  return { orderNo, customer: "Test", placedAt: "2026-10-27T08:00:00Z", badges };
}

function plasticUnits(orders: ProductionOrder[]) {
  const batch = productionBatches(orders)[0];
  assert.ok(batch);
  return batch.units;
}

const square = { shape: "rectangle" as const, cornerRadiusMm: 0 };

describe("productionBatches", () => {
  it("delar upp på material och färg och gör en enhet per exemplar", () => {
    const batches = productionBatches([
      order("NS-1", [badge({ quantity: 3 }), badge({ materialId: "stainless", colorId: "steel-laser" })]),
      order("NS-2", [badge({ colorId: "black-white" })]),
    ]);
    assert.deepEqual(
      batches.map((b) => [b.key, b.method, b.units.length]),
      [
        ["plastic-2-layer/white-black", "plastic-sheet", 3],
        ["stainless/steel-laser", "metal-cut", 1],
        ["plastic-2-layer/black-white", "plastic-sheet", 1],
      ],
    );
    assert.deepEqual(
      batches[0]?.units.map((u) => u.key),
      ["NS-1:1#1", "NS-1:1#2", "NS-1:1#3"],
    );
  });
});

describe("packSheets", () => {
  it("lägger raka skyltar kant i kant under orderns rubrik", () => {
    const { sheets } = packSheets(plasticUnits([order("NS-1", [badge({ ...square, quantity: 2 })])]), "plastic-sheet");
    const [sheet] = sheets;
    assert.ok(sheet);
    const top = DEFAULT_SHEET_SETTINGS.offsetYMm + DEFAULT_SHEET_SETTINGS.headerHeightMm + HEADER_TO_PLACEMENT_GAP_MM;
    assert.deepEqual(
      sheet.placements.map((p) => [p.xMm, p.yMm]),
      [
        [5, top],
        [5, top + 25],
      ],
    );
    assert.deepEqual(
      sheet.headers.map((h) => [h.orderNo, h.xMm, h.yMm, h.widthMm]),
      [["NS-1", 5, 8, 70]],
    );
  });

  it("ger ovaler och metall luft så konturerna inte går in i varandra", () => {
    const ovals = packSheets(plasticUnits([order("NS-1", [badge({ shape: "oval", quantity: 2 })])]), "plastic-sheet");
    const [a, b] = ovals.sheets[0]?.placements ?? [];
    assert.ok(a && b);
    assert.equal(b.yMm - (a.yMm + a.heightMm), ROUND_GAP_MM);

    const metalBadge = badge({ materialId: "stainless", colorId: "steel-laser", quantity: 2 });
    const metal = packSheets(productionBatches([order("NS-2", [metalBadge])])[0]?.units ?? [], "metal-cut");
    const [c, d] = metal.sheets[0]?.placements ?? [];
    assert.ok(c && d);
    assert.equal(d.yMm - (c.yMm + c.heightMm), METAL_GAP_MM);
    assert.ok(METAL_GAP_MM > CUTTER_OFFSET_MM * 2);
  });

  it("ger varje fästtyp en egen ark-rad", () => {
    const { sheets } = packSheets(
      plasticUnits([order("NS-1", [badge({ ...square, mounting: "magnet" }), badge({ ...square, mounting: "pin" })])]),
      "plastic-sheet",
    );
    const placements = sheets[0]?.placements ?? [];
    assert.deepEqual(
      placements.map((p) => p.unit.doc.mounting),
      ["pin", "magnet"],
    );
    const [pin, magnet] = placements;
    assert.ok(pin && magnet);
    assert.equal(magnet.xMm, pin.xMm);
    assert.ok(magnet.yMm > pin.yMm + pin.heightMm + DEFAULT_SHEET_SETTINGS.stripGapMm);
  });

  it("håller varje ark-rad inom kaplängden och numrerar orderns block", () => {
    const { sheets, settings } = packSheets(
      plasticUnits([order("NS-7", [badge({ ...square, size: { widthMm: 90, heightMm: 40 }, quantity: 60 })])]),
      "plastic-sheet",
    );
    const sheet = sheets[0];
    assert.ok(sheet);
    for (const header of sheet.headers) {
      const inStrip: PackedPlacement[] = sheet.placements.filter((p) => p.yMm > header.yMm && p.yMm < header.yMm + settings.maxStripHeightMm);
      for (const p of inStrip as readonly PackedPlacement[]) assert.ok(p.yMm + p.heightMm <= header.yMm + settings.maxStripHeightMm + 1e-9);
    }
    const headers = sheets.flatMap((s) => s.headers);
    assert.ok(headers.length > 1);
    assert.deepEqual(
      headers.map((h) => `${h.sectionNo}/${h.sectionCount}`),
      headers.map((_, i) => `${i + 1}/${headers.length}`),
    );
    assert.equal(sheets.flatMap((s) => s.placements).length, 60);
  });

  it("fortsätter på en ny skiva när arket är fullt", () => {
    const { sheets } = packSheets(
      plasticUnits([order("NS-9", [badge({ ...square, size: { widthMm: 120, heightMm: 60 }, quantity: 50 })])]),
      "plastic-sheet",
      { sheetWidthMm: 300, sheetHeightMm: 300 },
    );
    assert.ok(sheets.length > 1);
    for (const sheet of sheets) {
      for (const p of sheet.placements) {
        assert.ok(p.xMm + p.widthMm <= sheet.widthMm);
        assert.ok(p.yMm + p.heightMm <= sheet.heightMm);
      }
    }
  });

  it("säger ifrån om en skylt är större än arket", () => {
    const { unplaced, sheets } = packSheets(plasticUnits([order("NS-3", [badge()])]), "plastic-sheet", {
      sheetWidthMm: 50,
    });
    assert.equal(unplaced[0]?.reason, "Större än arket");
    assert.equal(sheets.length, 0);
  });
});

describe("computeCutGrid", () => {
  it("skär delade kanter en gång", () => {
    const grid = computeCutGrid([
      { xMm: 0, yMm: 0, widthMm: 70, heightMm: 25, cornerRadiusMm: 0 },
      { xMm: 0, yMm: 25, widthMm: 70, heightMm: 25, cornerRadiusMm: 0 },
    ]);
    assert.equal(grid.horizontal.length, 3);
    assert.deepEqual(
      grid.vertical.map((v) => [v.xMm, v.y1Mm, v.y2Mm]),
      [
        [0, 0, 50],
        [70, 0, 50],
      ],
    );
  });

  it("lämnar rundade hörn åt genomskäret", () => {
    const grid = computeCutGrid([{ xMm: 0, yMm: 0, widthMm: 70, heightMm: 25, cornerRadiusMm: 3 }]);
    assert.deepEqual(grid.horizontal[0], { yMm: 0, x1Mm: 3, x2Mm: 67 });
  });
});

describe("rubriker", () => {
  it("följer verkstadens format", () => {
    assert.equal(orderHeaderText({ orderNo: "NS-1042", mounting: "magnet", sectionNo: 1, sectionCount: 1 }), "#NS-1042 MAGNET 1/1");
    assert.equal(sheetHeaderText("2026-014", 2, 5), "[PO#2026-014] Skiva 2/5");
    assert.equal(sheetHeaderText(null, 1, 1), "[PO# -] Skiva 1/1");
  });

  it("krymper först och kapar sedan med ellips", () => {
    const box = { xMm: 0, yMm: 0, widthMm: 40, heightMm: 6 };
    const fitted = fitHeader("#NS-1042 SÄKERHETSNÅL 1/1", box, 4.5, fonts);
    assert.ok(fitted);
    assert.ok(fitted.capMm < 4.2);
    assert.ok(approxFonts.measure(fitted.text, { fontId: "arial", bold: true, sizeMm: fitted.fontSizeMm }) <= 40 + 1e-9);

    const narrow = fitHeader("#NS-1042 SÄKERHETSNÅL 1/1", { ...box, widthMm: 20 }, 4.5, fonts);
    assert.ok(narrow);
    assert.ok(narrow.text.endsWith("…"));
    assert.equal(narrow.capMm, HEADER_CAP_MIN_MM);
  });
});

describe("flattenPath", () => {
  it("följer relativa kommandon och stänger konturen", () => {
    const [rect] = flattenPath("M1 2h10v5h-10Z");
    assert.ok(rect);
    assert.equal(rect.closed, true);
    assert.deepEqual(rect.points.at(-1), { x: 1, y: 2 });
    assert.deepEqual(rect.points[2], { x: 11, y: 7 });
  });

  it("delar bågar i segment som landar i slutpunkten", () => {
    const [arc] = flattenPath("M0 0A10 10 0 0 1 10 10");
    assert.ok(arc && arc.points.length > 4);
    assert.deepEqual(arc.points.at(-1), { x: 10, y: 10 });
    for (const p of arc.points) assert.ok(Math.abs(Math.hypot(p.x - 0, p.y - 10) - 10) < 1e-6);
  });
});

describe("sheetMarks och DXF", () => {
  const ctx = { fonts, productionNo: "2026-001", sheetNo: 1, sheetCount: 1 };

  it("rundad plast: rutnät i rött, hörnen i blått genomskär", () => {
    const { sheets } = packSheets(plasticUnits([order("NS-1", [badge({ quantity: 2 })])]), "plastic-sheet");
    const sheet = sheets[0];
    assert.ok(sheet);
    const marks = sheetMarks(sheet, { ...ctx, method: "plastic-sheet" });
    assert.equal(marks.filter((m) => m.ink === "throughCut").length, 8);
    assert.ok(marks.some((m) => m.ink === "cut"));
    assert.ok(marks.filter((m) => m.ink === "engrave").length >= 2 * 2 + 2);
    assert.match(renderMachineSvg(sheet, marks), /stroke="#FF0000" stroke-width="0.03"/);
  });

  it("metall: egen utbommad kontur per skylt i CUT-lagret, y uppåt", () => {
    const metalBadge = badge({ ...square, materialId: "stainless", colorId: "steel-laser" });
    const { sheets } = packSheets(productionBatches([order("NS-2", [metalBadge])])[0]?.units ?? [], "metal-cut");
    const sheet = sheets[0];
    const placement = sheet?.placements[0];
    assert.ok(sheet && placement);
    const marks = sheetMarks(sheet, { ...ctx, method: "metal-cut" });
    const cuts = marks.filter((m) => m.ink === "cut");
    assert.equal(cuts.length, 1);

    const dxf = sheetToDxf(cuts, sheet.heightMm);
    assert.match(dxf, /AC1009/);
    const xs: number[] = [];
    const ys: number[] = [];
    const lines = dxf.split("\n");
    lines.forEach((value, i) => {
      if (value === "10" || value === "11") xs.push(Number(lines[i + 1]));
      if (value === "20" || value === "21") ys.push(Number(lines[i + 1]));
    });
    const o = CUTTER_OFFSET_MM;
    assert.ok(Math.abs(Math.min(...xs) - (placement.xMm - o)) < 0.01);
    assert.ok(Math.abs(Math.max(...xs) - (placement.xMm + 70 + o)) < 0.01);
    assert.ok(Math.abs(Math.max(...ys) - (sheet.heightMm - placement.yMm + o)) < 0.01);
    assert.ok(dxf.includes("\n8\nCUT\n"));
  });
});
