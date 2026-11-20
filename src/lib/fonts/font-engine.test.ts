import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import {
  FONTS,
  FONT_IDS,
  engravingPaths,
  hasBold,
  layoutBadge,
  renderBadgeSvg,
  type FontEngine,
} from "@/engine";
import { engravedBadge } from "@/engine/testing";
import { readFile, stat } from "node:fs/promises";
import { parse } from "opentype.js";
import path from "node:path";
import { createFontEngine, drawnText } from "./font-engine";
import { CORE_FONT_FILES, FALLBACK_FILES, fontFileKey, fontFileOf, type FontFile, type FontFileKey } from "./font-files";
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
    const engine = createFontEngine(await buffersOf(CORE_FONT_FILES));
    const narrow = { fontId: "arial-narrow" as const, bold: false };
    // Utan reservtypsnittet ritas raden i sitt eget typsnitt så länge.
    assert.ok(Math.abs(engine.capHeightRatio(narrow, "Åsa") - 0.711) < 0.001);
    const extra = await buffersOf(FALLBACK_FILES);
    // Ingen rad har behövt reserven än: inget ska ritas om.
    assert.equal(createFontEngine(await buffersOf(CORE_FONT_FILES)).addFonts(extra), false);
    // En rad med grekiska ritades utan reserven: den ska ritas om när filerna kommit.
    assert.ok(Math.abs(engine.capHeightRatio(narrow, "Ωmega") - 0.711) < 0.001);
    assert.equal(engine.addFonts(extra), true);
    assert.ok(Math.abs(engine.capHeightRatio(narrow, "Ωmega") - 0.688) < 0.001);
    // Därefter finns inget kvar att rita om.
    assert.equal(engine.addFonts(new Map()), false);
  });

  it("ett typsnitt utöver verkstadens läses först när en rad ritas i det, och ritas i grundtypsnittet så länge", async () => {
    const pacifico = { fontId: "pacifico" as const, bold: false, sizeMm: 10 };
    const arial = { fontId: "arial" as const, bold: false, sizeMm: 10 };
    // Servern läser filen från disk när raden ritas: bokstäverna är typsnittets egna.
    const own = fonts.outline?.("Åsa Lind", pacifico, 0, 10) ?? "";
    assert.ok(own.length > 200 && !own.includes("NaN"));
    assert.notEqual(own, fonts.outline?.("Åsa Lind", arial, 0, 10));
    // Webbläsaren har inte filen: raden ritas i grundtypsnittet, filen begärs, och raden ska ritas om när den har kommit.
    const asked: FontFileKey[] = [];
    const engine = createFontEngine(await buffersOf(CORE_FONT_FILES), { onMissing: (key) => asked.push(key) });
    assert.equal(engine.outline?.("Åsa Lind", pacifico, 0, 10), engine.outline?.("Åsa Lind", arial, 0, 10));
    assert.deepEqual(asked, ["pacifico/regular"]);
    const file = [{ key: "pacifico/regular" as const, file: fontFileOf("pacifico/regular")! }];
    assert.equal(engine.addFonts(await buffersOf(file)), true);
    assert.equal(engine.outline?.("Åsa Lind", pacifico, 0, 10), own);
    assert.equal(engine.addFonts(new Map()), false);
  });

  it("ett typsnitt utan fet stil ritar en fet rad i normal stil", () => {
    assert.equal(hasBold("pacifico"), false);
    assert.equal(fontFileKey({ fontId: "pacifico", bold: true }), "pacifico/regular");
    assert.equal(fontFileKey({ fontId: "oswald", bold: true }), "oswald/bold");
    const size = { fontId: "pacifico" as const, sizeMm: 10 };
    assert.equal(fonts.measure("Anna", { ...size, bold: true }), fonts.measure("Anna", { ...size, bold: false }));
  });

  it("verkstadens typsnitt ritas av biblioteket självt, som förut", async () => {
    // Motorns kontur för Arial är bibliotekets egen, tecken för tecken: inget i den vägen har ändrats.
    const data = await readFile(path.join(process.cwd(), "public", "fonts", "Roboto-Regular.ttf"));
    const roboto = parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
    const arial = { fontId: "arial" as const, bold: false, sizeMm: 10 };
    for (const text of ["Åsa Öberg", "AVATAR Wolf", "Tove Lindqvist"]) {
      assert.equal(fonts.measure(text, arial), roboto.getAdvanceWidth(text, 10, { kerning: true }), text);
      const own = fonts.outline?.(text, arial, 3, 12) ?? "";
      const theirs = roboto.getPath(text, 3, 12, 10, { kerning: true }).commands;
      assert.equal((own.match(/[MLQCZ]/g) ?? []).length, theirs.length, text);
    }
  });

  it("ett typsnitt vars regler för sammansatta tecken inte går att läsa ritas glyf för glyf", () => {
    // Oswald är ett sådant: biblioteket kastar ett fel för varje rad på mer än ett tecken.
    const oswald = { fontId: "oswald" as const, bold: false, sizeMm: 10 };
    const width = fonts.measure("Åsa Öberg", oswald);
    assert.ok(width > 20 && width < 60, String(width));
    const d = fonts.outline?.("Åsa Öberg", oswald, 5, 10) ?? "";
    assert.ok(d.length > 200 && !d.includes("NaN"));
    // Måttet och konturen hör ihop: konturen börjar vid x och slutar inom radens bredd.
    const xs = [...d.matchAll(/[MLQC]([-\d.]+ [-\d.]+ ?)+/g)].flatMap((m) => m[0].slice(1).trim().split(" ").filter((_, i) => i % 2 === 0).map(Number));
    assert.ok(Math.min(...xs) >= 4.5 && Math.max(...xs) <= 5 + width + 0.5, `${Math.min(...xs)}–${Math.max(...xs)} mot ${width}`);
  });

  it("varje typsnitt i listan har sina filer, och de fria typsnitten sin licens", async () => {
    assert.ok(FONTS.length >= 150, String(FONTS.length));
    assert.equal(new Set(FONT_IDS).size, FONT_IDS.length);
    const dir = path.join(process.cwd(), "public", "fonts");
    const notice = await readFile(path.join(dir, "google", "LICENSES.txt"), "utf8");
    for (const font of FONTS) {
      for (const file of [font.files.regular, font.files.bold]) if (file) assert.ok((await stat(path.join(dir, file))).size > 5_000, file);
      if (font.workshop) continue;
      assert.match(await readFile(path.join(dir, "google", "licenses", `${font.id}.txt`), "utf8"), /SIL OPEN FONT LICENSE|Apache License|UBUNTU FONT LICENCE/i, font.id);
      assert.ok(notice.includes(`${font.name} — `), font.name);
    }
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
