import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MARKING_METHODS,
  approxFonts,
  badgeDocumentSchema,
  badgePriceParts,
  createBadgeDocument,
  engravingPaths,
  layoutBadge,
  logoMarking,
  markingFits,
  markingOf,
  markingPriceSek,
  nameMarking,
  priceBadge,
  priceItemsOf,
  printedPaths,
  renderBadgeSvg,
  sameDesign,
  toOfferedDocument,
  withLogoMarking,
  withMarking,
  type FontEngine,
} from "./index";
import { DEFAULT_PRICE_MODEL } from "./default-price-model";
import { endPriceTable, itemBreakdown, parseStoredPriceModel, priceModelSchema, resellerPriceTable, type PriceModel } from "./price-model";
import type { BadgeDocument, BadgeLogo, MarkingMethod } from "./types";

/** Tabellmått plus en ruta per textrad som "kontur" — räcker för att se vad som graveras och vad som printas. */
const fonts: FontEngine = {
  ...approxFonts,
  outline: (text, font, x, baseline) => {
    const w = approxFonts.measure(text, font);
    const cap = font.sizeMm * approxFonts.capHeightRatio(font);
    return `M${x} ${baseline}L${x + w} ${baseline}L${x + w} ${baseline - cap}L${x} ${baseline - cap}Z`;
  },
};

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const MONO: BadgeLogo = { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "left", heightMm: 10 };
const COLOR: BadgeLogo = { ...MONO, image: { src: PNG } };
const plain: BadgeDocument = toOfferedDocument(createBadgeDocument(["Anna Lind", "Säljare"]));
const framed: BadgeDocument = { ...plain, frame: { ...plain.frame, style: "solid" } };
const withLogo = (logo: BadgeLogo, marking?: MarkingMethod): BadgeDocument => ({ ...framed, logo, ...(marking && { marking }) });
const kinds = (paths: ReturnType<typeof engravingPaths>) => (paths ?? []).map((path) => path.kind).sort();

/** Kalkylen med priser på de kombinerade metoderna: 9,60 kr för återförsäljaren är 16 kr för slutkunden. */
const PRICED: PriceModel = {
  ...DEFAULT_PRICE_MODEL,
  options: {
    ...DEFAULT_PRICE_MODEL.options,
    markingEngraveNamePrintLogo: [9.6, 9.6, 9.6, 9.6],
    markingPrintNameEngraveLogo: [9.6, 9.6, 6, 6],
  },
};

describe("märkningsmetoden", () => {
  it("har fyra val: en metod för allt, eller namn och logotyp var för sig", () => {
    assert.deepEqual(
      MARKING_METHODS.map((m) => [m.id, m.nameMode, m.logoMode, m.combined]),
      [
        ["engrave", "engrave", "engrave", false],
        ["print", "print", "print", false],
        ["engrave-name-print-logo", "engrave", "print", true],
        ["print-name-engrave-logo", "print", "engrave", true],
      ],
    );
  });

  it("en skylt utan vald metod beter sig som förut: namnet graveras, loggan trycks om den är i färg", () => {
    assert.equal(markingOf(plain), "engrave");
    assert.equal(markingOf(withLogo(MONO)), "engrave");
    assert.equal(markingOf(withLogo(COLOR)), "engrave-name-print-logo");
    assert.equal(nameMarking(withLogo(COLOR)), "engrave");
    assert.equal(logoMarking(withLogo(COLOR)), "print");
    assert.equal(logoMarking(withLogo(MONO)), "engrave");
  });

  it("de kombinerade valen kräver en logga, och faller tillbaka till namnets metod utan den", () => {
    assert.equal(markingFits("engrave-name-print-logo", plain), false);
    assert.equal(markingFits("print", plain), true);
    assert.equal(markingFits("print-name-engrave-logo", withLogo(MONO)), true);
    assert.equal(markingOf({ ...plain, marking: "print-name-engrave-logo" }), "print");
    assert.equal(markingOf({ ...plain, marking: "engrave-name-print-logo" }), "engrave");
    assert.equal(withMarking(plain, "print-name-engrave-logo").marking, "print");
  });

  it("sparar bara valet när det skiljer sig från det skylten får av sig själv", () => {
    assert.equal("marking" in withMarking(plain, "engrave"), false);
    assert.equal(withMarking(plain, "print").marking, "print");
    assert.equal("marking" in withMarking(withLogo(COLOR), "engrave-name-print-logo"), false);
    assert.equal(withMarking(withLogo(COLOR), "engrave").marking, "engrave");
    assert.equal("marking" in withMarking(withLogo(COLOR, "engrave"), "engrave-name-print-logo"), false);
    // Varje val ger den metod kunden valde.
    for (const method of MARKING_METHODS) {
      assert.equal(markingOf(withMarking(withLogo(MONO), method.id)), method.id);
      assert.equal(markingOf(withMarking(withLogo(COLOR), method.id)), method.id);
    }
  });

  it("föreslår metod för en ny logga: i färg printas den, svartvit följer den namnet", () => {
    assert.equal(markingOf(withLogoMarking(withLogo(COLOR))), "engrave-name-print-logo");
    assert.equal(markingOf(withLogoMarking(withLogo(MONO))), "engrave");
    assert.equal(markingOf(withLogoMarking(withLogo(MONO, "print"))), "print");
    assert.equal(markingOf(withLogoMarking(withLogo(COLOR, "print"))), "print");
    // Kunden graverade den förra loggan i färg. En ny logga i färg får förslaget på nytt.
    assert.equal(markingOf(withLogoMarking(withLogo(COLOR, "engrave"))), "engrave-name-print-logo");
    // Loggan tas bort: namnets metod står kvar.
    const removed: BadgeDocument = { ...framed, marking: "print-name-engrave-logo" };
    assert.equal(markingOf(withLogoMarking(removed)), "print");
    assert.equal(withLogoMarking(removed).marking, "print");
  });

  it("går igenom schemat, och en okänd metod stoppas", () => {
    assert.equal(badgeDocumentSchema.parse(withLogo(MONO, "print-name-engrave-logo")).marking, "print-name-engrave-logo");
    assert.equal(badgeDocumentSchema.parse(plain).marking, undefined);
    assert.equal(badgeDocumentSchema.safeParse({ ...plain, marking: "laser" }).success, false);
  });

  it("två skyltar med olika metod är inte samma design", () => {
    assert.equal(sameDesign([plain, { ...plain, marking: "print" }]), false);
    assert.equal(sameDesign([{ ...plain, marking: "print" }, { ...plain, marking: "print", quantity: 4 }]), true);
  });
});

describe("vad som graveras och vad som printas", () => {
  const split = (doc: BadgeDocument) => {
    const layout = layoutBadge(doc, fonts);
    return { layout, engraved: kinds(engravingPaths(layout, fonts)), printed: kinds(printedPaths(layout, fonts)) };
  };

  it("endast gravyr: allt fräses, även en logga i färg, som då ritas ur sina banor", () => {
    const { layout, engraved, printed } = split(withLogo(COLOR, "engrave"));
    assert.deepEqual(engraved, ["frame", "logo", "text", "text"]);
    assert.deepEqual(printed, []);
    assert.equal(layout.logo?.imageSrc, undefined);
    assert.equal(layout.logo?.printed, undefined);
    assert.equal(layout.namePrinted, false);
  });

  it("endast print: ingenting fräses, och en svartvit logga printas som siluett", () => {
    const mono = split(withLogo(MONO, "print"));
    assert.deepEqual(mono.engraved, []);
    assert.deepEqual(mono.printed, ["frame", "logo", "text", "text"]);
    assert.equal(mono.layout.namePrinted, true);
    // En logga i färg trycks som bild och finns inte bland konturerna.
    const color = split(withLogo(COLOR, "print"));
    assert.deepEqual(color.engraved, []);
    assert.deepEqual(color.printed, ["frame", "text", "text"]);
    assert.equal(color.layout.logo?.imageSrc, PNG);
  });

  it("kombinerat: namnet med ramen följer sin metod och loggan sin", () => {
    const namePrinted = split(withLogo(COLOR, "print-name-engrave-logo"));
    assert.deepEqual(namePrinted.engraved, ["logo"]);
    assert.deepEqual(namePrinted.printed, ["frame", "text", "text"]);
    assert.equal(namePrinted.layout.logo?.imageSrc, undefined);
    const logoPrinted = split(withLogo(MONO, "engrave-name-print-logo"));
    assert.deepEqual(logoPrinted.engraved, ["frame", "text", "text"]);
    assert.deepEqual(logoPrinted.printed, ["logo"]);
    assert.equal(logoPrinted.layout.logo?.printed, true);
  });

  it("en skylt utan vald metod ger samma banor som förut", () => {
    assert.deepEqual(split(withLogo(MONO)).engraved, ["frame", "logo", "text", "text"]);
    const color = split(withLogo(COLOR));
    assert.deepEqual(color.engraved, ["frame", "text", "text"]);
    assert.deepEqual(color.printed, []);
    assert.equal(color.layout.logo?.imageSrc, PNG);
  });

  it("ritningen visar allt, men produktionsfilen har bara gravyren", () => {
    const doc = withLogo(MONO, "print-name-engrave-logo");
    const layout = layoutBadge(doc, fonts);
    const paths = (svg: string) => (svg.match(/<path /g) ?? []).length;
    const preview = renderBadgeSvg(doc, layout, { mode: "preview", fonts });
    const production = renderBadgeSvg(doc, layout, { mode: "production", fonts });
    // Produktionsfilen: skärlinjen och den graverade loggan. Namnet och ramen printas och är inte med.
    assert.equal(paths(production), 2);
    // Ritningen: yta, glans och kant, och sedan ram, två rader och loggan.
    assert.equal(paths(preview), 3 + 4);
    // Utan konturer (typsnitten inte laddade) gäller samma regel.
    const fallback = renderBadgeSvg(doc, layoutBadge(doc, approxFonts), { mode: "production" });
    assert.ok(!fallback.includes("<text"));
    assert.equal(paths(fallback), 2);
    assert.ok(renderBadgeSvg(doc, layoutBadge(doc, approxFonts), { mode: "preview" }).includes("<text"));
  });
});

describe("märkningsmetodens pris", () => {
  const list = endPriceTable(PRICED);
  const purchase = resellerPriceTable(PRICED);

  it("ingår i kalkylen: alla fyra metoder kostar 0 kr tills priser sätts i admin", () => {
    const free = endPriceTable(DEFAULT_PRICE_MODEL);
    for (const method of MARKING_METHODS) assert.equal(markingPriceSek(method.id, free), 0, method.id);
    const doc = withLogo(COLOR);
    assert.ok(badgePriceParts(doc, 10, free).every((part) => part.part !== "marking"));
    assert.equal(priceBadge(doc, free).unitSek, priceBadge(withLogo(MONO), free).unitSek);
  });

  it("läggs på skylten som en egen del när metoden har ett pris, med marginalen som övriga delar", () => {
    assert.equal(markingPriceSek("engrave-name-print-logo", purchase), 9.6);
    assert.equal(markingPriceSek("engrave-name-print-logo", list), 16);
    const combined = withLogo(MONO, "engrave-name-print-logo");
    const single = withLogo(MONO);
    assert.deepEqual(
      badgePriceParts(combined, 10, list).find((part) => part.part === "marking"),
      { part: "marking", sek: 16 },
    );
    assert.equal(priceBadge(combined, list).unitSek, priceBadge(single, list).unitSek + 16);
    // Priset följer orderns trappsteg.
    assert.equal(markingPriceSek("print-name-engrave-logo", purchase, 2), 6);
    // En logga i färg utan vald metod är samma skylt som den kombinerade, och kostar lika.
    assert.equal(priceBadge(withLogo(COLOR), list).unitSek, priceBadge(withLogo(COLOR, "engrave-name-print-logo"), list).unitSek);
  });

  it("gäller bara en skylt med logga: utan den räknas namnets metod", () => {
    const stale: BadgeDocument = { ...plain, marking: "engrave-name-print-logo" };
    assert.equal(priceItemsOf([stale])[0]?.marking, "engrave");
    assert.equal(priceBadge(stale, list).unitSek, priceBadge(plain, list).unitSek);
  });

  it("fördelas mellan parterna som övriga delar", () => {
    const [item] = priceItemsOf([{ ...withLogo(MONO, "engrave-name-print-logo"), quantity: 10 }]);
    assert.ok(item);
    const spec = itemBreakdown(PRICED, item);
    const marking = spec.parts.find((part) => part.part === "marking");
    assert.deepEqual(marking?.share, { resellerSek: 9.6, provisionSek: 1.44, supplierSek: 8.16, endSek: 16 });
    // Delarna paras ihop på namn: en del som bara finns hos återförsäljaren får 0 kr för slutkunden.
    const tiny: PriceModel = { ...PRICED, options: { ...PRICED.options, markingEngraveNamePrintLogo: [0.2, 0.2, 0.2, 0.2] } };
    const tinySpec = itemBreakdown(tiny, item);
    assert.equal(tinySpec.parts.find((part) => part.part === "marking")?.share.endSek, 0);
    assert.equal(tinySpec.parts.find((part) => part.part === "start")?.share.endSek, spec.parts.find((part) => part.part === "start")?.share.endSek);
  });

  it("en modell sparad före märkningsmetoden läses med 0 kr på alla fyra, och priserna står kvar", () => {
    const stored = JSON.parse(JSON.stringify(DEFAULT_PRICE_MODEL)) as { options: Record<string, unknown> };
    for (const id of Object.keys(stored.options)) if (id.startsWith("marking")) delete stored.options[id];
    assert.equal(priceModelSchema.safeParse(stored).success, false);
    const model = parseStoredPriceModel(stored);
    assert.ok(model);
    assert.deepEqual(model.options.markingEngraveNamePrintLogo, [0, 0, 0, 0]);
    assert.deepEqual(model.options.extraEngraving, DEFAULT_PRICE_MODEL.options.extraEngraving);
    assert.deepEqual(model, DEFAULT_PRICE_MODEL);
    // En sparad modell med priser på metoderna behåller dem.
    assert.deepEqual(parseStoredPriceModel(JSON.parse(JSON.stringify(PRICED)))?.options.markingPrintNameEngraveLogo, [9.6, 9.6, 6, 6]);
  });
});
