import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BLANKS, MATERIALS, OFFERED_MATERIALS, SIZE_LIMITS, getMaterial } from "./catalog";
import { blankOf, createBadgeDocument, isOfferedDocument, shapeLabel, toOfferedDocument, withBlank } from "./document";
import { approxFonts } from "./measure";
import { layoutBadge } from "./layout";
import { badgeDocumentSchema } from "./schema";
import { availableHalfWidth, badgeOutline } from "./shape";
import type { BadgeDocument } from "./types";

function pointsOf(doc: BadgeDocument, inset = 0) {
  const outline = badgeOutline(doc, inset);
  assert.ok(outline?.kind === "polygon");
  return outline.points;
}

describe("sortimentet", () => {
  it("säljer bara verkstadens metallskylt, i tre ytor", () => {
    assert.deepEqual(
      OFFERED_MATERIALS.map((m) => [m.id, m.producer]),
      [["metal", "skylt-gravyr"]],
    );
    assert.deepEqual(
      getMaterial("metal").colors.map((c) => c.id),
      ["metal-white", "metal-gold", "metal-silver"],
    );
  });

  it("behåller de äldre materialen så att sparade skyltar går att rita", () => {
    for (const id of ["brass", "acrylic", "epoxy", "aluminium-solid", "aluminium-anodized", "stainless", "plastic-2-layer"]) {
      assert.ok(MATERIALS.some((m) => m.id === id && !m.offered), id);
    }
  });

  it("ett nytt dokument ligger på ett ämne i ett material som säljs och är giltigt", () => {
    const doc = createBadgeDocument(["Anna Lindqvist", "Säljare"]);
    assert.equal(getMaterial(doc.materialId).offered, true);
    assert.equal(blankOf(doc)?.id, "rectangle");
    assert.equal(badgeDocumentSchema.safeParse(doc).success, true);
  });
});

describe("ämnen", () => {
  it("är fyra, ryms inom måttgränserna och ger giltiga dokument med plats för text", () => {
    assert.deepEqual(
      BLANKS.map((b) => b.id),
      ["rectangle", "oval", "rectangle-large", "cushion"],
    );
    for (const blank of BLANKS) {
      assert.ok(blank.widthMm >= SIZE_LIMITS.minWidthMm && blank.widthMm <= SIZE_LIMITS.maxWidthMm, blank.id);
      assert.ok(blank.heightMm >= SIZE_LIMITS.minHeightMm && blank.heightMm <= SIZE_LIMITS.maxHeightMm, blank.id);
      const doc = withBlank(createBadgeDocument(["Anna Lindqvist", "Säljare"]), blank.id);
      assert.equal(badgeDocumentSchema.safeParse(doc).success, true, blank.id);
      assert.equal(blankOf(doc)?.id, blank.id);
      assert.equal(layoutBadge(doc, approxFonts).rows.length, 2, blank.id);
    }
  });

  it("byter form och mått men behåller text, yta och fäste", () => {
    const doc = { ...createBadgeDocument(["Anna"]), colorId: "metal-white", mounting: "magnet" as const };
    const oval = withBlank(doc, "oval");
    assert.equal(oval.shape, "oval");
    assert.deepEqual(oval.size, { widthMm: 70, heightMm: 40 });
    assert.equal(oval.colorId, "metal-white");
    assert.equal(oval.mounting, "magnet");
    assert.deepEqual(oval.rows, doc.rows);
  });

  it("heter som kunden valde det: ämnets namn, eller formens för en äldre skylt", () => {
    assert.equal(shapeLabel(withBlank(createBadgeDocument(), "rectangle-large")), "Stor rektangel");
    assert.equal(shapeLabel({ ...createBadgeDocument(), size: { widthMm: 70, heightMm: 25 } }), "Rundad");
  });

  it("en skylt med fritt mått ligger inte på något ämne", () => {
    assert.equal(blankOf({ ...createBadgeDocument(), size: { widthMm: 70, heightMm: 25 } }), null);
    assert.equal(blankOf({ ...createBadgeDocument(), cornerRadiusMm: 9 }), null);
  });
});

describe("kudden", () => {
  const cushion = withBlank(createBadgeDocument(["Anna"]), "cushion");
  const { widthMm, heightMm } = cushion.size;

  it("når skyltens fulla mått mitt på alla fyra sidor och håller sig innanför", () => {
    const points = pointsOf(cushion);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    assert.ok(Math.abs(Math.min(...xs)) < 1e-9 && Math.abs(Math.max(...xs) - widthMm) < 1e-9);
    assert.ok(Math.abs(Math.min(...ys)) < 1e-9 && Math.abs(Math.max(...ys) - heightMm) < 1e-9);
  });

  it("buktar: bredare än ovalen i hörnen men smalare än rektangeln", () => {
    const y = 4;
    const half = availableHalfWidth(cushion, 0, y, y);
    const oval = availableHalfWidth({ ...cushion, shape: "oval" }, 0, y, y);
    const rectangle = availableHalfWidth({ ...cushion, shape: "rectangle" }, 0, y, y);
    assert.ok(half > oval + 2, `${half} mot ovalens ${oval}`);
    assert.ok(half < rectangle - 0.5, `${half} mot rektangelns ${rectangle}`);
  });

  it("är konvex, så att textytan alltid är smalast i radens över- eller underkant", () => {
    const points = pointsOf(cushion);
    const turns = points.map((a, i) => {
      const b = points[(i + 1) % points.length]!;
      const c = points[(i + 2) % points.length]!;
      return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    });
    assert.ok(turns.every((t) => t >= -1e-9));
  });

  it("dras in jämnt mitt på sidorna utan att konturen försvinner, även långt in", () => {
    for (const inset of [1, 3, 8]) {
      const points = pointsOf(cushion, inset);
      assert.ok(Math.abs(Math.min(...points.map((p) => p.x)) - inset) < 1e-9, `x vid ${inset}`);
      assert.ok(Math.abs(Math.min(...points.map((p) => p.y)) - inset) < 1e-9, `y vid ${inset}`);
    }
    assert.equal(badgeOutline(cushion, heightMm / 2), null);
  });
});

describe("toOfferedDocument", () => {
  it("lämnar en skylt i dagens sortiment orörd", () => {
    const doc = withBlank(createBadgeDocument(["Anna"]), "cushion");
    assert.equal(toOfferedDocument(doc), doc);
  });

  it("flyttar en äldre skylt till närmaste yta och ämne och behåller text, logga och fäste", () => {
    const logo = { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "left" as const, heightMm: 10 };
    const old: BadgeDocument = {
      ...createBadgeDocument(["Anna Berg", "Receptionist"]),
      materialId: "brass",
      colorId: "brass-gold",
      shape: "stadium",
      size: { widthMm: 68, heightMm: 25 },
      mounting: "magnet",
      logo,
    };
    const moved = toOfferedDocument(old);
    assert.equal(moved.materialId, "metal");
    assert.equal(moved.colorId, "metal-gold");
    assert.equal(blankOf(moved)?.id, "rectangle");
    assert.deepEqual(moved.rows, old.rows);
    assert.deepEqual(moved.logo, logo);
    assert.equal(moved.mounting, "magnet");
    assert.equal(badgeDocumentSchema.safeParse(moved).success, true);
  });

  it("väljer yta efter den gamla färgen och ämne efter den gamla formen", () => {
    const base = createBadgeDocument(["Anna"]);
    const white = toOfferedDocument({ ...base, materialId: "plastic-2-layer", colorId: "white-black" });
    const steel = toOfferedDocument({ ...base, materialId: "stainless", colorId: "steel-laser" });
    assert.equal(white.colorId, "metal-white");
    assert.equal(steel.colorId, "metal-silver");

    const round = toOfferedDocument({ ...base, shape: "round", size: { widthMm: 55, heightMm: 55 } });
    const tall = toOfferedDocument({ ...base, shape: "rectangle", size: { widthMm: 74, heightMm: 40 } });
    assert.equal(blankOf(round)?.id, "oval");
    assert.equal(blankOf(tall)?.id, "rectangle-large");
  });

  it("behåller ytan när bara måttet är gammalt", () => {
    const freeSize = { ...createBadgeDocument(["Anna"]), colorId: "metal-silver", size: { widthMm: 70, heightMm: 25 } };
    const moved = toOfferedDocument(freeSize);
    assert.equal(moved.colorId, "metal-silver");
    assert.equal(blankOf(moved)?.id, "rectangle");
  });
});

describe("isOfferedDocument", () => {
  it("godkänner varje ämne i varje yta", () => {
    for (const blank of BLANKS) {
      for (const color of getMaterial("metal").colors) {
        const doc = withBlank({ ...createBadgeDocument(["Anna"]), colorId: color.id }, blank.id);
        assert.equal(isOfferedDocument(doc), true, `${blank.id}/${color.id}`);
      }
    }
  });

  it("stoppar säkerhetsnålen, som inte säljs längre, och byter den mot nål när skylten öppnas", () => {
    const old = { ...createBadgeDocument(["Anna"]), mounting: "safety-pin" as const };
    assert.equal(isOfferedDocument(old), false);
    const moved = toOfferedDocument(old);
    assert.equal(moved.mounting, "pin");
    assert.equal(isOfferedDocument(moved), true);
  });

  it("stoppar äldre material, fritt mått och en yta som inte finns", () => {
    const doc = createBadgeDocument(["Anna"]);
    assert.equal(isOfferedDocument({ ...doc, materialId: "brass", colorId: "brass-gold" }), false);
    assert.equal(isOfferedDocument({ ...doc, materialId: "plastic-2-layer", colorId: "white-black" }), false);
    assert.equal(isOfferedDocument({ ...doc, size: { widthMm: 120, heightMm: 60 } }), false);
    assert.equal(isOfferedDocument({ ...doc, shape: "hexagon" }), false);
    assert.equal(isOfferedDocument({ ...doc, colorId: "brass-gold" }), false);
  });
});
