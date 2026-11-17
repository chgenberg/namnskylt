import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BLANKS, MATERIALS, OFFERED_MATERIALS, SIZE_LIMITS, blankArticle, blankFits, getBlank, getMaterial } from "./catalog";
import {
  blankArticleOf,
  blankOf,
  createBadgeDocument,
  isOfferedDocument,
  shapeLabel,
  thicknessOf,
  toOfferedDocument,
  withBlank,
  withFittingBlank,
} from "./document";
import { approxFonts } from "./measure";
import { layoutBadge } from "./layout";
import { badgeDocumentSchema } from "./schema";
import { availableHalfWidth, badgeOutline } from "./shape";
import type { BadgeDocument, BlankId } from "./types";

function pointsOf(doc: BadgeDocument, inset = 0) {
  const outline = badgeOutline(doc, inset);
  assert.ok(outline?.kind === "polygon");
  return outline.points;
}

describe("sortimentet", () => {
  it("säljer verkstadens metallskylt i tre ytor och plastskylt i verkstadens arton färger", () => {
    assert.deepEqual(
      OFFERED_MATERIALS.map((m) => [m.id, m.producer, m.priceClass]),
      [
        ["metal", "skylt-gravyr", "premium"],
        ["plastic", "skylt-gravyr", "standard"],
      ],
    );
    assert.deepEqual(
      getMaterial("metal").colors.map((c) => c.id),
      ["metal-white", "metal-gold", "metal-silver"],
    );
    // De fyra klassiska namnskyltsfärgerna står först; hela listan vaktas i `color-choice.test.ts`.
    assert.equal(getMaterial("plastic").colors.length, 18);
    assert.deepEqual(
      getMaterial("plastic").colors.slice(0, 4).map((c) => c.id),
      ["white-black", "black-white", "gold-black", "silver-black"],
    );
  });

  it("bara plasten skärs ur ark och kan få en egen form; metallen är färdiga ämnen", () => {
    assert.equal(getMaterial("plastic").customShape, true);
    assert.equal(getMaterial("plastic").precut ?? false, false);
    assert.equal(getMaterial("metal").customShape ?? false, false);
    assert.equal(getMaterial("metal").precut, true);
  });

  it("behåller de äldre materialen så att sparade skyltar går att rita", () => {
    for (const id of ["brass", "acrylic", "epoxy", "aluminium-solid", "aluminium-anodized", "stainless", "plastic-2-layer"]) {
      assert.ok(MATERIALS.some((m) => m.id === id && !m.offered), id);
    }
  });

  it("ett nytt dokument ligger på ett ämne i ett material som säljs och är giltigt", () => {
    const doc = createBadgeDocument(["Anna Lindqvist", "Säljare"]);
    assert.equal(getMaterial(doc.materialId).offered, true);
    assert.equal(blankOf(doc)?.id, "metal-rectangle");
    assert.deepEqual(doc.size, { widthMm: 60, heightMm: 30 });
    assert.equal(badgeDocumentSchema.safeParse(doc).success, true);
  });
});

/** En skylt på ämnet, i ett material där ämnet finns. */
function onBlank(blankId: BlankId, texts: string[] = ["Anna"]): BadgeDocument {
  const base = createBadgeDocument(texts);
  const material: BadgeDocument = blankFits(getBlank(blankId), "metal") ? base : { ...base, materialId: "plastic", colorId: "white-black" };
  return withBlank(material, blankId);
}

describe("ämnen", () => {
  it("är fem i metall och fem i plast, ryms inom måttgränserna och ger giltiga dokument med plats för text", () => {
    assert.deepEqual(
      BLANKS.filter((b) => blankFits(b, "metal")).map((b) => [b.id, b.widthMm, b.heightMm]),
      [
        ["metal-rectangle", 60, 30],
        ["metal-rectangle-slim", 60, 18],
        ["metal-tv", 62, 32],
        ["metal-oval", 63, 32],
        ["metal-oval-domed", 59, 34],
      ],
    );
    // Plastens format är orörda: plasten skärs ur ark och är densamma som på verkstadens egen sajt.
    assert.deepEqual(
      BLANKS.filter((b) => blankFits(b, "plastic")).map((b) => [b.id, b.widthMm, b.heightMm]),
      [
        ["rectangle", 75, 25],
        ["oval", 70, 40],
        ["rectangle-large", 75, 45],
        ["cushion", 75, 35],
        ["rectangle-long", 80, 25],
      ],
    );
    // Inget ämne finns på båda materialen, och inget mått finns två gånger: ett mått pekar ut ett ämne.
    assert.ok(BLANKS.every((b) => blankFits(b, "metal") !== blankFits(b, "plastic")));
    assert.equal(new Set(BLANKS.map((b) => `${b.shape}/${b.widthMm}x${b.heightMm}`)).size, BLANKS.length);
    for (const blank of BLANKS) {
      assert.ok(blank.widthMm >= SIZE_LIMITS.minWidthMm && blank.widthMm <= SIZE_LIMITS.maxWidthMm, blank.id);
      assert.ok(blank.heightMm >= SIZE_LIMITS.minHeightMm && blank.heightMm <= SIZE_LIMITS.maxHeightMm, blank.id);
      const doc = onBlank(blank.id, ["Anna Lindqvist", "Säljare"]);
      assert.equal(badgeDocumentSchema.safeParse(doc).success, true, blank.id);
      assert.equal(blankOf(doc)?.id, blank.id);
      assert.equal(isOfferedDocument(doc), true, blank.id);
      assert.equal(layoutBadge(doc, approxFonts).rows.length, 2, blank.id);
    }
  });

  it("metallens ämnen är verkstadens: benämning och tjocklek per yta, som i deras lista", () => {
    const article = (blankId: BlankId, colorId: string) => {
      const found = blankArticle(getBlank(blankId), colorId);
      return found ? [found.name, found.thicknessMm] : null;
    };
    assert.deepEqual(article("metal-tv", "metal-white"), ["Namnskylt Alu Vit matt TV-bricka", 0.8]);
    assert.deepEqual(article("metal-tv", "metal-gold"), ["Namnskylt Mässing TV-Bricka", 0.51]);
    assert.deepEqual(article("metal-tv", "metal-silver"), ["Namnskylt Nickel TV-Bricka", 0.51]);
    assert.deepEqual(article("metal-rectangle", "metal-white"), ["Namnskylt Vit alu matt 60x30", 0.8]);
    assert.deepEqual(article("metal-rectangle", "metal-gold"), ["Namnskylt Mässing 60x30", 0.51]);
    assert.deepEqual(article("metal-rectangle", "metal-silver"), ["Namnskylt Nickel 60x30", 0.51]);
    assert.deepEqual(article("metal-rectangle-slim", "metal-white"), ["Namnskylt Vit alu matt 60x18", 0.8]);
    assert.deepEqual(article("metal-rectangle-slim", "metal-gold"), ["Namnskylt Mässing 60x18", 0.51]);
    assert.deepEqual(article("metal-rectangle-slim", "metal-silver"), ["Namnskylt Nickel 60x18", 0.51]);
    assert.deepEqual(article("metal-oval", "metal-white"), ["Oval Alu Vit Matt 63 x 32mm", 0.8]);
    assert.deepEqual(article("metal-oval", "metal-gold"), ["Oval Alu Vit Matt 63 x 32 mm Mässing", 0.5]);
    assert.deepEqual(article("metal-oval", "metal-silver"), ["Oval Alu Vit Matt 63 x 32 mm Förnicklad", 0.5]);
    assert.deepEqual(article("metal-oval-domed", "metal-white"), ["Oval Alu Vit matt 59x 34 mm Välvd", 0.8]);
    assert.deepEqual(article("metal-oval-domed", "metal-gold"), ["Oval Mässing 59x 34 mm Välvd kant Mässing", 0.5]);
    assert.deepEqual(article("metal-oval-domed", "metal-silver"), ["Oval Mässing 59x 34 mm Välvd kant Förnicklad", 0.5]);
    // Varje metallämne finns i alla tre ytor, och plastens ämnen är inga färdiga ämnen.
    for (const blank of BLANKS) {
      const expected = blankFits(blank, "metal") ? getMaterial("metal").colors.map((c) => c.id) : [];
      assert.deepEqual(Object.keys(blank.articles ?? {}), expected, blank.id);
    }
    assert.equal(getBlank("metal-oval-domed").domed, true);
  });

  it("skylten är så tjock som ämnet i den valda ytan, och en plastskylt som plasten", () => {
    const white = { ...onBlank("metal-rectangle"), colorId: "metal-white" };
    assert.equal(thicknessOf(white), 0.8);
    assert.equal(thicknessOf({ ...white, colorId: "metal-gold" }), 0.51);
    assert.equal(thicknessOf({ ...onBlank("metal-oval"), colorId: "metal-silver" }), 0.5);
    assert.equal(blankArticleOf({ ...white, colorId: "metal-gold" })?.name, "Namnskylt Mässing 60x30");
    assert.equal(thicknessOf(onBlank("rectangle")), 1.5);
    assert.equal(blankArticleOf(onBlank("rectangle")), null);
    // En äldre metallskylt med fritt mått har materialets tjocklek.
    assert.equal(thicknessOf({ ...white, size: { widthMm: 70, heightMm: 25 } }), 0.5);
  });

  it("ytorna heter som verkstadens: vit matt, mässing och nickel", () => {
    assert.deepEqual(
      getMaterial("metal").colors.map((c) => [c.id, c.name]),
      [
        ["metal-white", "Vit matt"],
        ["metal-gold", "Mässing"],
        ["metal-silver", "Nickel"],
      ],
    );
  });

  it("ett byte av material byter till närmaste ämne: rektangel blir rektangel, oval oval och TV-brickan kudde", () => {
    const toPlastic = (doc: BadgeDocument) => blankOf(withFittingBlank({ ...doc, materialId: "plastic", colorId: "white-black" }))?.id;
    const toMetal = (doc: BadgeDocument) => blankOf(withFittingBlank({ ...doc, materialId: "metal", colorId: "metal-gold" }))?.id;
    assert.equal(toPlastic(onBlank("metal-rectangle")), "rectangle");
    assert.equal(toPlastic(onBlank("metal-rectangle-slim")), "rectangle");
    assert.equal(toPlastic(onBlank("metal-tv")), "cushion");
    assert.equal(toPlastic(onBlank("metal-oval")), "oval");
    assert.equal(toPlastic(onBlank("metal-oval-domed")), "oval");
    assert.equal(toMetal(onBlank("rectangle")), "metal-rectangle");
    assert.equal(toMetal(onBlank("rectangle-large")), "metal-rectangle");
    assert.equal(toMetal(onBlank("rectangle-long")), "metal-rectangle");
    assert.equal(toMetal(onBlank("cushion")), "metal-tv");
    assert.equal(toMetal(onBlank("oval")), "metal-oval");
    // En skylt som redan ligger rätt rörs inte.
    const kept = onBlank("metal-tv");
    assert.equal(withFittingBlank(kept), kept);
  });

  it("byter form och mått men behåller text, yta och fäste", () => {
    const doc = { ...createBadgeDocument(["Anna"]), colorId: "metal-white", mounting: "magnet" as const };
    const oval = withBlank(doc, "metal-oval");
    assert.equal(oval.shape, "oval");
    assert.deepEqual(oval.size, { widthMm: 63, heightMm: 32 });
    assert.equal(oval.colorId, "metal-white");
    assert.equal(oval.mounting, "magnet");
    assert.deepEqual(oval.rows, doc.rows);
  });

  it("heter som kunden valde det: ämnets namn, eller formens för en äldre skylt", () => {
    assert.equal(shapeLabel(withBlank(createBadgeDocument(), "metal-tv")), "TV-bricka");
    assert.equal(shapeLabel(withBlank(createBadgeDocument(), "metal-oval-domed")), "Oval, välvd");
    assert.equal(shapeLabel(onBlank("rectangle-large")), "Stor rektangel");
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
    for (const doc of [onBlank("metal-tv"), onBlank("cushion")]) assert.equal(toOfferedDocument(doc), doc);
  });

  it("flyttar en metallskylt i de tidigare måtten till närmaste ämne i dagens", () => {
    const old = (shape: BadgeDocument["shape"], widthMm: number, heightMm: number, cornerRadiusMm = 0): BadgeDocument => ({
      ...createBadgeDocument(["Anna"]),
      shape,
      size: { widthMm, heightMm },
      cornerRadiusMm,
    });
    assert.equal(isOfferedDocument(old("rounded", 75, 25, 3)), false);
    assert.equal(blankOf(toOfferedDocument(old("rounded", 75, 25, 3)))?.id, "metal-rectangle");
    assert.equal(blankOf(toOfferedDocument(old("rounded", 75, 45, 4)))?.id, "metal-rectangle");
    assert.equal(blankOf(toOfferedDocument(old("cushion", 75, 35)))?.id, "metal-tv");
    assert.equal(blankOf(toOfferedDocument(old("oval", 70, 40)))?.id, "metal-oval");
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
    assert.equal(blankOf(moved)?.id, "metal-rectangle");
    assert.deepEqual(moved.rows, old.rows);
    assert.deepEqual(moved.logo, logo);
    assert.equal(moved.mounting, "magnet");
    assert.equal(badgeDocumentSchema.safeParse(moved).success, true);
  });

  it("väljer yta efter den gamla färgen och ämne efter den gamla formen", () => {
    const base = createBadgeDocument(["Anna"]);
    // Äldre plast blir dagens plast, äldre metall dagens metall.
    const white = toOfferedDocument({ ...base, materialId: "plastic-2-layer", colorId: "white-black" });
    const red = toOfferedDocument({ ...base, materialId: "plastic-2-layer", colorId: "red-white" });
    const steel = toOfferedDocument({ ...base, materialId: "stainless", colorId: "steel-laser" });
    assert.deepEqual([white.materialId, white.colorId], ["plastic", "white-black"]);
    assert.equal(red.materialId, "plastic");
    assert.deepEqual([steel.materialId, steel.colorId], ["metal", "metal-silver"]);

    const round = toOfferedDocument({ ...base, shape: "round", size: { widthMm: 55, heightMm: 55 } });
    const tall = toOfferedDocument({ ...base, shape: "rectangle", size: { widthMm: 74, heightMm: 40 } });
    assert.equal(blankOf(round)?.id, "metal-oval-domed");
    assert.equal(blankOf(tall)?.id, "metal-rectangle");
  });

  it("behåller ytan när bara måttet är gammalt", () => {
    const freeSize = { ...createBadgeDocument(["Anna"]), colorId: "metal-silver", size: { widthMm: 70, heightMm: 25 } };
    const moved = toOfferedDocument(freeSize);
    assert.equal(moved.colorId, "metal-silver");
    assert.equal(blankOf(moved)?.id, "metal-rectangle");
  });
});

describe("isOfferedDocument", () => {
  it("godkänner varje ämne i varje yta", () => {
    for (const blank of BLANKS.filter((b) => blankFits(b, "metal"))) {
      for (const color of getMaterial("metal").colors) {
        const doc = withBlank({ ...createBadgeDocument(["Anna"]), colorId: color.id }, blank.id);
        assert.equal(isOfferedDocument(doc), true, `${blank.id}/${color.id}`);
      }
    }
  });

  it("ett ämne går bara att beställa i sitt eget material", () => {
    const metal = withBlank(createBadgeDocument(["Anna"]), "rectangle-long");
    const plastic: BadgeDocument = { ...metal, materialId: "plastic", colorId: "white-black" };
    assert.equal(getMaterial(metal.materialId).finish === "plastic", false);
    assert.equal(isOfferedDocument(metal), false);
    assert.equal(isOfferedDocument(plastic), true);
    // En metallskylt i plastens mått flyttas till metallens rektangel.
    assert.equal(blankOf(toOfferedDocument(metal))?.id, "metal-rectangle");
    assert.equal(toOfferedDocument(plastic), plastic);
    // Och metallens mått finns inte i plast.
    const metalSize: BadgeDocument = { ...withBlank(createBadgeDocument(["Anna"]), "metal-rectangle-slim"), materialId: "plastic", colorId: "white-black" };
    assert.equal(isOfferedDocument(metalSize), false);
    assert.equal(blankOf(toOfferedDocument(metalSize))?.id, "rectangle");
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
