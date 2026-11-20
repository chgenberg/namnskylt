import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { approxFonts, createBadgeDocument, layoutBadge, mountingLabel, toOfferedDocument, withBlank, withShapePreset, type FontEngine } from "@/engine";
import { engravedBadge, plasticBadge } from "@/engine/testing";
import { loadNodeFontEngine } from "@/lib/fonts/load-node";
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

  it("skickar en kudde i plast som fri form med kuddens egna punkter, så att verkstaden skär rätt kontur", () => {
    const cushion = withBlank({ ...createBadgeDocument(["Anna"]), materialId: "plastic" as const, colorId: "white-black" }, "cushion");
    const supplier = toSupplierSignDocument(cushion, approxFonts);
    assert.equal(supplier.material, "plastic-1.5mm");
    assert.equal(supplier.shape, "freeform");
    assert.equal(supplier.cornerRadiusMm, 0);
    const points = supplier.customShapePoints ?? [];
    assert.equal(points.length, 128);
    // Punkterna ligger inom skyltens mått och når ut till alla fyra kanter.
    assert.ok(points.every((p) => p.x >= 0 && p.x <= 75 && p.y >= 0 && p.y <= 35));
    assert.equal(Math.min(...points.map((p) => p.x)), 0);
    assert.equal(Math.max(...points.map((p) => p.x)), 75);
    assert.equal(Math.min(...points.map((p) => p.y)), 0);
    assert.equal(Math.max(...points.map((p) => p.y)), 35);
    // Kudden är fylligare än en oval: hörnet ligger utanför ovalens kontur.
    assert.ok(points.some((p) => ((p.x - 37.5) / 37.5) ** 2 + ((p.y - 17.5) / 17.5) ** 2 > 1.2));
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
      // Utan vald metod, som skyltar sparades förut: en svartvit logga graveras.
      ...engravedBadge(["Anna"]),
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
    assert.equal(layer.transform.position.y, 15);
    assert.match(layer.data.vector.markup, /^<path d="M0 0L10 0L10 10L0 10Z" fill="#000000" fill-rule="evenodd"\/>$/);
  });

  it("skickar en skylt med bara logga: loggans lager mitt på skylten och inget textlager", () => {
    const doc = {
      ...createBadgeDocument([""]),
      logo: { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "left" as const, heightMm: 12 },
    };
    const supplier = toSupplierSignDocument(doc, approxFonts, { logoPng: "data:image/png;base64,AA" });
    assert.deepEqual(supplier.layers.map((layer) => layer.data.kind), ["image"]);
    const [layer] = supplier.layers;
    assert.ok(layer?.data.kind === "image");
    // Skylten är i metall, som bara går att printa på.
    assert.equal(layer.data.renderMode, "print");
    // Lagrets mittpunkt är skyltens mitt.
    assert.equal(layer.transform.position.x, doc.size.widthMm / 2);
    assert.equal(layer.transform.position.y, doc.size.heightMm / 2);
    // På plast graveras en svartvit logga, om inget annat är valt.
    const plastic = toSupplierSignDocument({ ...plasticBadge([""]), logo: doc.logo }, approxFonts, { logoPng: "data:image/png;base64,AA" });
    assert.deepEqual(plastic.layers.map((l) => (l.data.kind === "image" ? l.data.renderMode : l.data.kind)), ["engrave"]);
  });

  it("dagens metallskylt printas: metoden står i klartext, efter verkstadens benämning på ämnet", () => {
    const today = toSupplierSignDocument(createBadgeDocument(["Anna"]), approxFonts);
    assert.equal(today.productionNote, "Ämne: Namnskylt Mässing 60x30, 0,51 mm. Märkningsmetod: Endast print. Namn: Print.");
    // En äldre metallskylt utan vald metod graverades, och har bara ämnets benämning.
    assert.equal(toSupplierSignDocument(engravedBadge(["Anna"]), approxFonts).productionNote, "Ämne: Namnskylt Mässing 60x30, 0,51 mm.");
  });

  it("fästet, ämnet och märkningen följer med som egna rader till verkstadens orderpapper", () => {
    // Dagens metallskylt: fäste, verkstadens benämning på ämnet och metoden.
    assert.deepEqual(toSupplierSignDocument(createBadgeDocument(["Anna"]), approxFonts).partnerSpecs, [
      { label: "Fäste", value: "Nål" },
      { label: "Ämne", value: "Namnskylt Mässing 60x30, 0,51 mm" },
      { label: "Märkning", value: "Endast print" },
    ]);
    // En plastskylt som graveras har bara fästet. Klämmans riktning står i fästets namn.
    assert.deepEqual(toSupplierSignDocument(plasticBadge(["Anna"]), approxFonts).partnerSpecs, [{ label: "Fäste", value: "Nål" }]);
    const clip = toOfferedDocument({ ...plasticBadge(["Anna"]), size: { widthMm: 80, heightMm: 25 }, mounting: "clip", clipOrientation: "horizontal" });
    assert.equal(mountingLabel(clip), "Klämma, horisontellt");
    assert.deepEqual(toSupplierSignDocument(clip, approxFonts).partnerSpecs, [{ label: "Fäste", value: "Klämma, horisontellt" }]);
    // Tryckfärgen står utan sitt ledord, eftersom raden redan heter Tryckfärg.
    const colored = toSupplierSignDocument({ ...createBadgeDocument(["Anna", "Säljare"]), printColor: "#0057B8" }, approxFonts);
    assert.deepEqual(colored.partnerSpecs?.find((row) => row.label === "Tryckfärg"), { label: "Tryckfärg", value: "#0057B8" });
    // Kommentaren i löptext följer med som förut: verkstaden ritar den tills raderna är inlästa där.
    assert.match(colored.productionNote ?? "", /Märkningsmetod: Endast print\. Namn: Print\. Tryckfärg #0057B8\.$/);
    // Varje rad har rubrik och värde, och inget av dem bär en radbrytning.
    for (const row of colored.partnerSpecs ?? []) assert.match(`${row.label}|${row.value}`, /^[^\n|]+\|[^\n]+$/);
  });

  it("skickar gravyrformen när en logga i färg graveras, och siluetten rörs inte när den printas", () => {
    const logo = {
      d: "M0 0L10 0L10 10L0 10Z",
      engraveD: "M0 0L10 0L10 10L0 10ZM3 3L7 3L7 7L3 7Z",
      viewWidth: 10,
      viewHeight: 10,
      placement: "left" as const,
      heightMm: 12,
      image: { src: "data:image/png;base64,AA" },
    };
    const layerOf = (marking: "engrave" | "engrave-name-print-logo") =>
      toSupplierSignDocument({ ...createBadgeDocument(["Anna"]), logo, marking }, approxFonts, { logoPng: "data:image/png;base64,BB" }).layers.find(
        (l) => l.data.kind === "image",
      );
    const engraved = layerOf("engrave");
    assert.ok(engraved?.data.kind === "image" && engraved.data.renderMode === "engrave");
    assert.equal(engraved.data.vector.markup, `<path d="${logo.engraveD}" fill="#000000" fill-rule="evenodd"/>`);
    const printed = layerOf("engrave-name-print-logo");
    assert.ok(printed?.data.kind === "image" && printed.data.renderMode === "print");
    assert.equal(printed.data.src, logo.image.src);
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
    // En skylt utan vald metod, så att alla fyra metoderna går att pröva på samma underlag.
    const base = engravedBadge(["Anna"]);
    // Ett färdigt metallämne står alltid med verkstadens benämning, också när skylten bara graveras.
    const ARTICLE = "Ämne: Namnskylt Mässing 60x30, 0,51 mm.";
    const withArticle = (note: string) => `${ARTICLE} ${note}`;
    // En logga i färg som kunden valt att gravera skickas med sina banor, inte som tryckbild.
    const engraved = sent({ ...base, logo: color, marking: "engrave" });
    assert.equal(engraved.data.renderMode, "engrave");
    assert.equal(engraved.data.src, thumb);
    assert.ok("vector" in engraved.data);
    assert.equal(engraved.supplier.productionNote, ARTICLE);
    // En svartvit logga som printas skickas som sin miniatyr.
    const printed = sent({ ...base, logo: mono, marking: "engrave-name-print-logo" });
    assert.equal(printed.data.renderMode, "print");
    assert.equal(printed.data.src, thumb);
    assert.equal(printed.supplier.productionNote, withArticle("Märkningsmetod: Namn graveras · logotyp printas. Namn: Gravyr. Logotyp: Print."));
    // Textlagret har inget läge hos leverantören: ett printat namn sägs i klartext.
    const namePrinted = toSupplierSignDocument({ ...base, marking: "print" }, approxFonts);
    assert.equal(namePrinted.productionNote, withArticle("Märkningsmetod: Endast print. Namn: Print."));
    // Kundens färgkod för trycket följer med i samma rad, men bara när något printas.
    assert.equal(
      toSupplierSignDocument({ ...base, marking: "print", printColor: "PMS 286 C" }, approxFonts).productionNote,
      withArticle("Märkningsmetod: Endast print. Namn: Print. Tryckfärg PMS 286 C."),
    );
    assert.equal(toSupplierSignDocument({ ...base, printColor: "PMS 286 C" }, approxFonts).productionNote, ARTICLE);
    // En rad med egen kod: hexkoden går i radens färgfält, och alla koder står i klartext.
    const two = engravedBadge(["Anna", "Säljare"]);
    const rows = two.rows.map((row, i) => ({ ...row, printColor: i === 0 ? "#c8102e" : "PMS 300 C" }));
    const rowColors = (doc: typeof two) =>
      toSupplierSignDocument(doc, approxFonts).layers.flatMap((l) => (l.data.kind === "text" ? l.data.rows.map((row) => row.color) : []));
    assert.deepEqual(rowColors({ ...two, rows, marking: "print" }), ["#C8102E", undefined]);
    assert.equal(
      toSupplierSignDocument({ ...two, rows, marking: "print" }, approxFonts).productionNote,
      withArticle("Märkningsmetod: Endast print. Namn: Print. Tryckfärg rad 1 #C8102E, rad 2 PMS 300 C."),
    );
    // En CMYK-kod går i radens färgfält som skärmens ungefärliga färg; koden själv står i klartext.
    const cmykRows = two.rows.map((row, i) => (i === 0 ? { ...row, printColor: "c0 m100 y80 k0" } : row));
    assert.deepEqual(rowColors({ ...two, rows: cmykRows, marking: "print", printColor: "100/60/0/20" }), ["#FF0033", "#0052CC"]);
    assert.equal(
      toSupplierSignDocument({ ...two, rows: cmykRows, marking: "print", printColor: "100/60/0/20" }, approxFonts).productionNote,
      withArticle("Märkningsmetod: Endast print. Namn: Print. Tryckfärg CMYK 100/60/0/20, rad 1 CMYK 0/100/80/0."),
    );
    // Loggans egna koder står sist i samma rad, när loggan printas.
    assert.equal(
      sent({ ...base, logo: { ...color, printColor: "blå 100/60/0/20, röd 0/100/80/0" } }).supplier.productionNote,
      withArticle("Märkningsmetod: Namn graveras · logotyp printas. Namn: Gravyr. Logotyp: Print. Tryckfärg logga blå 100/60/0/20, röd 0/100/80/0."),
    );
    assert.equal(sent({ ...base, logo: { ...color, printColor: "100/60/0/20" }, marking: "engrave" }).supplier.productionNote, ARTICLE);
    // En hexkod för hela trycket blir färgen på rader utan egen kod.
    assert.deepEqual(rowColors({ ...two, marking: "print", printColor: "#0057b8" }), ["#0057B8", "#0057B8"]);
    // När namnet graveras följer ingen radfärg med.
    assert.deepEqual(rowColors({ ...two, rows }), [undefined, undefined]);
    assert.ok(namePrinted.layers.some((l) => l.data.kind === "text"));
    // En skylt som bara graveras bär bara ämnets benämning, i den yta som är vald.
    assert.equal(toSupplierSignDocument(base, approxFonts).productionNote, ARTICLE);
    assert.equal(
      toSupplierSignDocument({ ...base, colorId: "metal-white" }, approxFonts).productionNote,
      "Ämne: Namnskylt Vit alu matt 60x30, 0,8 mm.",
    );
    // En plastskylt skärs ur ark och har inget färdigt ämne att peka ut.
    assert.equal(toSupplierSignDocument(toOfferedDocument({ ...base, materialId: "plastic", colorId: "white-black" }), approxFonts).productionNote, undefined);
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
    assert.equal(stadium.cornerRadiusMm, 15);
    const hexagon = toSupplierSignDocument({ ...base, shape: "hexagon" }, approxFonts);
    assert.equal(hexagon.shape, "hexagon");
    assert.equal(hexagon.cornerRadiusMm, 0);
  });
});

describe("det som printas skickas som ett trycklager", () => {
  let fonts: FontEngine;
  before(async () => {
    fonts = await loadNodeFontEngine();
  });

  /** Det verkstadens vektorlager släpper igenom (deras `sanitizeVectorMarkup`): bara dessa banor, i den här ordningen. */
  const WORKSHOP_MARKUP = /^(<path d="[MLCZ0-9 .eE+-]+" fill="#[0-9a-f]{6}"( fill-rule="evenodd")?\/>)+$/;
  const mono = { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "left" as const, heightMm: 12 };
  // Plastens rektangel, 75 × 25 mm: metallens och plastens ämnen har olika mått.
  const plastic = (rows: string[]) => plasticBadge(rows);
  const printLayerOf = (supplier: ReturnType<typeof toSupplierSignDocument>) => {
    const layer = supplier.layers.find((l) => l.id === "print");
    return layer?.data.kind === "image" && layer.data.renderMode === "print" ? layer : undefined;
  };
  const fills = (markup: string) => [...markup.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]);

  it("ett printat namn blir banor i tryckläge, utan textlager som skulle graveras", () => {
    const doc = { ...plastic(["Anna Lind", "Säljare"]), marking: "print" as const };
    const supplier = toSupplierSignDocument(doc, fonts);
    assert.deepEqual(supplier.layers.map((l) => l.data.kind), ["image"]);
    const layer = printLayerOf(supplier);
    assert.ok(layer?.data.kind === "image" && layer.data.renderMode === "print" && layer.data.vector);
    // Lagret täcker hela skylten, så banorna ligger i skyltens egna mm.
    assert.deepEqual(layer.transform.position, { x: 37.5, y: 12.5 });
    assert.deepEqual([layer.data.widthMm, layer.data.heightMm], [75, 25]);
    assert.deepEqual([layer.data.vector.viewWidth, layer.data.vector.viewHeight], [75, 25]);
    assert.equal(layer.data.src, "");
    // Bokstävernas kvadratiska kurvor är omräknade: verkstaden tar bara M, L, C och Z.
    assert.match(layer.data.vector.markup, WORKSHOP_MARKUP);
    assert.ok(layer.data.vector.markup.includes("C"));
    // En bana per rad, i färgen skylten visades i.
    assert.deepEqual(fills(layer.data.vector.markup), ["#111111", "#111111"]);
    // Texten står i kommentaren, eftersom verkstaden inte har något textlager att läsa.
    assert.equal(supplier.productionNote, "Märkningsmetod: Endast print. Namn: Print. Text som printas: Anna Lind / Säljare.");
    // Och som en egen rad på orderpappret.
    assert.deepEqual(supplier.partnerSpecs?.at(-1), { label: "Tryckt text", value: "Anna Lind / Säljare" });
  });

  it("kundens färger följer med som fyllnad: hela trycket, en rad och en CMYK-kod", () => {
    const base = plastic(["Anna Lind", "Säljare", "Butiken"]);
    const rows = base.rows.map((row, i) => (i === 1 ? { ...row, printColor: "#C8102E" } : i === 2 ? { ...row, printColor: "0/100/80/0" } : row));
    const supplier = toSupplierSignDocument({ ...base, rows, marking: "print", printColor: "100/60/0/20" }, fonts);
    const layer = printLayerOf(supplier);
    assert.ok(layer?.data.kind === "image" && layer.data.renderMode === "print" && layer.data.vector);
    assert.deepEqual(fills(layer.data.vector.markup), ["#0052cc", "#c8102e", "#ff0033"]);
    assert.match(supplier.productionNote ?? "", /Tryckfärg CMYK 100\/60\/0\/20, rad 2 #C8102E, rad 3 CMYK 0\/100\/80\/0\. Text som printas: Anna Lind \/ Säljare \/ Butiken\.$/);
  });

  it("en printad ram ligger i trycklagret, inte som ramlager", () => {
    const doc = { ...plastic(["Anna Lind"]), marking: "print" as const, frame: { style: "solid" as const, insetMm: 1.5, thicknessMm: 0.4 } };
    const supplier = toSupplierSignDocument(doc, fonts);
    assert.ok(!supplier.layers.some((l) => l.data.kind === "frame" || l.data.kind === "text"));
    const layer = printLayerOf(supplier);
    assert.ok(layer?.data.kind === "image" && layer.data.renderMode === "print" && layer.data.vector);
    assert.match(layer.data.vector.markup, WORKSHOP_MARKUP);
    // Ramen är en ring (evenodd) och raden en egen bana.
    assert.equal(layer.data.vector.markup.match(/fill-rule="evenodd"/g)?.length, 1);
    assert.equal(fills(layer.data.vector.markup).length, 2);
  });

  it("en svartvit logga som printas ligger i trycklagret i sin färg, inte som svart miniatyr", () => {
    const logo = { ...mono, printColor: "0/100/80/0" };
    const supplier = toSupplierSignDocument({ ...plastic(["Anna Lind"]), logo, marking: "engrave-name-print-logo" }, fonts, { logoPng: "data:image/png;base64,AA" });
    // Namnet graveras och är kvar som text. Loggan finns bara i trycklagret.
    assert.deepEqual(supplier.layers.map((l) => l.data.kind), ["text", "image"]);
    assert.equal(supplier.layers[1]!.id, "print");
    const layer = printLayerOf(supplier);
    assert.ok(layer?.data.kind === "image" && layer.data.renderMode === "print" && layer.data.vector);
    assert.deepEqual(fills(layer.data.vector.markup), ["#ff0033"]);
    assert.match(layer.data.vector.markup, WORKSHOP_MARKUP);
  });

  it("en logga i färg som printas är fortfarande en bild, och ett graverat namn fortfarande text", () => {
    const color = { ...mono, image: { src: "data:image/png;base64,iVBORw0KGgo=" } };
    const supplier = toSupplierSignDocument({ ...plastic(["Anna Lind"]), logo: color }, fonts);
    assert.equal(printLayerOf(supplier), undefined);
    assert.deepEqual(supplier.layers.map((l) => l.data.kind), ["image", "text"]);
    const image = supplier.layers[0]!;
    assert.ok(image.data.kind === "image" && image.data.renderMode === "print" && !image.data.vector);
    assert.equal(image.data.src, color.image.src);
  });

  it("ett printat namn med graverad logga: loggan graveras med sina banor, namnet printas", () => {
    const supplier = toSupplierSignDocument({ ...plastic(["Anna Lind"]), logo: mono, marking: "print-name-engrave-logo" }, fonts, { logoPng: "data:image/png;base64,AA" });
    assert.deepEqual(supplier.layers.map((l) => l.id), ["logo", "print"]);
    const logo = supplier.layers[0]!;
    assert.ok(logo.data.kind === "image" && logo.data.renderMode === "engrave");
    assert.equal(fills((printLayerOf(supplier)?.data as { vector: { markup: string } }).vector.markup).length, 1);
  });

  it("en logga med trasig bana stoppar inte ordern: då skickas namnet som text och loggan som miniatyr", () => {
    // Mönstret för loggans bana släpper igenom tal efter Z. Omräkningen till trycklagret vägrar den.
    const broken = { ...mono, d: "M0 0L10 0L10 10Z5 5" };
    const thumb = "data:image/png;base64,AA";
    const supplier = toSupplierSignDocument({ ...plastic(["Anna Lind"]), logo: broken, marking: "print" }, fonts, { logoPng: thumb });
    assert.equal(printLayerOf(supplier), undefined);
    assert.deepEqual(supplier.layers.map((l) => l.data.kind), ["image", "text"]);
    const logo = supplier.layers[0]!;
    assert.ok(logo.data.kind === "image" && logo.data.renderMode === "print");
    assert.equal(logo.data.src, thumb);
    // Utan trycklager står metoden bara i klartext, utan raden om texten.
    assert.equal(supplier.productionNote, "Märkningsmetod: Endast print. Namn: Print. Logotyp: Print.");
  });

  it("en graverad text i ett typsnitt verkstaden inte har skickas som färdiga banor", () => {
    const doc = { ...plastic(["Anna Lind", "Säljare"]), font: "pacifico" as const };
    const supplier = toSupplierSignDocument(doc, fonts);
    // Inget textlager: verkstadens motor har inte typsnittet. Banorna ligger i ett bildlager som graveras.
    assert.deepEqual(supplier.layers.map((l) => (l.data.kind === "image" ? `${l.id}:${l.data.renderMode}` : l.data.kind)), ["engraved-text:engrave"]);
    const [layer] = supplier.layers;
    assert.ok(layer?.data.kind === "image" && layer.data.renderMode === "engrave");
    assert.equal(layer.data.src, "");
    assert.deepEqual([layer.data.widthMm, layer.data.heightMm, layer.data.vector.viewWidth, layer.data.vector.viewHeight], [75, 25, 75, 25]);
    assert.match(layer.data.vector.markup, WORKSHOP_MARKUP);
    // En bana per rad, svart: det är det verkstadens gravyrfil fräser.
    assert.deepEqual(fills(layer.data.vector.markup), ["#000000", "#000000"]);
    // Texten och typsnittet står i klartext, på orderpappret och i kommentaren.
    assert.deepEqual(supplier.partnerSpecs, [
      { label: "Fäste", value: "Nål" },
      { label: "Typsnitt", value: "Pacifico" },
      { label: "Graverad text", value: "Anna Lind / Säljare" },
    ]);
    assert.equal(supplier.productionNote, "Typsnitt: Pacifico. Text som graveras: Anna Lind / Säljare.");
    // Ramen är fortfarande verkstadens eget ramlager.
    const framed = toSupplierSignDocument({ ...doc, frame: { style: "solid" as const, insetMm: 1.5, thicknessMm: 0.4 } }, fonts);
    assert.deepEqual(framed.layers.map((l) => l.data.kind), ["frame", "image"]);
    // Verkstadens egna typsnitt skickas som text, som förut.
    const own = toSupplierSignDocument(plastic(["Anna Lind"]), fonts);
    assert.deepEqual(own.layers.map((l) => l.data.kind), ["text"]);
    assert.equal(own.partnerSpecs?.some((row) => row.label === "Typsnitt"), false);
    // Utan konturer skickas texten som text, i verkstadens Arial: deras motor känner inte typsnittets namn.
    const rough = toSupplierSignDocument(doc, approxFonts);
    assert.deepEqual(rough.layers.map((l) => (l.data.kind === "text" ? l.data.font : l.data.kind)), ["arial", "arial"]);
    // Printas namnet ligger det i trycklagret som förut, och typsnittet står med på orderpappret.
    const printed = toSupplierSignDocument({ ...doc, marking: "print" as const }, fonts);
    assert.deepEqual(printed.layers.map((l) => (l.data.kind === "image" ? l.data.renderMode : l.data.kind)), ["print"]);
    assert.deepEqual(printed.partnerSpecs?.map((row) => row.label), ["Fäste", "Märkning", "Typsnitt", "Tryckt text"]);
  });

  it("en skylt som bara graveras har inget trycklager", () => {
    const supplier = toSupplierSignDocument(plastic(["Anna Lind"]), fonts);
    assert.equal(printLayerOf(supplier), undefined);
    assert.equal(supplier.productionNote, undefined);
  });
});
