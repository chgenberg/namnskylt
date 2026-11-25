import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { badgeDocumentSchema, isOfferedDocument, markingOf } from "@/engine";
import type { SiteFacts } from "@/lib/seo/site-facts";
import { TOPIC_EXAMPLES } from "./examples";
import { getTopic, TOPIC_HUB, TOPICS } from "./model";

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

/** All text en sida visar, med fakta insatta. */
const textOf = (slug: string) => {
  const topic = getTopic(slug)!;
  return [
    topic.title,
    topic.description,
    topic.lead,
    topic.example,
    ...topic.sections(facts).flatMap((section) => [section.heading, ...section.paragraphs]),
    ...topic.faq(facts).flatMap((item) => [item.question, item.answer]),
  ].join("\n");
};

describe("sidorna om namnskyltar", () => {
  it("har unika adresser och titlar, och beskrivningar som ryms i sökresultatet", () => {
    assert.equal(new Set(TOPICS.map((t) => t.slug)).size, TOPICS.length);
    assert.equal(new Set(TOPICS.map((t) => t.title)).size, TOPICS.length);
    for (const topic of [...TOPICS, TOPIC_HUB]) {
      assert.match("slug" in topic ? topic.slug : "namnskyltar", /^[a-z-]+$/);
      assert.ok(topic.description.length >= 70 && topic.description.length <= 160, `${topic.title}: ${topic.description.length} tecken`);
    }
  });

  it("länkar bara till sidor som finns, och aldrig till sig själv", () => {
    for (const topic of TOPICS) {
      assert.ok(topic.related.length >= 3, topic.slug);
      for (const slug of topic.related) {
        assert.ok(getTopic(slug), `${topic.slug} → ${slug}`);
        assert.notEqual(slug, topic.slug);
      }
    }
  });

  it("varje sida har avsnitt och vanliga frågor", () => {
    for (const topic of TOPICS) {
      assert.ok(topic.sections(facts).length >= 2, topic.slug);
      assert.ok(topic.faq(facts).length >= 2, topic.slug);
    }
  });

  it("nämner aldrig inköp, provision eller marginal", () => {
    for (const topic of TOPICS) assert.doesNotMatch(textOf(topic.slug), /provision|marginal|inköpspris/i, topic.slug);
  });

  it("priserna kommer ur prismodellen", () => {
    assert.match(textOf("med-magnet"), /Magneten kostar 10 kr mer per skylt än nål\./);
    assert.match(textOf("med-klamma"), /Klämman kostar 7 kr mer per skylt än nål\./);
    assert.match(textOf("egen-form"), /Egen form kostar från 32 kr per skylt\./);
    assert.match(textOf("plast"), /ram, enkel eller dubbel, kostar från 17 kr per skylt/);
    assert.match(textOf("butik"), /Varje extra adress kostar 75 kr i frakt\./);
    assert.match(textOf("med-logga"), /Loggan kostar inget extra\./);
    assert.match(textOf("massa-och-event"), /paket med DHL kostar 159 kr/);
  });

  it("säger aldrig att metall graveras, eller att klämma och egen form finns på metall", () => {
    const metal = textOf("metall");
    assert.match(metal, /metallskyltarna printas/);
    assert.doesNotMatch(metal, /graverad (logga|text) på metall|metall graveras/i);
    assert.match(textOf("med-klamma"), /Metallskyltarna är mindre och får nål eller magnet\./);
    assert.match(textOf("egen-form"), /Egen form finns på plastskyltar\./);
  });
});

describe("exempelskyltarna", () => {
  it("finns för varje sida, och går att beställa som de är", () => {
    for (const topic of TOPICS) {
      const doc = TOPIC_EXAMPLES[topic.slug];
      assert.ok(doc, topic.slug);
      assert.ok(badgeDocumentSchema.safeParse(doc).success, `${topic.slug}: schemat`);
      assert.ok(isOfferedDocument(doc), `${topic.slug}: sortimentet`);
      assert.ok(topic.materials.includes(doc.materialId as "metal" | "plastic"), `${topic.slug}: materialet`);
    }
  });

  it("visar det sidan handlar om", () => {
    const doc = (slug: string) => TOPIC_EXAMPLES[slug]!;
    assert.equal(doc("med-magnet").mounting, "magnet");
    assert.equal(doc("med-nal").mounting, "pin");
    assert.equal(doc("med-klamma").mounting, "clip");
    assert.equal(doc("vard").mounting, "clip");
    assert.equal(doc("egen-form").shape, "custom");
    assert.equal(doc("metall").materialId, "metal");
    assert.equal(doc("plast").materialId, "plastic");
    assert.ok(doc("med-logga").logo);
    assert.ok(doc("butik").logo);
    assert.equal(markingOf(doc("metall")), "print");
    assert.equal(markingOf(doc("plast")), "engrave");
  });

  it("raden under bilden stämmer med skylten", () => {
    const shapes: Record<string, RegExp> = { "med-klamma": /80 × 25 mm/, vard: /80 × 25 mm/, "egen-form": /92 × 44 mm/ };
    for (const [slug, size] of Object.entries(shapes)) {
      const d = TOPIC_EXAMPLES[slug]!;
      assert.match(getTopic(slug)!.example, size, slug);
      assert.match(`${d.size.widthMm} × ${d.size.heightMm} mm`, size, slug);
    }
  });
});
