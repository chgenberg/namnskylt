import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import {
  createBadgeDocument,
  engravingPaths,
  layoutBadge,
  renderBadgeSvg,
  type FontEngine,
} from "@/engine";
import { loadNodeFontEngine } from "./load-node";

let fonts: FontEngine;
before(async () => {
  fonts = await loadNodeFontEngine();
});

/** Alla koordinater i en absolut path (opentype skriver bara M/L/Q/C/Z). */
function pathBounds(d: string) {
  const numbers = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  const xs = numbers.filter((_, i) => i % 2 === 0);
  const ys = numbers.filter((_, i) => i % 2 === 1);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe("createFontEngine", () => {
  it("läser versalhöjden ur fonten", () => {
    const ratio = fonts.capHeightRatio({ fontId: "arial", bold: false });
    assert.ok(Math.abs(ratio - 0.688) < 0.001);
  });

  it("mäter med Arials avancebredder och smalare i Narrow", () => {
    const font = { fontId: "arial" as const, bold: false, sizeMm: 10 };
    const regular = fonts.measure("Anna Lindqvist", font);
    const narrow = fonts.measure("Anna Lindqvist", { ...font, fontId: "arial-narrow" });
    assert.ok(Math.abs(regular - 65.6) < 0.1);
    assert.ok(narrow < regular * 0.85);
  });

  it("ger glyfkonturer på exakt den versalhöjd layouten räknat", () => {
    const doc = createBadgeDocument(["HELENA"]);
    const layout = layoutBadge(doc, fonts);
    const row = layout.rows[0]!;
    const bounds = pathBounds(engravingPaths(layout, fonts)![0]!.d);
    assert.ok(Math.abs(bounds.maxY - row.baselineMm) < 0.01);
    assert.ok(Math.abs(row.baselineMm - bounds.minY - row.capHeightMm) < 0.01);
    assert.ok(bounds.minX >= row.leftMm - 0.01 && bounds.maxX <= row.leftMm + row.widthMm + 0.01);
  });

  it("ger giltiga konturer för svenska namn och siffror", () => {
    const texts = ["Anna Lindqvist", "Projektledare", "Erik Holm", "Överläkare", "Avdelning 4"];
    for (const font of ["arial", "arial-narrow"] as const) {
      const doc = { ...createBadgeDocument(texts.slice(0, 3)), font };
      for (const path of engravingPaths(layoutBadge(doc, fonts), fonts)!) {
        const at = path.d.indexOf("NaN");
        assert.equal(at, -1, `${font}/${path.id}: ${path.d.slice(Math.max(0, at - 60), at + 20)}`);
      }
    }
  });

  it("ritar produktionsfilen med konturer i stället för text", () => {
    const doc = {
      ...createBadgeDocument(["Anna Lindqvist", "Projektledare"]),
      frame: { style: "solid" as const, insetMm: 1.5, thicknessMm: 0.4 },
    };
    const svg = renderBadgeSvg(doc, layoutBadge(doc, fonts), { mode: "production", fonts });
    assert.ok(!svg.includes("<text"));
    assert.equal(svg.match(/fill="#000000"/g)?.length, 3);
    assert.ok(svg.includes('fill-rule="evenodd"'));
  });
});
