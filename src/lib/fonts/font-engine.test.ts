import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import {
  engravingPaths,
  layoutBadge,
  renderBadgeSvg,
  type FontEngine,
} from "@/engine";
import { engravedBadge } from "@/engine/testing";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createFontEngine, drawnText } from "./font-engine";
import { FALLBACK_FILES, FONT_FILES, type FontFile, type FontFileKey } from "./font-files";
import { loadNodeFontEngine } from "./load-node";

/** Fontfilerna som buffertar, som webbläsaren hämtar dem. */
async function buffersOf(files: readonly FontFile[]): Promise<Map<FontFileKey, ArrayBuffer>> {
  const entries = await Promise.all(
    files.map(async ({ key, file }) => {
      const data = await readFile(path.join(process.cwd(), "public", "fonts", file));
      return [key, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer] as [FontFileKey, ArrayBuffer];
    }),
  );
  return new Map(entries);
}

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
    // Roboto, som verkstaden ritar Arial med: H är 1456 av 2048 enheter.
    const ratio = fonts.capHeightRatio({ fontId: "arial", bold: false });
    assert.ok(Math.abs(ratio - 0.711) < 0.001);
  });

  it("mäter med verkstadens avancebredder och smalare i Narrow", () => {
    const font = { fontId: "arial" as const, bold: false, sizeMm: 10 };
    const regular = fonts.measure("Anna Lindqvist", font);
    const narrow = fonts.measure("Anna Lindqvist", { ...font, fontId: "arial-narrow" });
    assert.ok(Math.abs(regular - 65.86) < 0.1);
    // Roboto Condensed är smalare än Roboto, men inte lika smal som Arial Narrow.
    assert.ok(narrow < regular * 0.9);
  });

  it("ritar hela raden i reservtypsnittet när typsnittet saknar ett tecken", () => {
    const narrow = { fontId: "arial-narrow" as const, bold: false };
    const arial = { fontId: "arial" as const, bold: false };
    // Roboto Condensed är en latinsk delmängd utan grekiska; Roboto har dem.
    assert.ok(Math.abs(fonts.capHeightRatio(narrow, "Ωmega") - 0.688) < 0.001);
    assert.ok(Math.abs(fonts.capHeightRatio(arial, "Ωmega") - 0.711) < 0.001);
    // Svenska och övriga latinska namn stannar i radens eget typsnitt.
    for (const text of ["Åsa Öberg", "Łukasz", "Šárka", "Çağla", ""]) {
      assert.ok(Math.abs(fonts.capHeightRatio(narrow, text) - 0.711) < 0.001, text);
    }
    // Reservens bredd och konturer gäller hela raden, inte bara tecknet som saknas.
    const size = { ...narrow, sizeMm: 10 };
    assert.ok(fonts.measure("Ωmega", size) > fonts.measure("mega", size) * 1.4);
    assert.ok((fonts.outline?.("Ωmega", size, 0, 10) ?? "").length > 100);
    // Layouten räknar radens storlek med reservens versalhöjd, så versalerna får rätt höjd.
    const doc = { ...engravedBadge(["ΩMEGA"]), font: "arial-narrow" as const };
    const layout = layoutBadge(doc, fonts);
    const row = layout.rows[0]!;
    const bounds = pathBounds(engravingPaths(layout, fonts)![0]!.d);
    assert.ok(Math.abs(row.baselineMm - bounds.minY - row.capHeightMm) < 0.25, `${row.baselineMm - bounds.minY} mot ${row.capHeightMm}`);
  });

  it("ger glyfkonturer på exakt den versalhöjd layouten räknat", () => {
    const doc = engravedBadge(["HELENA"]);
    const layout = layoutBadge(doc, fonts);
    const row = layout.rows[0]!;
    const bounds = pathBounds(engravingPaths(layout, fonts)![0]!.d);
    assert.ok(Math.abs(bounds.maxY - row.baselineMm) < 0.01);
    assert.ok(Math.abs(row.baselineMm - bounds.minY - row.capHeightMm) < 0.01);
    assert.ok(bounds.minX >= row.leftMm - 0.01 && bounds.maxX <= row.leftMm + row.widthMm + 0.01);
  });

  it("mäter och ritar raden som verkstaden gör: hårda blanksteg är blanksteg och noll-breda tecken ritas inte", () => {
    assert.equal(drawnText("Anna\u00a0Lind\u200b"), "Anna Lind");
    assert.equal(drawnText("A\tB\u2009C\ufeff"), "A B C");
    const narrow = { fontId: "arial-narrow" as const, bold: false };
    const size = { ...narrow, sizeMm: 10 };
    // Ett inklistrat noll-brett tecken får inte byta hela raden till reservtypsnittet.
    assert.ok(Math.abs(fonts.capHeightRatio(narrow, "Anna\u200bLind") - 0.711) < 0.001);
    assert.equal(fonts.measure("Anna\u200bLind", size), fonts.measure("AnnaLind", size));
    assert.equal(fonts.measure("Anna\u00a0Lind", size), fonts.measure("Anna Lind", size));
    assert.equal(fonts.outline?.("Anna\u2009Lind", size, 0, 10), fonts.outline?.("Anna Lind", size, 0, 10));
  });

  it("webbläsaren får reservtypsnittet i efterhand: raden som väntade på det ska ritas om", async () => {
    const engine = createFontEngine(await buffersOf(FONT_FILES));
    const narrow = { fontId: "arial-narrow" as const, bold: false };
    // Utan reservtypsnittet ritas raden i sitt eget typsnitt så länge.
    assert.ok(Math.abs(engine.capHeightRatio(narrow, "Åsa") - 0.711) < 0.001);
    const extra = await buffersOf(FALLBACK_FILES);
    // Ingen rad har behövt reserven än: inget ska ritas om.
    assert.equal(createFontEngine(await buffersOf(FONT_FILES)).addFonts(extra), false);
    // En rad med grekiska ritades utan reserven: den ska ritas om när filerna kommit.
    assert.ok(Math.abs(engine.capHeightRatio(narrow, "Ωmega") - 0.711) < 0.001);
    assert.equal(engine.addFonts(extra), true);
    assert.ok(Math.abs(engine.capHeightRatio(narrow, "Ωmega") - 0.688) < 0.001);
    // Därefter finns inget kvar att rita om.
    assert.equal(engine.addFonts(new Map()), false);
  });

  it("ger giltiga konturer för svenska namn och siffror", () => {
    const texts = ["Anna Lindqvist", "Projektledare", "Erik Holm", "Överläkare", "Avdelning 4"];
    for (const font of ["arial", "arial-narrow"] as const) {
      const doc = { ...engravedBadge(texts.slice(0, 3)), font };
      for (const path of engravingPaths(layoutBadge(doc, fonts), fonts)!) {
        const at = path.d.indexOf("NaN");
        assert.equal(at, -1, `${font}/${path.id}: ${path.d.slice(Math.max(0, at - 60), at + 20)}`);
      }
    }
  });

  it("ritar produktionsfilen med konturer i stället för text", () => {
    const doc = {
      // En skylt som graveras: det som printas finns inte i produktionsfilen.
      ...engravedBadge(["Anna Lindqvist", "Projektledare"]),
      frame: { style: "solid" as const, insetMm: 1.5, thicknessMm: 0.4 },
    };
    const svg = renderBadgeSvg(doc, layoutBadge(doc, fonts), { mode: "production", fonts });
    assert.ok(!svg.includes("<text"));
    assert.equal(svg.match(/fill="#000000"/g)?.length, 3);
    assert.ok(svg.includes('fill-rule="evenodd"'));
  });
});
