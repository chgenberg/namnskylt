import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMaterial } from "./catalog";
import { INVISIBLE_CONTRAST, PRINT_PALETTE, bestTextColor, contrastRatio, pigmentCodeText, pigmentCodes, printColorName } from "./color-choice";
import { LOGO_COLORS_MAX, cleanLogoColors, inkPalette, logoPalette, withLogoColors } from "./logo-color";
import { PRINT_STANDARD_COLORS, cmykHex, cmykOf, cmykText, isPrintHex, printColorHex, printColorText, printHex } from "./color-code";
import { createBadgeDocument, isOfferedDocument, toOfferedDocument } from "./document";
import { engravedBadge, plasticBadge } from "./testing";
import { engravingPaths, printedPaths } from "./engraving";
import { layoutBadge, type FontEngine } from "./layout";
import {
  LOGO_PRINT_COLOR_MAX,
  PRINT_COLOR_MAX,
  hasScreenPrintColors,
  logoPrintColorOf,
  logoPrintInkOf,
  printColorLabel,
  printColorOf,
  printInkOf,
  printsInOneColor,
  rowPrintColorOf,
  rowPrintInkOf,
  withScreenPrintColors,
  withTextColor,
  withVisibleInk,
} from "./marking";
import { approxFonts } from "./measure";
import { renderBadgeSvg } from "./render-svg";
import { badgeDocumentSchema } from "./schema";
import type { BadgeDocument, BadgeLogo } from "./types";

const logo: BadgeLogo = { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "left", heightMm: 8 };
/**
 * Från 2026-11-17 till 2026-11-18 skrev kunden färgkoder som fritext: CMYK, PMS eller hex. I dag
 * väljs en skärmfärg (se sist i filen), men en äldre skylt kan bära koderna, och de ska läsas
 * och ritas som förut. Det är vad de första grupperna här prövar.
 *
 * Utan vald metod, alltså graverad: färgkoden för trycket gäller först när något printas.
 */
const base: BadgeDocument = engravedBadge(["Anna Lind"]);

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

describe("CMYK i en färgkod", () => {
  const blue = { c: 100, m: 60, y: 0, k: 20 };

  it("läser fyra värden i procent, hur kunden än skriver dem", () => {
    const written = [
      "CMYK 100/60/0/20",
      "100/60/0/20",
      "100, 60, 0, 20",
      "100 60 0 20",
      "100-60-0-20",
      "cmyk(100, 60, 0, 20)",
      "CMYK: 100 % / 60 % / 0 % / 20 %",
      "C100 M60 Y0 K20",
      "c: 100, m: 60, y: 0, k: 20",
      "C=100 M=60 Y=0 K=20",
      "  C100/M60/Y0/K20  ",
    ];
    for (const code of written) assert.deepEqual(cmykOf(code), blue, code);
    assert.deepEqual(cmykOf("12.5/0/0/7.5"), { c: 12.5, m: 0, y: 0, k: 7.5 });
    // Decimalkomma går bra där kommat inte skiljer värdena åt.
    assert.deepEqual(cmykOf("12,5/0/0/7,5"), { c: 12.5, m: 0, y: 0, k: 7.5 });
    assert.deepEqual(cmykOf("12,5 0 0 7,5"), { c: 12.5, m: 0, y: 0, k: 7.5 });
    assert.deepEqual(cmykOf("C12,5 M0 Y0 K7,5"), { c: 12.5, m: 0, y: 0, k: 7.5 });
    assert.deepEqual(cmykOf("12.5, 0, 0, 7.5"), { c: 12.5, m: 0, y: 0, k: 7.5 });
  });

  it("tar inte andra koder för CMYK", () => {
    const others = [
      "PMS 286 C",
      "286",
      "RAL 5010",
      "#0057B8",
      "100/60/0",
      "100/60/0/20/5",
      "120/0/0/0",
      "C100 M60 K20",
      "blå 100/60/0/20",
      "",
      // Tre värden med decimalkomma får inte läsas som fyra: skiljetecknet ska vara detsamma hela vägen.
      "0,5/10/20",
      "10 20/30,40",
      "100/60 0 20",
      // Med komma mellan värdena är kommat inget decimaltecken.
      "7,5, 0, 0, 0",
    ];
    for (const code of others) assert.equal(cmykOf(code), null, code);
    assert.equal(cmykOf(undefined), null);
  });

  it("räknas om till skärmens färg", () => {
    assert.equal(cmykHex({ c: 0, m: 0, y: 0, k: 0 }), "#FFFFFF");
    assert.equal(cmykHex({ c: 0, m: 0, y: 0, k: 100 }), "#000000");
    assert.equal(cmykHex({ c: 0, m: 100, y: 100, k: 0 }), "#FF0000");
    assert.equal(cmykHex(blue), "#0052CC");
    assert.equal(printColorHex("CMYK 100/60/0/20"), "#0052CC");
    assert.equal(printColorHex("c100 m60 y0 k20"), "#0052CC");
  });

  it("står likadant i underlaget hur den än skrevs", () => {
    assert.equal(cmykText(blue), "CMYK 100/60/0/20");
    assert.equal(printColorText("c100 m60 y0 k20"), "CMYK 100/60/0/20");
    assert.equal(printColorText("100, 60, 0, 20"), "CMYK 100/60/0/20");
    assert.equal(printColorText("0057b8"), "#0057B8");
    // Det vi inte kan läsa står som kunden skrev det.
    assert.equal(printColorText(" PMS 286 C "), "PMS 286 C");
  });

  it("ritas på skylten, för hela trycket och för en rad", () => {
    const doc = threeRows({ printColor: "100/60/0/20" });
    const rows = doc.rows.map((row, i) => (i === 2 ? { ...row, printColor: "C0 M100 Y80 K0" } : row));
    const coded = { ...doc, rows };
    assert.equal(printInkOf(coded), "#0052CC");
    assert.deepEqual(coded.rows.map((row) => rowPrintInkOf(coded, row)), ["#0052CC", "#C8102E", "#FF0033"]);
    assert.equal(printColorLabel(coded), "Tryckfärg CMYK 100/60/0/20, rad 2 #C8102E, rad 3 CMYK 0/100/80/0");
  });
});

describe("loggans egna färgkoder", () => {
  const coded: BadgeLogo = { ...logo, printColor: " 0/100/80/0 " };
  const colored: BadgeLogo = { ...coded, image: { src: "data:image/png;base64,iVBORw0KGgo=" } };

  it("gäller när loggan printas", () => {
    assert.equal(logoPrintColorOf({ logo: coded, marking: "print" }), "0/100/80/0");
    assert.equal(logoPrintColorOf({ logo: coded, marking: "engrave-name-print-logo" }), "0/100/80/0");
    // En logga i färg utan vald metod printas.
    assert.equal(logoPrintColorOf({ logo: colored }), "0/100/80/0");
  });

  it("gäller inte när loggan graveras: gravyren har materialets färg", () => {
    assert.equal(logoPrintColorOf({ logo: coded }), null);
    assert.equal(logoPrintColorOf({ logo: coded, marking: "engrave" }), null);
    assert.equal(logoPrintColorOf({ logo: colored, marking: "print-name-engrave-logo" }), null);
    assert.equal(logoPrintColorOf({ logo, marking: "print" }), null);
    assert.equal(logoPrintColorOf({ marking: "print" }), null);
  });

  it("ritar en svartvit logga i sin egen kod, annars i koden för hela trycket", () => {
    const doc = { ...base, logo: coded, marking: "engrave-name-print-logo" as const, printColor: "#0057b8" };
    assert.equal(logoPrintInkOf(doc), "#FF0033");
    assert.deepEqual((printedPaths(layoutBadge(doc, fonts), fonts) ?? []).map((path) => [path.kind, path.ink]), [["logo", "#FF0033"]]);
    assert.equal(logoPrintInkOf({ ...doc, logo }), "#0057B8");
    // En egen kod som inte går att rita ger gravyrens färg, inte tryckets.
    const pms = { ...doc, logo: { ...logo, printColor: "PMS 186 C" } };
    assert.equal(logoPrintInkOf(pms), null);
    assert.equal(layoutBadge(pms, fonts).logo?.ink, undefined);
    assert.equal(logoPrintInkOf({ ...doc, marking: "engrave" as const }), null);
  });

  it("färgar inte en logga i färg: den trycks som bild", () => {
    const doc = { ...base, logo: colored, printColor: "#0057b8" };
    const placed = layoutBadge(doc, fonts).logo;
    assert.equal(placed?.imageSrc, colored.image?.src);
    assert.equal(placed?.ink, undefined);
  });

  it("syns i förhandsvisningen men aldrig i produktionsfilen", () => {
    const doc = { ...base, logo: coded, marking: "engrave-name-print-logo" as const };
    const layout = layoutBadge(doc, fonts);
    assert.match(renderBadgeSvg(doc, layout, { mode: "preview", fonts }), /fill="#FF0033"/);
    assert.match(renderBadgeSvg(doc, layout, { mode: "preview", fonts: approxFonts }), /fill="#FF0033"/);
    assert.doesNotMatch(renderBadgeSvg(doc, layout, { mode: "production", fonts }), /#FF0033/);
  });

  it("står sist i underlaget, som kunden skrev dem när de är flera", () => {
    const doc = threeRows({ printColor: "PMS 286 C", logo: { ...logo, printColor: "blå 100/60/0/20, röd 0/100/80/0" } });
    assert.equal(
      printColorLabel(doc),
      "Tryckfärg PMS 286 C, rad 2 #C8102E, rad 3 PMS 300 C, logga blå 100/60/0/20, röd 0/100/80/0",
    );
    assert.equal(printColorLabel({ ...base, logo: coded, marking: "engrave-name-print-logo" }), "Tryckfärg logga CMYK 0/100/80/0");
    assert.equal(printColorLabel({ ...base, logo: coded, marking: "engrave" }), null);
  });

  it("godtas av schemat inom sin egen längd", () => {
    const withCode = (printColor: string) => ({ ...base, logo: { ...logo, printColor } });
    assert.equal(badgeDocumentSchema.safeParse(withCode("blå 100/60/0/20, röd 0/100/80/0")).success, true);
    assert.equal(badgeDocumentSchema.safeParse(withCode("x".repeat(LOGO_PRINT_COLOR_MAX))).success, true);
    assert.equal(badgeDocumentSchema.safeParse(withCode("x".repeat(LOGO_PRINT_COLOR_MAX + 1))).success, false);
    assert.equal(badgeDocumentSchema.safeParse(withCode("100/60\n0/20")).success, false);
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
    assert.equal(printColorLabel(threeRows()), "Tryckfärg rad 2 #C8102E, rad 3 PMS 300 C");
    assert.equal(printColorLabel(threeRows({ printColor: "PMS 286 C" })), "Tryckfärg PMS 286 C, rad 2 #C8102E, rad 3 PMS 300 C");
    assert.equal(printColorLabel(threeRows({ marking: "engrave" })), null);
  });

  it("räknar raderna utan de tomma, som de står på skylten", () => {
    const doc = threeRows();
    const rows = doc.rows.map((row, i) => (i === 0 ? { ...row, text: " " } : row));
    assert.equal(printColorLabel({ ...doc, rows }), "Tryckfärg rad 1 #C8102E, rad 2 PMS 300 C");
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

describe("tryckets färger är skärmfärger", () => {
  /** En ny skylt: metall, som printas. */
  const printed: BadgeDocument = createBadgeDocument(["Anna Lind", "Säljare"]);
  const [first, second] = printed.rows;
  const withRow = (printColor: string): BadgeDocument => ({ ...printed, rows: [first!, { ...second!, printColor }] });

  it("sparas som sex siffror i versaler, med eller utan brädgård", () => {
    assert.equal(printHex("#0057b8"), "#0057B8");
    assert.equal(printHex("0057B8"), "#0057B8");
    assert.equal(printHex("  #c8102e "), "#C8102E");
    for (const other of ["", "#fff", "286", "PMS 286 C", "100/60/0/20", "#0057B", "#0057B8FF", "blå", null, undefined]) {
      assert.equal(printHex(other), null, String(other));
    }
    assert.equal(isPrintHex("#0057B8"), true);
    assert.equal(isPrintHex("#0057b8"), true);
    assert.equal(isPrintHex("0057B8"), false);
    assert.equal(isPrintHex("CMYK 100/60/0/20"), false);
  });

  it("har verkstadens sju standardfärger", () => {
    assert.deepEqual(
      PRINT_STANDARD_COLORS.map((color) => color.name),
      ["Vit", "Svart", "Varningsgul", "Röd", "Blå", "Grön", "Orange"],
    );
    for (const color of PRINT_STANDARD_COLORS) assert.equal(printHex(color.hex), color.hex, color.id);
  });

  it("en skylt med skärmfärger säljs, för hela trycket och för en rad", () => {
    const colored: BadgeDocument = { ...withRow("#E31C23"), printColor: "#0057B8" };
    assert.equal(hasScreenPrintColors(printed), true);
    assert.equal(hasScreenPrintColors(colored), true);
    assert.equal(isOfferedDocument(colored), true);
    assert.equal(toOfferedDocument(colored), colored);
    assert.equal(withScreenPrintColors(colored), colored);
    assert.equal(printColorLabel(colored), "Tryckfärg #0057B8, rad 2 #E31C23");
    assert.equal(printInkOf(colored), "#0057B8");
    assert.equal(rowPrintInkOf(colored, colored.rows[1]!), "#E31C23");
  });

  it("en skylt med en äldre kod säljs inte som den är", () => {
    for (const code of ["CMYK 100/60/0/20", "100/60/0/20", "PMS 286 C", "0057B8", "#fff"]) {
      assert.equal(isOfferedDocument({ ...printed, printColor: code }), false, code);
      assert.equal(isOfferedDocument(withRow(code)), false, code);
    }
    assert.equal(isOfferedDocument({ ...printed, logo: { ...logo, printColor: "#0057B8" } }), false);
    // Också en kod som står kvar på en skylt som graveras: den skulle gälla igen om metoden byttes till print.
    const engraved = plasticBadge(["Anna Lind"]);
    assert.equal(isOfferedDocument(engraved), true);
    assert.equal(isOfferedDocument({ ...engraved, printColor: "PMS 286 C" }), false);
  });

  it("en äldre CMYK-kod blir färgen den visades i när skylten öppnas", () => {
    const old: BadgeDocument = { ...withRow("C0 M100 Y80 K0"), printColor: "100/60/0/20" };
    const opened = toOfferedDocument(old);
    assert.equal(opened.printColor, "#0052CC");
    assert.equal(opened.rows[1]!.printColor, "#FF0033");
    assert.equal(printInkOf(opened), printInkOf(old));
    assert.equal(rowPrintInkOf(opened, opened.rows[1]!), rowPrintInkOf(old, old.rows[1]!));
    assert.equal(isOfferedDocument(opened), true);
    assert.equal(printColorLabel(opened), "Tryckfärg #0052CC, rad 2 #FF0033");
    // Texten och allt annat är orört.
    assert.deepEqual({ ...opened, printColor: old.printColor, rows: old.rows }, old);
  });

  it("en kod som inte går att rita tas bort", () => {
    const opened = toOfferedDocument({ ...withRow("PMS 300 C"), printColor: "PMS 286 C" });
    assert.equal("printColor" in opened, false);
    assert.equal("printColor" in opened.rows[1]!, false);
    assert.equal(printColorLabel(opened), null);
    assert.equal(isOfferedDocument(opened), true);
    // En hexkod med tre siffror ritades förut och blir sex siffror.
    assert.equal(toOfferedDocument({ ...printed, printColor: "#f00" }).printColor, "#FF0000");
  });

  it("loggan har ingen egen färg: en svartvit logga som printas får tryckets", () => {
    const old: BadgeDocument = { ...printed, printColor: "#0057B8", logo: { ...logo, printColor: "#C8102E" } };
    assert.equal(logoPrintInkOf(old), "#C8102E");
    const opened = toOfferedDocument(old);
    assert.equal("printColor" in opened.logo!, false);
    assert.equal(logoPrintInkOf(opened), "#0057B8");
    assert.equal(printColorLabel(opened), "Tryckfärg #0057B8");
    assert.equal(isOfferedDocument(opened), true);
    // Loggan i övrigt är orörd.
    assert.deepEqual({ ...opened.logo, printColor: "#C8102E" }, old.logo);
  });
});

describe("tryckets färg gäller bara det som printas i en färg", () => {
  const colorLogo: BadgeLogo = { ...logo, image: { src: "data:image/png;base64,iVBORw0KGgo=" } };
  /** En plastskylt som graveras. */
  const engraved: BadgeDocument = { ...plasticBadge(["Erik Sund", "Kock"]), printColor: "#0057B8" };

  it("namnet som printas, eller en svartvit logga som printas, har tryckets färg", () => {
    assert.equal(printsInOneColor({ ...engraved, marking: "print" }), true);
    assert.equal(printsInOneColor({ ...engraved, logo, marking: "engrave-name-print-logo" }), true);
    assert.equal(printColorOf({ ...engraved, logo, marking: "engrave-name-print-logo" }), "#0057B8");
  });

  it("printas bara en logga i färg gäller ingen tryckfärg, och ingen följer med ordern", () => {
    // Så blir en plastskylt som läggs till efter en metallskylt med färg och logga: namnet graveras, loggan trycks ur sin bild.
    const doc: BadgeDocument = { ...engraved, logo: colorLogo };
    assert.equal(printsInOneColor(doc), false);
    assert.equal(printColorOf(doc), null);
    assert.equal(printInkOf(doc), null);
    assert.equal(printColorLabel(doc), null);
    // Printas namnet också gäller färgen, för namnet.
    assert.equal(printColorLabel({ ...doc, marking: "print" }), "Tryckfärg #0057B8");
  });

  it("ingenting som graveras har tryckets färg", () => {
    assert.equal(printsInOneColor(engraved), false);
    assert.equal(printsInOneColor({ ...engraved, logo: colorLogo, marking: "engrave" }), false);
    assert.equal(printColorLabel(engraved), null);
  });
});

describe("palettens fjorton färger", () => {
  it("är gravyrplastens framsidor, med verkstadens namn och skärmfärger", () => {
    const fronts = new Map(getMaterial("plastic").colors.map((combo) => [combo.surface.toUpperCase(), combo.name.split(" / ")[0]!.trim()]));
    assert.equal(PRINT_PALETTE.length, 14);
    assert.deepEqual([...PRINT_PALETTE].map((color) => color.hex).sort(), [...fronts.keys()].sort());
    for (const color of PRINT_PALETTE) assert.equal(color.name, fronts.get(color.hex), color.hex);
  });

  it("rymmer verkstadens sju standardfärger för tryck", () => {
    for (const standard of PRINT_STANDARD_COLORS) assert.ok(PRINT_PALETTE.some((color) => color.hex === standard.hex), standard.name);
  });

  it("ger namnet på en färg i paletten, och inget för en egen", () => {
    assert.equal(printColorName("#0057b8"), "Blå");
    assert.equal(printColorName("#003366"), "Mörkblå");
    assert.equal(printColorName("#C8102E"), null);
    assert.equal(printColorName(null), null);
  });
});

describe("kontrast mot skyltens yta", () => {
  it("går från 1 för samma färg till 21 för svart mot vitt", () => {
    assert.equal(contrastRatio("#FFFFFF", "#FFFFFF"), 1);
    assert.equal(Math.round(contrastRatio("#000000", "#FFFFFF")), 21);
    assert.equal(contrastRatio("#0057B8", "#C8A440"), contrastRatio("#C8A440", "#0057B8"));
  });

  it("vitt på vit matt metall syns inte, svart på mässing syns bra", () => {
    const white = getMaterial("metal").colors.find((combo) => combo.id === "metal-white")!.surface;
    const brass = getMaterial("metal").colors.find((combo) => combo.id === "metal-gold")!.surface;
    assert.ok(contrastRatio("#FFFFFF", white) < INVISIBLE_CONTRAST);
    assert.ok(contrastRatio("#111111", brass) > 5);
  });
});

describe("loggans färger", () => {
  /** En bild i rutor: varje färg får så många bildpunkter som talet säger. */
  const pixels = (...areas: [number, number, number, number, number][]) => {
    const data: number[] = [];
    for (const [r, g, b, a, count] of areas) for (let i = 0; i < count; i++) data.push(r, g, b, a);
    return { data, width: data.length / 4, height: 1 };
  };

  it("läses av i ordning efter hur mycket av loggan de täcker", () => {
    assert.deepEqual(logoPalette(pixels([0, 87, 184, 255, 600], [227, 28, 35, 255, 300], [255, 210, 0, 255, 100])), ["#0057B8", "#E31C23", "#FFD200"]);
  });

  it("räknar bara det som syns, och slår ihop nyanser som ligger nära varandra", () => {
    const found = logoPalette(pixels([0, 87, 184, 255, 500], [4, 90, 180, 255, 300], [255, 255, 255, 0, 5000], [227, 28, 35, 255, 200]));
    assert.equal(found.length, 2);
    assert.ok(contrastRatio(found[0]!, "#0057B8") < 1.1, String(found[0]));
    assert.equal(found[1], "#E31C23");
  });

  it("tar inte med en färg som bara är en kant eller en liten detalj", () => {
    assert.deepEqual(logoPalette(pixels([0, 87, 184, 255, 980], [227, 28, 35, 255, 20])), ["#0057B8"]);
  });

  /** En bild där varje bildpunkt får sin färg av en funktion. `null` är genomskinligt. */
  const image = (width: number, height: number, at: (x: number, y: number) => readonly [number, number, number] | null) => {
    const data: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const color = at(x, y);
        data.push(...(color ?? [0, 0, 0]), color ? 255 : 0);
      }
    }
    return { data, width, height };
  };
  const RED = [200, 54, 45] as const;
  /** Rött blandat till hälften med vitt, som i kanten av en röd logga på vit botten. */
  const PINK = [228, 155, 150] as const;

  it("kantens blandfärger är inga färger: en röd logga med mjuk kant är bara röd", () => {
    // En röd ruta med två bildpunkter rosa kant runt om. Kanten är nästan en tredjedel av det som syns.
    const inside = (x: number, y: number, from: number, to: number) => x >= from && x <= to && y >= from && y <= to;
    const soft = image(40, 40, (x, y) => (inside(x, y, 10, 29) ? RED : inside(x, y, 8, 31) ? PINK : null));
    assert.deepEqual(logoPalette(soft), ["#C8362D"]);
  });

  it("en logga i tunna linjer har ingen fylld yta, och läses ändå som sin egen färg", () => {
    // Linjer på tre bildpunkter: röd i mitten och rosa på var sida. Det rosa täcker dubbelt så mycket som det röda.
    const lines = image(60, 20, (x) => (x % 6 === 2 ? RED : x % 6 === 1 || x % 6 === 3 ? PINK : null));
    assert.deepEqual(logoPalette(lines), ["#C8362D"]);
    // Två färger som inte ligger mellan varandra och bottnen är båda loggans.
    const two = image(60, 20, (x) => (x % 6 === 2 ? RED : x % 6 === 4 ? ([0, 87, 184] as const) : null));
    assert.deepEqual(logoPalette(two).sort(), ["#0057B8", "#C8362D"]);
  });

  it("vitt bläck i tunna linjer på mörk botten läses som vitt, inte som kantens ljusblå", () => {
    const ground = [0, 51, 102] as const;
    const blend = [128, 153, 179] as const;
    const lines = image(60, 10, (x) => (x % 6 === 2 ? ([255, 255, 255] as const) : x % 6 === 1 || x % 6 === 3 ? blend : ground));
    const mask = Array.from({ length: 600 }, (_, i) => ((i % 60) % 6 >= 1 && (i % 60) % 6 <= 3 ? 1 : 0));
    assert.deepEqual(inkPalette(lines, mask), ["#FFFFFF"]);
  });

  it("ger högst fyra färger, och inga för en bild utan något synligt", () => {
    const many = [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [255, 0, 255]].map(([r, g, b]) => [r!, g!, b!, 255, 100] as [number, number, number, number, number]);
    assert.equal(logoPalette(pixels(...many)).length, 4);
    assert.deepEqual(logoPalette(pixels([10, 10, 10, 0, 50])), []);
  });
});

describe("färgen som passar bäst som textfärg", () => {
  const brass = "#C8A440";
  const white = "#F7F7F5";

  it("är loggans huvudfärg när den syns bra mot skylten", () => {
    assert.equal(bestTextColor(["#0057B8", "#E31C23", "#FFD200"], brass), "#0057B8");
    assert.equal(bestTextColor(["#0057B8", "#E31C23"], white), "#0057B8");
  });

  it("är nästa färg när huvudfärgen inte syns mot ytan", () => {
    // Gult är loggans största färg men syns inte på mässing eller vitt: då passar den blå bäst.
    assert.equal(bestTextColor(["#FFD200", "#0057B8"], brass), "#0057B8");
    assert.equal(bestTextColor(["#FFD200", "#0057B8"], white), "#0057B8");
  });

  it("är ingen när ingen av loggans färger går att läsa på ytan", () => {
    assert.equal(bestTextColor(["#FFD200", "#F2E9C0"], white), null);
    assert.equal(bestTextColor([], brass), null);
  });
});

describe("textfärgen gäller alla rader", () => {
  const printed: BadgeDocument = createBadgeDocument(["Anna Lind", "Säljare"]);
  const [first, second] = printed.rows;

  it("ett val av textfärg tar bort radernas egna färger, så att valet alltid syns", () => {
    const own: BadgeDocument = { ...printed, printColor: "#0057B8", rows: [first!, { ...second!, printColor: "#E31C23" }] };
    const picked = withTextColor(own, "#00a33a");
    assert.equal(picked.printColor, "#00A33A");
    assert.equal("printColor" in picked.rows[1]!, false);
    assert.equal(rowPrintInkOf(picked, picked.rows[1]!), "#00A33A");
    assert.equal(printColorLabel(picked), "Tryckfärg #00A33A");
  });

  it("ingen färg tar bort den, och något som inte är en färg ändrar ingenting", () => {
    const own: BadgeDocument = { ...printed, printColor: "#0057B8" };
    assert.equal("printColor" in withTextColor(own, null), false);
    assert.equal(withTextColor(own, "PMS 286 C"), own);
    assert.equal(withTextColor(own, "100/60/0/20"), own);
  });
});

describe("namnet försvinner inte när skylten byter yta", () => {
  const printed: BadgeDocument = createBadgeDocument(["Anna Lind", "Säljare"]);
  const [first, second] = printed.rows;
  const onWhite = (doc: BadgeDocument): BadgeDocument => ({ ...doc, colorId: "metal-white" });

  it("en vit textfärg tas bort när ytan blir vit, så att trycket får ytans förvalda färg", () => {
    const white: BadgeDocument = { ...printed, printColor: "#FFFFFF" };
    // På mässing syns vitt och står kvar.
    assert.equal(withVisibleInk(white), white);
    const moved = withVisibleInk(onWhite(white));
    assert.equal("printColor" in moved, false);
    assert.equal(printInkOf(moved), null);
  });

  it("gäller också en rads egen färg, och rör inte färger som syns", () => {
    const doc: BadgeDocument = { ...printed, printColor: "#0057B8", rows: [first!, { ...second!, printColor: "#FFFFFF" }] };
    const moved = withVisibleInk(onWhite(doc));
    assert.equal(moved.printColor, "#0057B8");
    assert.equal("printColor" in moved.rows[1]!, false);
    assert.equal(moved.rows[0], doc.rows[0]);
  });

  it("en färg som bara syns dåligt står kvar: där varnar färgvalet i stället", () => {
    const yellow: BadgeDocument = onWhite({ ...printed, printColor: "#FFD200" });
    assert.equal(withVisibleInk(yellow), yellow);
  });

  it("en skylt som graveras behåller sin oanvända textfärg, tills den printas igen", () => {
    // Vit text på mässing, sedan över plast (där namnet graveras) och tillbaka: färgen ska finnas kvar.
    const plastic: BadgeDocument = { ...plasticBadge(["Anna Lind"]), printColor: "#FFFFFF" };
    assert.equal(withVisibleInk(plastic), plastic);
  });
});

describe("loggans avlästa färger följer med skylten", () => {
  const withColors = (colors: unknown): unknown => ({ ...base, logo: { ...logo, colors } });

  it("en logga som spåras i en färg har ändå sin färg: den läses ur det som är bläck", () => {
    // Fyra bildpunkter: två röda som är bläck, och två vita som är botten.
    const data = [200, 54, 45, 255, 204, 50, 41, 255, 255, 255, 255, 255, 255, 255, 255, 255];
    const found = inkPalette({ data, width: 4, height: 1 }, [1, 1, 0, 0]);
    assert.equal(found.length, 1);
    assert.ok(contrastRatio(found[0]!, "#CA342B") < 1.05, String(found[0]));
    // Utan bläck finns inga färger att läsa.
    assert.deepEqual(inkPalette({ data, width: 4, height: 1 }, [0, 0, 0, 0]), []);
  });

  it("en rättad lista sparas som skärmfärger i versaler, utan dubbletter och inom taket", () => {
    assert.deepEqual(cleanLogoColors(["#c8362d", "0057b8", " #FFD200 "]), ["#C8362D", "#0057B8", "#FFD200"]);
    assert.deepEqual(cleanLogoColors(["#C8362D", "#c8362d"]), ["#C8362D"]);
    assert.deepEqual(cleanLogoColors(["PMS 186 C", "100/60/0/20", "#C83", ""]), []);
    assert.equal(cleanLogoColors(["#111111", "#222222", "#333333", "#444444", "#555555"]).length, LOGO_COLORS_MAX);
  });

  it("de avlästa färgerna sparas när kunden ändrar en, så att de går att återställa", () => {
    const logo = { d: "M0 0", colors: ["#0058A3", "#FFDA1A"] };
    // Första ändringen sparar det som lästes av.
    const once = withLogoColors(logo, ["#0058A3", "#7ed957"]);
    assert.deepEqual(once, { d: "M0 0", colors: ["#0058A3", "#7ED957"], readColors: ["#0058A3", "#FFDA1A"] });
    // Fler ändringar rör inte det sparade.
    const twice = withLogoColors(once, ["#00A33A", "#7ED957"]);
    assert.deepEqual(twice.readColors, ["#0058A3", "#FFDA1A"]);
    // Återställ, eller att skriva tillbaka samma koder, tar bort det sparade: då finns inget att återställa.
    assert.deepEqual(withLogoColors(twice, twice.readColors!), logo);
    assert.deepEqual(withLogoColors(once, ["#0058a3", "#ffda1a"]), logo);
    // Samma färger som förut ändrar ingenting, och en logga utan avlästa färger får inget sparat.
    assert.deepEqual(withLogoColors(logo, logo.colors), logo);
    const bare: { d: string; colors?: string[] } = { d: "M0 0" };
    assert.deepEqual(withLogoColors(bare, ["#112233"]), { d: "M0 0", colors: ["#112233"] });
  });

  it("godtas av schemat som skärmfärger, och bara inom taket", () => {
    assert.equal(badgeDocumentSchema.safeParse(withColors(["#C8362D", "#0057b8"])).success, true);
    assert.equal(badgeDocumentSchema.safeParse(withColors([])).success, true);
    assert.equal(badgeDocumentSchema.safeParse(withColors(["PMS 186 C"])).success, false);
    assert.equal(badgeDocumentSchema.safeParse(withColors(["#C83"])).success, false);
    assert.equal(badgeDocumentSchema.safeParse(withColors(["#111111", "#222222", "#333333", "#444444", "#555555"])).success, false);
  });

  it("ändrar inte vad som säljs, ritas eller följer med ordern", () => {
    const printed = createBadgeDocument(["Anna Lind"]);
    const doc: BadgeDocument = { ...printed, logo: { ...logo, colors: ["#C8362D"] } };
    assert.equal(isOfferedDocument(doc), true);
    assert.equal(toOfferedDocument(doc), doc);
    assert.equal(printColorLabel(doc), null);
    const drawn = (badge: BadgeDocument) => renderBadgeSvg(badge, layoutBadge(badge, fonts), { mode: "preview", fonts });
    assert.equal(drawn(doc), drawn({ ...printed, logo }));
  });
});
