import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approxFonts, createBadgeDocument, layoutBadge } from "@/engine";
import { toSupplierSignDocument } from "./map";

describe("toSupplierSignDocument", () => {
  it("använder leverantörens material- och färgkoder", () => {
    const supplier = toSupplierSignDocument(createBadgeDocument(["Anna"]), approxFonts);
    assert.equal(supplier.productType, "sign");
    assert.equal(supplier.material, "gravyrplast-2-lager-0-8mm");
    assert.equal(supplier.color, "white-black");
    assert.equal(supplier.cornerRadiusMm, 3);
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
});
