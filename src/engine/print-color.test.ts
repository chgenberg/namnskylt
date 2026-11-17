import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMaterial } from "./catalog";
import { pigmentCodeText, pigmentCodes } from "./color-choice";
import { createBadgeDocument } from "./document";
import { engravingPaths, printedPaths } from "./engraving";
import { layoutBadge, type FontEngine } from "./layout";
import {
  PRINT_COLOR_MAX,
  cleanPrintColor,
  printColorHex,
  printColorLabel,
  printColorOf,
  printInkOf,
  rowPrintColorOf,
  rowPrintInkOf,
} from "./marking";
import { approxFonts } from "./measure";
import { renderBadgeSvg } from "./render-svg";
import { badgeDocumentSchema } from "./schema";
import type { BadgeDocument, BadgeLogo } from "./types";

const logo: BadgeLogo = { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "left", heightMm: 8 };
const base: BadgeDocument = createBadgeDocument(["Anna Lind"]);

describe("färgkoder vid plastens färger", () => {
  it("visar skärmens hex i versaler för varje pigment", () => {
    assert.deepEqual(pigmentCodes("#d4a017"), { hex: "#D4A017" });
    assert.equal(pigmentCodeText("#0057b8"), "#0057B8");
  });

  it("har en hex för framsidan och gravyren i varje plastfärg", () => {
    for (const combo of getMaterial("plastic").colors) {
      assert.match(pigmentCodes(combo.surface).hex, /^#[0-9A-F]{6}$/, combo.id);
      assert.match(pigmentCodes(combo.engraving).hex, /^#[0-9A-F]{6}$/, combo.id);
    }
  });

  it("hittar inte på PMS eller RAL: de visas först när verkstaden har lämnat dem", () => {
    for (const combo of getMaterial("plastic").colors) {
      assert.deepEqual(Object.keys(pigmentCodes(combo.surface)), ["hex"], combo.id);
    }
  });
});

describe("kundens färgkod för trycket", () => {
  it("gäller när namnet eller loggan printas", () => {
    assert.equal(printColorOf({ ...base, marking: "print", printColor: "PMS 286 C" }), "PMS 286 C");
    assert.equal(printColorOf({ ...base, logo, marking: "engrave-name-print-logo", printColor: " PMS 286 C " }), "PMS 286 C");
    assert.equal(printColorLabel({ ...base, marking: "print", printColor: "#0057B8" }), "Tryckfärg #0057B8");
  });

  it("följer inte med när inget printas, även om koden står kvar på skylten", () => {
    assert.equal(printColorOf({ ...base, marking: "engrave", printColor: "PMS 286 C" }), null);
    assert.equal(printColorOf({ ...base, printColor: "PMS 286 C" }), null);
    // Ett kombinerat val utan logga är namnets metod: här gravyr.
    assert.equal(printColorOf({ ...base, marking: "engrave-name-print-logo", printColor: "PMS 286 C" }), null);
    assert.equal(printColorLabel({ ...base, marking: "engrave", printColor: "PMS 286 C" }), null);
  });

  it("är ingenting när fältet är tomt eller bara blanktecken", () => {
    assert.equal(printColorOf({ ...base, marking: "print" }), null);
    assert.equal(printColorOf({ ...base, marking: "print", printColor: "   " }), null);
  });

  it("rensas från styrtecken och kortas till längsta tillåtna", () => {
    assert.equal(cleanPrintColor("PMS\n286\tC"), "PMS286C");
    assert.equal(cleanPrintColor("x".repeat(PRINT_COLOR_MAX + 10)).length, PRINT_COLOR_MAX);
    assert.equal(cleanPrintColor("PMS 286 "), "PMS 286 ");
  });

  it("godtas av schemat inom gränserna", () => {
    assert.equal(badgeDocumentSchema.safeParse({ ...base, marking: "print", printColor: "PMS 286 C" }).success, true);
    assert.equal(badgeDocumentSchema.safeParse(base).success, true);
    assert.equal(badgeDocumentSchema.safeParse({ ...base, printColor: "x".repeat(PRINT_COLOR_MAX + 1) }).success, false);
    assert.equal(badgeDocumentSchema.safeParse({ ...base, printColor: "PMS\n286" }).success, false);
  });
});

/** Tabellmått plus en ruta per textrad som "kontur", så att det som printas går att följa. */
const fonts: FontEngine = {
  ...approxFonts,
  outline: (text, font, x, baseline) => {
    const w = approxFonts.measure(text, font);
    const cap = font.sizeMm * approxFonts.capHeightRatio(font);
    return `M${x} ${baseline}L${x + w} ${baseline}L${x + w} ${baseline - cap}L${x} ${baseline - cap}Z`;
  },
};

/** Tre rader, där den andra och tredje har egen kod: en hex och en PMS. */
function threeRows(extra: Partial<BadgeDocument> = {}): BadgeDocument {
  const doc = createBadgeDocument(["Welcome", "to a", "New Era"]);
  const [first, second, third] = doc.rows;
  return {
    ...doc,
    marking: "print",
    rows: [first!, { ...second!, printColor: "#c8102e" }, { ...third!, printColor: "PMS 300 C" }],
    ...extra,
  };
}

describe("hexkoden i en färgkod", () => {
  it("läser sex siffror med eller utan brädgård, och tre siffror med", () => {
    assert.equal(printColorHex("#c8102e"), "#C8102E");
    assert.equal(printColorHex(" C8102E "), "#C8102E");
    assert.equal(printColorHex("#0af"), "#00AAFF");
  });

  it("tar inte ett PMS-nummer för en färg", () => {
    assert.equal(printColorHex("286"), null);
    assert.equal(printColorHex("PMS 286 C"), null);
    assert.equal(printColorHex("RAL 5010"), null);
    assert.equal(printColorHex(""), null);
    assert.equal(printColorHex(undefined), null);
  });
});

describe("färgkod per textrad", () => {
  it("gäller när namnet printas", () => {
    const doc = threeRows();
    assert.deepEqual(
      doc.rows.map((row) => rowPrintColorOf(doc, row)),
      [null, "#c8102e", "PMS 300 C"],
    );
    assert.equal(rowPrintColorOf({ marking: "print-name-engrave-logo" }, { text: "Anna", printColor: " PMS 300 C " }), "PMS 300 C");
  });

  it("gäller inte när namnet graveras: gravyren har materialets färg på alla rader", () => {
    for (const marking of [undefined, "engrave", "engrave-name-print-logo"] as const) {
      const doc = threeRows({ marking, logo });
      assert.deepEqual(doc.rows.map((row) => rowPrintColorOf(doc, row)), [null, null, null], String(marking));
      assert.deepEqual(doc.rows.map((row) => rowPrintInkOf(doc, row)), [null, null, null], String(marking));
    }
  });

  it("ritar en rad i sin hexkod, annars i hexkoden för hela trycket", () => {
    const plain = threeRows();
    assert.deepEqual(plain.rows.map((row) => rowPrintInkOf(plain, row)), [null, "#C8102E", null]);
    const whole = threeRows({ printColor: "#0057b8" });
    assert.equal(printInkOf(whole), "#0057B8");
    // Raden med PMS får inte tryckets färg: den ska ha en annan, som vi inte kan rita.
    assert.deepEqual(whole.rows.map((row) => rowPrintInkOf(whole, row)), ["#0057B8", "#C8102E", null]);
    // En PMS-kod för hela trycket går inte att rita.
    assert.equal(printInkOf(threeRows({ printColor: "PMS 286 C" })), null);
  });

  it("står i underlaget med radens nummer på skylten", () => {
    assert.equal(printColorLabel(threeRows()), "Tryckfärg rad 2 #c8102e, rad 3 PMS 300 C");
    assert.equal(printColorLabel(threeRows({ printColor: "PMS 286 C" })), "Tryckfärg PMS 286 C, rad 2 #c8102e, rad 3 PMS 300 C");
    assert.equal(printColorLabel(threeRows({ marking: "engrave" })), null);
  });

  it("räknar raderna utan de tomma, som de står på skylten", () => {
    const doc = threeRows();
    const rows = doc.rows.map((row, i) => (i === 0 ? { ...row, text: " " } : row));
    assert.equal(printColorLabel({ ...doc, rows }), "Tryckfärg rad 1 #c8102e, rad 2 PMS 300 C");
    // En kod på en tom rad följer inte med.
    const empty = doc.rows.map((row, i) => (i === 1 ? { ...row, text: "" } : row));
    assert.equal(printColorLabel({ ...doc, rows: empty }), "Tryckfärg rad 2 PMS 300 C");
  });

  it("följer med till det som printas, och aldrig till gravyren", () => {
    const doc = threeRows({ printColor: "#0057b8", frame: { style: "solid", insetMm: 1.5, thicknessMm: 0.4 } });
    const printed = printedPaths(layoutBadge(doc, fonts), fonts) ?? [];
    assert.deepEqual(
      printed.map((path) => [path.kind, path.ink]),
      [
        ["frame", "#0057B8"],
        ["text", "#0057B8"],
        ["text", "#C8102E"],
        ["text", undefined],
      ],
    );
    const engraved = { ...doc, marking: "engrave" as const };
    const layout = layoutBadge(engraved, fonts);
    assert.equal(layout.printInk, null);
    assert.ok((engravingPaths(layout, fonts) ?? []).every((path) => path.ink === undefined));
  });

  it("färgar en svartvit logga som printas, men inte en som graveras", () => {
    const logoPrinted = { ...threeRows({ printColor: "#0057b8" }), logo, marking: "engrave-name-print-logo" as const };
    const layout = layoutBadge(logoPrinted, fonts);
    assert.deepEqual((printedPaths(layout, fonts) ?? []).map((path) => [path.kind, path.ink]), [["logo", "#0057B8"]]);
    assert.ok((engravingPaths(layout, fonts) ?? []).every((path) => path.ink === undefined));
  });

  it("syns i förhandsvisningen men aldrig i produktionsfilen", () => {
    const doc = threeRows();
    const layout = layoutBadge(doc, fonts);
    assert.match(renderBadgeSvg(doc, layout, { mode: "preview", fonts }), /fill="#C8102E"/);
    assert.doesNotMatch(renderBadgeSvg(doc, layout, { mode: "production", fonts }), /#C8102E/);
    // Utan konturer ritas raderna som text, i samma färg.
    assert.match(renderBadgeSvg(doc, layout, { mode: "preview", fonts: approxFonts }), /fill="#C8102E">to a</);
    const engraved = { ...doc, marking: "engrave" as const };
    assert.doesNotMatch(renderBadgeSvg(engraved, layoutBadge(engraved, fonts), { mode: "preview", fonts }), /#C8102E/);
  });

  it("godtas av schemat inom samma gränser som koden för hela trycket", () => {
    const doc = threeRows();
    assert.equal(badgeDocumentSchema.safeParse(doc).success, true);
    const withCode = (printColor: string) => ({ ...doc, rows: doc.rows.map((row) => ({ ...row, printColor })) });
    assert.equal(badgeDocumentSchema.safeParse(withCode("x".repeat(PRINT_COLOR_MAX + 1))).success, false);
    assert.equal(badgeDocumentSchema.safeParse(withCode("PMS\n286")).success, false);
  });
});
