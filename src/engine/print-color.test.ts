import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMaterial } from "./catalog";
import { pigmentCodeText, pigmentCodes } from "./color-choice";
import { createBadgeDocument } from "./document";
import { PRINT_COLOR_MAX, cleanPrintColor, printColorLabel, printColorOf } from "./marking";
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
