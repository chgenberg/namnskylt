import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  approxFonts,
  badgeDocumentSchema,
  createBadgeDocument,
  frameBands,
  layoutBadge,
  logoHeightLimits,
  parseSmartInput,
  priceBadge,
  renderBadgeSvg,
  withBlank,
} from "./index";
import { endPriceTable } from "./price-model";
import { DEFAULT_PRICE_MODEL } from "./default-price-model";
import { engravedBadge, plasticBadge } from "./testing";
import type { BadgeDocument } from "./types";

describe("parseSmartInput", () => {
  it("delar på komma, pipe och streck med mellanslag", () => {
    assert.deepEqual(parseSmartInput("Anna Lindqvist, Projektledare"), ["Anna Lindqvist", "Projektledare"]);
    assert.deepEqual(parseSmartInput("Erik Holm | Överläkare | Avd 4"), ["Erik Holm", "Överläkare", "Avd 4"]);
    assert.deepEqual(parseSmartInput("Wilma – Barista"), ["Wilma", "Barista"]);
  });

  it("delar inte dubbelnamn med bindestreck", () => {
    assert.deepEqual(parseSmartInput("Lars-Erik Ek"), ["Lars-Erik Ek"]);
  });

  it("tar högst tre rader och tvättar mellanslag", () => {
    assert.deepEqual(parseSmartInput("  a ,b,  c ,d "), ["a", "b", "c"]);
  });
});

describe("layoutBadge", () => {
  it("centrerar en kort rad utan att krympa den", () => {
    const doc = createBadgeDocument(["Anna"]);
    const layout = layoutBadge(doc, approxFonts);
    const row = layout.rows[0]!;
    assert.equal(row.xMm, doc.size.widthMm / 2);
    assert.equal(row.capHeightMm, doc.rows[0]!.capHeightMm);
    assert.deepEqual(layout.issues, []);
  });

  it("krymper en lång rad så den ryms inom säkerhetszonen", () => {
    const doc = createBadgeDocument(["Maximiliana Lindqvist-Östergren"]);
    const layout = layoutBadge(doc, approxFonts);
    const row = layout.rows[0]!;
    assert.ok(row.widthMm <= doc.size.widthMm - 2 * layout.contentInsetMm + 1e-6);
    assert.equal(layout.issues[0]?.code, "row-shrunk");
  });

  it("ger ovalen smalare textyta än en rak skylt", () => {
    const text = ["Anna Lindqvist", "Projektledare", "Avdelningen för kvalitet"];
    const size = { widthMm: 70, heightMm: 25 };
    const rect = layoutBadge({ ...createBadgeDocument(text), shape: "rectangle", size }, approxFonts);
    const oval = layoutBadge({ ...createBadgeDocument(text), shape: "oval", size }, approxFonts);
    assert.ok(oval.rows[2]!.capHeightMm < rect.rows[2]!.capHeightMm);
  });

  it("håller textblocket inom höjden", () => {
    const doc = createBadgeDocument(["A", "B", "C"]);
    doc.rows.forEach((r) => (r.capHeightMm = 12));
    const layout = layoutBadge(doc, approxFonts);
    assert.ok(layout.rows[0]!.baselineMm - layout.rows[0]!.capHeightMm >= layout.contentInsetMm - 1e-6);
    assert.ok(layout.rows[2]!.baselineMm <= doc.size.heightMm - layout.contentInsetMm + 1e-6);
  });

  it("drar in texten innanför ramen", () => {
    const plain = layoutBadge(createBadgeDocument(["Anna"]), approxFonts);
    const framed = layoutBadge(
      { ...createBadgeDocument(["Anna"]), frame: { style: "double", insetMm: 1.5, thicknessMm: 0.4 } },
      approxFonts,
    );
    assert.equal(framed.frames.length, 2);
    assert.ok(framed.contentInsetMm > plain.contentInsetMm);
  });

  it("hoppar över tomma rader", () => {
    const layout = layoutBadge(createBadgeDocument(["Anna", "  "]), approxFonts);
    assert.equal(layout.rows.length, 1);
  });
});

describe("frameBands", () => {
  const withFrame = (style: "none" | "solid" | "double") => ({
    ...createBadgeDocument(["Anna"]),
    frame: { style, insetMm: 1.5, thicknessMm: 0.4 },
  });

  it("ger ett band per ring, utifrån och in", () => {
    assert.deepEqual(frameBands(withFrame("none")), []);
    assert.deepEqual(frameBands(withFrame("solid")), [{ insetMm: 1.5, thicknessMm: 0.4 }]);
    const [outer, inner] = frameBands(withFrame("double"));
    assert.deepEqual(outer, { insetMm: 1.5, thicknessMm: 0.4 });
    assert.ok(inner && inner.insetMm > outer!.insetMm + outer!.thicknessMm);
  });

  it("stämmer med ramarna i layouten", () => {
    for (const style of ["none", "solid", "double"] as const) {
      const doc = withFrame(style);
      assert.equal(frameBands(doc).length, layoutBadge(doc, approxFonts).frames.length);
    }
  });
});

describe("renderBadgeSvg", () => {
  it("escapar text och använder leverantörens färgkonvention i produktion", () => {
    // En skylt som graveras: det som printas finns inte i produktionsfilen.
    const doc = engravedBadge(["Ö & <Å>"]);
    const svg = renderBadgeSvg(doc, layoutBadge(doc, approxFonts), { mode: "production" });
    assert.ok(svg.includes("Ö &amp; &lt;Å&gt;"));
    assert.ok(svg.includes('stroke="#FF0000"'));
    assert.ok(svg.includes('fill="#000000"'));
  });
});

describe("priceBadge", () => {
  it("ger lägre styckpris vid större antal", () => {
    const list = endPriceTable(DEFAULT_PRICE_MODEL);
    const one = priceBadge({ ...createBadgeDocument(["Anna"]), quantity: 10 }, list);
    const many = priceBadge({ ...createBadgeDocument(["Anna"]), quantity: 250 }, list);
    assert.ok(many.unitSek < one.unitSek);
    assert.equal(many.totalSek, many.unitSek * 250 + many.shippingSek);
  });
});

describe("badgeDocumentSchema", () => {
  it("godtar ett nytt dokument med text", () => {
    assert.equal(badgeDocumentSchema.safeParse(createBadgeDocument(["Anna"])).success, true);
  });

  it("ritar plastens guld och silver som borstad metall, och övrig plast med mjuk glans", () => {
    const drawn = (colorId: string) => {
      const doc = { ...createBadgeDocument(["Anna"]), materialId: "plastic" as const, colorId };
      return renderBadgeSvg(doc, layoutBadge(doc, approxFonts), { mode: "preview", fonts: approxFonts });
    };
    // Borstad metall har borstlinjer och ljusa stråk; slät plast har en sned reflex.
    const brushed = /<pattern id="[^"]*-brush"/;
    const reflex = /<linearGradient id="[^"]*-streak"/;
    for (const colorId of ["gold-black", "silver-black"]) {
      assert.match(drawn(colorId), brushed);
      assert.doesNotMatch(drawn(colorId), reflex);
    }
    for (const colorId of ["yellow-black", "white-black"]) {
      assert.match(drawn(colorId), reflex);
      assert.doesNotMatch(drawn(colorId), brushed);
    }
    // Färgkoden är verkstadens och ändras inte av hur ytan ritas.
    assert.match(drawn("gold-black"), /fill="#D4A017"/);
  });

  it("ytans ljus och kant finns bara i förhandsvisningen, aldrig i produktionsfilen", () => {
    const doc = createBadgeDocument(["Anna"]);
    const layout = layoutBadge(doc, approxFonts);
    const preview = renderBadgeSvg(doc, layout, { mode: "preview", fonts: approxFonts, idPrefix: "a" });
    const production = renderBadgeSvg(doc, layout, { mode: "production", fonts: approxFonts });
    assert.match(preview, /<clipPath id="a-clip">/);
    assert.match(preview, /stroke="url\(#a-edge\)"/);
    assert.doesNotMatch(production, /Gradient|pattern|clipPath/);
  });

  it("en logga kunden själv har satt storleken på får ta mer av skylten, och sparade skyltar ritas som förut", () => {
    // En bred logga, som de flesta med text i: förut tog den högst 40 % av bredden hur reglaget än stod.
    const wide = { d: "M0 0L230 0L230 100L0 100Z", viewWidth: 230, viewHeight: 100, placement: "left" as const, heightMm: 40 };
    const doc = { ...createBadgeDocument(["Eva", "VD"]), logo: wide };
    const before = layoutBadge(doc, approxFonts).logo;
    const sized = layoutBadge({ ...doc, logo: { ...wide, sizing: "free" as const } }, approxFonts).logo;
    assert.ok(before && sized);
    const content = doc.size.widthMm - layoutBadge(doc, approxFonts).contentInsetMm * 2;
    assert.ok(Math.abs(before.width - content * 0.4) < 1e-6);
    assert.ok(sized.width > before.width * 1.6);
    // Loggan och texten ryms fortfarande bredvid varandra.
    const free = layoutBadge({ ...doc, logo: { ...wide, sizing: "free" as const } }, approxFonts);
    assert.equal(free.logoOverlapsText, false);
    assert.ok(free.rows.every((row) => row.leftMm >= sized.x + sized.width));

    // Reglaget går mellan det som ritas och det som ryms.
    const limits = logoHeightLimits(doc);
    assert.ok(limits && Math.abs(limits.drawnMm - before.height) < 1e-6 && Math.abs(limits.maxMm - sized.height) < 1e-6);

    // På en oval smalnar skylten uppåt och nedåt: också den största loggan håller sig innanför kanten.
    const oval = withBlank({ ...doc, logo: { ...wide, sizing: "free" as const } }, "metal-oval");
    const inOval = layoutBadge(oval, approxFonts).logo;
    assert.ok(inOval);
    const inset = layoutBadge(oval, approxFonts).contentInsetMm;
    const a = oval.size.widthMm / 2 - inset;
    const b = oval.size.heightMm / 2 - inset;
    for (const [x, y] of [[inOval.x, inOval.y], [inOval.x, inOval.y + inOval.height]] as const) {
      assert.ok(((x - oval.size.widthMm / 2) / a) ** 2 + ((y - oval.size.heightMm / 2) / b) ** 2 <= 1 + 1e-6);
    }
  });

  it("håller luft mellan loggan och texten också när någon av dem har flyttats", () => {
    const wide = { d: "M0 0L230 0L230 100L0 100Z", viewWidth: 230, viewHeight: 100, placement: "left" as const, heightMm: 14 };
    const doc = { ...plasticBadge(["Peter Ström", "Eventansvarig"]), logo: wide };
    const air = (badge: BadgeDocument) => {
      const layout = layoutBadge(badge, approxFonts);
      assert.ok(layout.logo);
      const left = Math.min(...layout.rows.map((row) => row.leftMm));
      const right = Math.max(...layout.rows.map((row) => row.leftMm + row.widthMm));
      return { layout, toRight: left - (layout.logo.x + layout.logo.width), toLeft: layout.logo.x - right };
    };
    // Automatiskt: 2 mm mellan loggan och texten.
    assert.ok(Math.abs(air(doc).toRight - 2) < 1e-6);
    // Loggan flyttad in mot texten: textytan följer med, och texten krymps hellre än att hamna under loggan.
    const nudged = air({ ...doc, logo: { ...wide, offsetMm: { xMm: 4, yMm: 0 } } });
    assert.ok(Math.abs(nudged.toRight - 2) < 1e-6, String(nudged.toRight));
    assert.equal(nudged.layout.logoOverlapsText, false);
    assert.ok(nudged.layout.rows[0]!.capHeightMm < air(doc).layout.rows[0]!.capHeightMm);
    // Texten flyttad in mot loggan: den stannar vid marginalen.
    const pulled = air({ ...doc, textOffsetMm: { xMm: -4, yMm: 0 } });
    assert.ok(pulled.toRight >= 2 - 1e-6, String(pulled.toRight));
    assert.equal(pulled.layout.logoOverlapsText, false);
    // En flytt bort från loggan står kvar som kunden gjorde den.
    const short = { ...plasticBadge(["Eva"]), logo: wide };
    const away = layoutBadge({ ...short, textOffsetMm: { xMm: 3, yMm: 0 } }, approxFonts);
    assert.ok(Math.abs(away.textOffsetMm.xMm - 3) < 1e-6);
    // Loggan dragen till andra sidan av skylten: texten får ytan till vänster om den, med samma luft.
    const swapped = air({ ...doc, logo: { ...wide, offsetMm: { xMm: 40, yMm: 0 } } });
    assert.ok(swapped.toLeft >= 2 - 1e-6, String(swapped.toLeft));
    assert.equal(swapped.layout.logoOverlapsText, false);
    // En logga som står där placeringen lade den ändrar ingenting: samma rader som utan flytt på noll.
    const untouched = layoutBadge(doc, approxFonts).rows;
    assert.deepEqual(layoutBadge({ ...doc, logo: { ...wide, offsetMm: { xMm: 0, yMm: 0 } } }, approxFonts).rows, untouched);
  });

  it("en logga ovanför texten som flyttas: texten håller sig under den, eller över den när det finns mer plats där", () => {
    const logo = { d: "M0 0L100 0L100 100L0 100Z", viewWidth: 100, viewHeight: 100, placement: "top" as const, heightMm: 12 };
    // Plastens stora rektangel, 75 × 45 mm, där det finns höjd att flytta på.
    const doc: BadgeDocument = { ...withBlank(plasticBadge(["Anna Lind", "Säljare"]), "rectangle-large"), logo };
    const at = (yMm: number) => {
      const layout = layoutBadge({ ...doc, logo: { ...logo, offsetMm: { xMm: 0, yMm } } }, approxFonts);
      assert.ok(layout.logo);
      const top = Math.min(...layout.rows.map((row) => row.baselineMm - row.capHeightMm));
      const bottom = Math.max(...layout.rows.map((row) => row.baselineMm));
      return { layout, below: top - (layout.logo.y + layout.logo.height), above: layout.logo.y - bottom, bottom, top };
    };
    // Flyttad lite ned: texten följer med och står 2 mm under loggan.
    const down = at(6);
    assert.ok(Math.abs(down.below - 2) < 1e-6, String(down.below));
    assert.equal(down.layout.logoOverlapsText, false);
    assert.ok(down.bottom <= doc.size.heightMm - down.layout.contentInsetMm + 1e-6);
    // Flyttad långt ned: det finns mer plats ovanför, och texten står 2 mm över loggan.
    const far = at(20);
    assert.ok(Math.abs(far.above - 2) < 1e-6, String(far.above));
    assert.equal(far.layout.logoOverlapsText, false);
    assert.ok(far.top >= far.layout.contentInsetMm - 1e-6);
  });

  it("godtar en skylt med bara logga, och loggan står då mitt på skylten", () => {
    const logo = { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "left" as const, heightMm: 12 };
    const only = { ...createBadgeDocument([""]), logo };
    assert.equal(badgeDocumentSchema.safeParse(only).success, true);
    const { logo: box, rows } = layoutBadge(only, approxFonts);
    assert.ok(box);
    assert.equal(rows.length, 0);
    // Mitt på skylten, inte vid sidan av en text som inte finns.
    assert.ok(Math.abs(box.x + box.width / 2 - only.size.widthMm / 2) < 1e-9);
    assert.ok(Math.abs(box.y + box.height / 2 - only.size.heightMm / 2) < 1e-9);
    // Med ett namn står loggan till vänster om texten, som förut.
    const named = layoutBadge({ ...createBadgeDocument(["Anna Lind"]), logo }, approxFonts);
    assert.ok(named.logo && named.logo.x + named.logo.width / 2 < only.size.widthMm / 2);
  });

  it("nekar en skylt utan text och en färg som inte hör till materialet", () => {
    assert.equal(badgeDocumentSchema.safeParse(createBadgeDocument([""])).success, false);
    const doc = { ...createBadgeDocument(["Anna"]), materialId: "stainless" as const };
    assert.equal(badgeDocumentSchema.safeParse(doc).success, false);
  });
});
