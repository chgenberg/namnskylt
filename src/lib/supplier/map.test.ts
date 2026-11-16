import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approxFonts, createBadgeDocument, layoutBadge, withBlank, withShapePreset } from "@/engine";
import { toSupplierSignDocument } from "./map";

describe("toSupplierSignDocument", () => {
  it("använder leverantörens material- och färgkoder", () => {
    const plastic = { ...createBadgeDocument(["Anna"]), materialId: "plastic-2-layer" as const, colorId: "white-black" };
    const supplier = toSupplierSignDocument(plastic, approxFonts);
    assert.equal(supplier.productType, "sign");
    assert.equal(supplier.material, "gravyrplast-2-lager-0-8mm");
    assert.equal(supplier.color, "white-black");
    assert.equal(supplier.cornerRadiusMm, 3);
  });

  it("skickar metallskylten med sin kod och yta, och kudden som rektangel utan hörnradie", () => {
    const cushion = withBlank({ ...createBadgeDocument(["Anna"]), colorId: "metal-silver" }, "cushion");
    const supplier = toSupplierSignDocument(cushion, approxFonts);
    assert.equal(supplier.material, "namnskylt-metall");
    assert.equal(supplier.color, "metal-silver");
    assert.equal(supplier.shape, "rectangular");
    assert.equal(supplier.cornerRadiusMm, 0);
    assert.deepEqual(supplier.dimensions, { widthMm: 75, heightMm: 35, autoSize: false });
  });

  it("skickar en egen form som fri polygon med punkterna, i verkstadens plastkod", () => {
    const star = withShapePreset({ ...createBadgeDocument(["Anna"]), materialId: "plastic" as const, colorId: "gold-black" }, "star");
    const supplier = toSupplierSignDocument(star, approxFonts);
    assert.equal(supplier.material, "plastic-1.5mm");
    assert.equal(supplier.color, "gold-black");
    assert.equal(supplier.shape, "freeform");
    assert.deepEqual(supplier.customShapePoints, star.customOutline);
    assert.equal(supplier.cornerRadiusMm, star.cornerRadiusMm);
    assert.equal(toSupplierSignDocument(createBadgeDocument(["Anna"]), approxFonts).customShapePoints, undefined);
  });

  it("skickar den ritade versalhöjden, inte den önskade", () => {
    const doc = createBadgeDocument(["Maximiliana Lindqvist-Östergren"]);
    const drawn = layoutBadge(doc, approxFonts).rows[0]!.capHeightMm;
    const supplier = toSupplierSignDocument(doc, approxFonts);
    const layer = supplier.layers.find((l) => l.data.kind === "text");
    assert.ok(layer?.data.kind === "text");
    assert.equal(layer.data.rows[0]!.capHeightMm, Number(drawn.toFixed(2)));
  });

  it("skickar loggan som graverat bildlager med vektorbanorna", () => {
    const doc = {
      ...createBadgeDocument(["Anna"]),
      logo: {
        d: "M0 0L10 0L10 10L0 10Z",
        viewWidth: 10,
        viewHeight: 10,
        placement: "left" as const,
        heightMm: 12,
      },
    };
    const layer = toSupplierSignDocument(doc, approxFonts, { logoPng: "data:image/png;base64,AA" }).layers.find(
      (l) => l.data.kind === "image",
    );
    assert.ok(layer?.data.kind === "image");
    assert.equal(layer.data.renderMode, "engrave");
    assert.equal(layer.data.widthMm, 12);
    assert.equal(layer.transform.position.y, 12.5);
    assert.match(layer.data.vector.markup, /^<path d="M0 0L10 0L10 10L0 10Z" fill="#000000" fill-rule="evenodd"\/>$/);
  });

  it("skickar aldrig hänvisningen till loggans originalfil, och dokumentet är detsamma med och utan den", () => {
    const logo = { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "left" as const, heightMm: 12 };
    const originalId = "7c".repeat(32);
    const plain = { ...createBadgeDocument(["Anna"]), logo };
    const pointed = { ...plain, logo: { ...logo, originalId } };
    const assets = { logoPng: "data:image/png;base64,AA" };
    const supplier = toSupplierSignDocument(pointed, approxFonts, assets);
    assert.ok(!JSON.stringify(supplier).includes(originalId));
    assert.deepEqual(supplier, toSupplierSignDocument(plain, approxFonts, assets));
  });

  it("skickar en logga i färg som tryckt bildlager med bilden själv, utan banor", () => {
    const src = "data:image/png;base64,iVBORw0KGgo=";
    const doc = {
      ...createBadgeDocument(["Anna"]),
      logo: {
        d: "M0 0L10 0L10 10L0 10Z",
        viewWidth: 10,
        viewHeight: 10,
        placement: "left" as const,
        heightMm: 12,
        image: { src },
      },
    };
    // Miniatyren för gravyr används inte när loggan trycks.
    const layer = toSupplierSignDocument(doc, approxFonts, { logoPng: "data:image/png;base64,AA" }).layers.find(
      (l) => l.data.kind === "image",
    );
    assert.ok(layer?.data.kind === "image");
    assert.equal(layer.data.renderMode, "print");
    assert.equal(layer.data.src, src);
    assert.equal(layer.data.widthMm, 12);
    assert.ok(!("vector" in layer.data));
  });

  it("loggans lager följer märkningsmetoden, och metoden står i klartext när något printas", () => {
    const mono = { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "left" as const, heightMm: 12 };
    const color = { ...mono, image: { src: "data:image/png;base64,iVBORw0KGgo=" } };
    const thumb = "data:image/png;base64,AA";
    const sent = (doc: Parameters<typeof toSupplierSignDocument>[0]) => {
      const supplier = toSupplierSignDocument(doc, approxFonts, { logoPng: thumb });
      const layer = supplier.layers.find((l) => l.data.kind === "image");
      assert.ok(layer?.data.kind === "image");
      return { supplier, data: layer.data };
    };
    const base = createBadgeDocument(["Anna"]);
    // En logga i färg som kunden valt att gravera skickas med sina banor, inte som tryckbild.
    const engraved = sent({ ...base, logo: color, marking: "engrave" });
    assert.equal(engraved.data.renderMode, "engrave");
    assert.equal(engraved.data.src, thumb);
    assert.ok("vector" in engraved.data);
    assert.equal(engraved.supplier.productionNote, undefined);
    // En svartvit logga som printas skickas som sin miniatyr.
    const printed = sent({ ...base, logo: mono, marking: "engrave-name-print-logo" });
    assert.equal(printed.data.renderMode, "print");
    assert.equal(printed.data.src, thumb);
    assert.equal(printed.supplier.productionNote, "Märkningsmetod: Namn graveras · logotyp printas. Namn: Gravyr. Logotyp: Print.");
    // Textlagret har inget läge hos leverantören: ett printat namn sägs i klartext.
    const namePrinted = toSupplierSignDocument({ ...base, marking: "print" }, approxFonts);
    assert.equal(namePrinted.productionNote, "Märkningsmetod: Endast print. Namn: Print.");
    assert.ok(namePrinted.layers.some((l) => l.data.kind === "text"));
    // En skylt som bara graveras ser ut som förut.
    assert.equal(toSupplierSignDocument(base, approxFonts).productionNote, undefined);
  });

  it("lägger ramen som eget lager och ovalen som oval", () => {
    const doc = {
      ...createBadgeDocument(["Anna"]),
      shape: "oval" as const,
      frame: { style: "solid" as const, insetMm: 2, thicknessMm: 0.5 },
    };
    const supplier = toSupplierSignDocument(doc, approxFonts);
    assert.equal(supplier.shape, "oval");
    assert.equal(supplier.cornerRadiusMm, 0);
    assert.equal(supplier.layers[0]!.data.kind, "frame");
  });

  it("skickar kapseln som rektangel med halva höjden som radie och kantiga former som sig själva", () => {
    const base = createBadgeDocument(["Anna"]);
    const stadium = toSupplierSignDocument({ ...base, shape: "stadium" }, approxFonts);
    assert.equal(stadium.shape, "rectangular");
    assert.equal(stadium.cornerRadiusMm, 12.5);
    const hexagon = toSupplierSignDocument({ ...base, shape: "hexagon" }, approxFonts);
    assert.equal(hexagon.shape, "hexagon");
    assert.equal(hexagon.cornerRadiusMm, 0);
  });
});
