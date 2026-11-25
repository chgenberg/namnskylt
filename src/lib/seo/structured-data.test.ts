import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import { mountingPriceSek } from "@/engine/pricing";
import { endPriceTable } from "@/engine/price-model";
import { factsFromModel } from "./facts";
import { llmsText } from "./llms";
import { pageMetadata, SITE_PAGES } from "./page";
import { faqItems, type SiteFacts } from "./site-facts";
import { faqPage, graph, jsonLdText, pageGraph, products, siteOrganization, webPage, website, workshopOrganization } from "./structured-data";

const facts: SiteFacts = {
  materials: [
    { id: "metal", name: "Metall", oneSek: 463, manySek: 116 },
    { id: "plastic", name: "Plast", oneSek: 431, manySek: 87 },
  ],
  letterSek: 75,
  parcelSek: 159,
  extras: { magnetSek: 10, clipSek: 7, customShapeSek: 32, frameSek: 17, logoSek: 0 },
  extraDeliverySek: 75,
};

type Node = Record<string, unknown>;
const nodes = (data: Node) => data["@graph"] as Node[];
const ids = (data: Node) => new Set(nodes(data).map((node) => node["@id"]).filter(Boolean));

/** Varje `{ "@id": … }` som en del pekar på, rekursivt. */
function references(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) references(item, found);
  else if (value && typeof value === "object") {
    const record = value as Node;
    if (Object.keys(record).length === 1 && typeof record["@id"] === "string") found.push(record["@id"]);
    else for (const item of Object.values(record)) references(item, found);
  }
  return found;
}

describe("JSON-LD", () => {
  it("startsidans delar pekar bara på delar som finns", () => {
    const data = graph([siteOrganization(), workshopOrganization(), website(), webPage(SITE_PAGES.home), ...products(facts), faqPage(facts)]);
    assert.equal(data["@context"], "https://schema.org");
    const known = ids(data);
    for (const id of references(data)) assert.ok(known.has(id), id);
  });

  it("en undersida har brödsmulor och pekar på webbplatsen", () => {
    const data = pageGraph(SITE_PAGES.kontakt, { type: "ContactPage", parts: [workshopOrganization()] });
    const [page, crumbs] = nodes(data);
    assert.equal(page?.["@type"], "ContactPage");
    assert.equal(page?.url, "https://www.namnskylt.com/kontakt");
    assert.deepEqual(page?.breadcrumb, { "@id": crumbs?.["@id"] });
    assert.deepEqual(
      (crumbs?.itemListElement as Node[]).map((item) => [item.position, item.name, item.item]),
      [
        [1, "Start", "https://www.namnskylt.com/"],
        [2, "Kontakta oss", "https://www.namnskylt.com/kontakt"],
      ],
    );
  });

  it("produkterna har pris i kronor exkl. moms, från 500 till en skylt, och en bild", () => {
    for (const product of products(facts)) {
      const offers = product.offers as Node;
      assert.equal(offers.priceCurrency, "SEK");
      assert.ok((offers.lowPrice as number) < (offers.highPrice as number));
      assert.equal((offers.priceSpecification as Node).valueAddedTaxIncluded, false);
      assert.match(String(product.image), /^https:\/\/www\.namnskylt\.com\/namnskyltar\/[a-z]+\/skylt\.png$/);
    }
  });

  it("frågorna i JSON-LD är desamma som på sidan", () => {
    const questions = (faqPage(facts).mainEntity as Node[]).map((q) => q.name);
    assert.deepEqual(questions, faqItems(facts).map((item) => item.question));
  });

  it("inget i texten kan bryta ut ur script-taggen", () => {
    const text = jsonLdText({ name: "</script><script>alert(1)</script>" });
    assert.doesNotMatch(text, /</);
    assert.equal(JSON.parse(text).name, "</script><script>alert(1)</script>");
  });
});

describe("fakta ur prismodellen", () => {
  it("priserna är slutkundens, med nål och startkostnaden, och billigare per styck i större antal", () => {
    const result = factsFromModel(DEFAULT_PRICE_MODEL);
    assert.deepEqual(result.materials.map((m) => m.id), ["metal", "plastic"]);
    for (const material of result.materials) assert.ok(material.manySek < material.oneSek, material.id);
    assert.equal(result.letterSek, DEFAULT_PRICE_MODEL.shipping.letterSek);
    assert.equal(result.parcelSek, DEFAULT_PRICE_MODEL.shipping.parcelSek);
  });

  it("nålen är det billigaste fästet, som frågan om pris säger", () => {
    const list = endPriceTable(DEFAULT_PRICE_MODEL);
    const pin = mountingPriceSek("pin", list, 0);
    for (const other of ["magnet", "clip"] as const) assert.ok(pin <= mountingPriceSek(other, list, 0), other);
    assert.match(faqItems(facts)[0]?.answer ?? "", /från 463 kr.*från 116 kr.*Alla priser exkl\. moms, med nål\./s);
  });
});

describe("sidornas metadata", () => {
  it("varje sida har en egen titel, en beskrivning som ryms i sökresultatet och en kanonisk adress", () => {
    const pages = Object.values(SITE_PAGES);
    const titles = pages.map((page) => ("title" in page ? page.title : page.absoluteTitle));
    assert.equal(new Set(titles).size, pages.length);
    for (const page of pages) {
      assert.ok(page.description.length >= 70 && page.description.length <= 160, `${page.path}: ${page.description.length} tecken`);
      const metadata = pageMetadata(page);
      assert.equal(metadata.alternates?.canonical, page.path);
      assert.equal((metadata.openGraph as Node).description, page.description);
      assert.match(String((metadata.openGraph as Node).title), /namnskylt\.com/);
    }
  });
});

describe("llms.txt", () => {
  const text = llmsText(facts);

  it("följer llmstxt.org: rubrik, sammanfattning och länklistor", () => {
    const lines = text.split("\n");
    assert.equal(lines[0], "# namnskylt.com");
    assert.match(lines[2] ?? "", /^> /);
    for (const page of Object.values(SITE_PAGES)) {
      assert.ok(text.includes(`](https://www.namnskylt.com${page.path === "/" ? "/" : page.path})`), page.path);
    }
    for (const item of faqItems(facts)) assert.ok(text.includes(`### ${item.question}`), item.question);
  });

  it("nämner aldrig inköp, provision eller marginal", () => {
    assert.doesNotMatch(text, /provision|marginal|inköpspris|Ditt inköp/i);
  });
});
