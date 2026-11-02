import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultContent, shopContentSchema } from "./content";
import { PAGE_TEMPLATES, templatePage } from "./page-templates";

const shop = { slug: "aq-skylt", name: "AQ Skylt", tagline: "Skyltar", address: "Storgatan 1, Gävle" };
const images = ["bildbildbild01", "bildbildbild02", "bildbildbild03", "bildbildbild04"];

describe("sidmallarna", () => {
  it("varje mall ger en giltig sida med de block kortet visar", () => {
    for (const template of PAGE_TEMPLATES) {
      const page = templatePage(template.id, template.label, shop, [""], images.slice(0, template.showcaseImages));
      const content = { ...defaultContent(), pages: [...defaultContent().pages, page] };
      assert.equal(shopContentSchema.safeParse(content).success, true, template.id);
      assert.deepEqual(
        page.blocks.map((b) => b.kind),
        template.blocks,
        template.id,
      );
    }
  });

  it("använder butikens namn, adress och skyltmotor", () => {
    const about = templatePage("about", "Om oss", shop, [""], images);
    assert.equal(about.blocks[0]?.kind === "header" ? about.blocks[0].title : "", "Om AQ Skylt");
    assert.equal(about.blocks[0]?.kind === "header" ? about.blocks[0].imageId : "", "bildbildbild01");
    const contact = templatePage("contact", "Kontakt", shop, [""]);
    assert.ok(contact.blocks.some((b) => b.kind === "map" && b.address === "Storgatan 1, Gävle"));
    const faq = templatePage("faq", "Vanliga frågor", shop, [""]);
    assert.ok(faq.blocks.some((b) => b.kind === "banner" && b.href === "/butik/aq-skylt/skapa"));
  });

  it("tom sida är tom och adressen blir ledig", () => {
    const blank = templatePage("blank", "Kontakt", shop, ["", "kontakt"]);
    assert.equal(blank.blocks.length, 0);
    assert.equal(blank.path, "kontakt-2");
  });
});
