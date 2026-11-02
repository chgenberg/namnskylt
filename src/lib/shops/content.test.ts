import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BLOCK_KINDS,
  contentOrDefault,
  defaultContent,
  findPage,
  imagesIn,
  isBannerActive,
  newBlock,
  newPage,
  pathFor,
  lockStartPage,
  mapEmbedUrl,
  shopContentSchema,
  videoEmbed,
  type ShopContent,
} from "./content";

const withPages = (...pages: ShopContent["pages"]): ShopContent => ({ version: 2, pages });

describe("butikens sidor", () => {
  it("standardsidan är giltig: startsidan med tre steg", () => {
    const content = defaultContent();
    assert.equal(shopContentSchema.safeParse(content).success, true);
    assert.equal(content.pages[0]?.path, "");
    assert.equal(content.pages[0]?.blocks[0]?.kind, "steps");
  });

  it("varje nytt block och ny sida är giltiga", () => {
    const start = defaultContent().pages[0];
    assert.ok(start);
    const about = newPage("Om oss", [""]);
    about.blocks.push(...BLOCK_KINDS.map((k) => newBlock(k)));
    const content = withPages(start, about);
    assert.equal(shopContentSchema.safeParse(content).success, true);
    assert.equal(about.path, "om-oss");
    assert.equal(findPage(content, "om-oss")?.label, "Om oss");
  });

  it("ger lediga adresser och undviker butikens egna", () => {
    assert.equal(pathFor("Kontakt", ["", "kontakt"]), "kontakt-2");
    assert.equal(pathFor("Skapa", [""]), "skapa-sida");
    assert.equal(pathFor("Åtta på öster", [""]), "atta-pa-oster");
    assert.equal(pathFor("!!!", [""]), "sida");
  });

  it("kräver startsidan först och unika adresser", () => {
    const start = defaultContent().pages[0];
    assert.ok(start);
    const about = newPage("Om oss", [""]);
    assert.equal(shopContentSchema.safeParse(withPages(about, start)).success, false);
    assert.equal(shopContentSchema.safeParse(withPages(start, about, { ...about, id: "pother" })).success, false);
    assert.equal(shopContentSchema.safeParse(withPages(start, { ...about, path: "skapa" })).success, false);
  });

  it("stoppar farliga länkar och tar bort styrtecken", () => {
    const start = defaultContent().pages[0];
    assert.ok(start);
    const bad = { ...start, blocks: [{ ...newBlock("banner"), href: "javascript:alert(1)" }] };
    assert.equal(shopContentSchema.safeParse(withPages(bad)).success, false);
    const contact = { ...newBlock("contact"), text: "Rad ett\r\nRad\u0007 två" };
    const ok = shopContentSchema.parse(withPages({ ...start, blocks: [contact] }));
    const parsed = ok.pages[0]?.blocks[0];
    assert.equal(parsed?.kind === "contact" ? parsed.text : "", "Rad ett\nRad två");
  });

  it("startsidan är densamma vad som än sparats", () => {
    const start = defaultContent().pages[0];
    assert.ok(start);
    const tampered = withPages({ ...start, label: "Vår", blocks: [newBlock("banner")] }, newPage("Om oss", [""]));
    const locked = lockStartPage(tampered);
    assert.deepEqual(locked.pages[0], start);
    assert.equal(locked.pages[1]?.label, "Om oss");
    assert.deepEqual(contentOrDefault(tampered).pages[0], start);
  });

  it("nya sidor börjar med en sidrubrik", () => {
    const page = newPage("Kontakt", [""]);
    assert.equal(page.blocks[0]?.kind, "header");
    assert.equal(page.blocks[0]?.kind === "header" ? page.blocks[0].title : "", "Kontakt");
  });

  it("känner igen YouTube- och Vimeo-länkar, men inget annat", () => {
    assert.equal(videoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")?.src, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
    assert.equal(videoEmbed("https://youtu.be/dQw4w9WgXcQ")?.id, "dQw4w9WgXcQ");
    assert.equal(videoEmbed("https://youtube.com/shorts/dQw4w9WgXcQ")?.provider, "youtube");
    assert.equal(videoEmbed("https://vimeo.com/76979871")?.src, "https://player.vimeo.com/video/76979871?dnt=1");
    assert.equal(videoEmbed("https://evil.example/watch?v=dQw4w9WgXcQ"), null);
    assert.equal(videoEmbed("javascript:alert(1)"), null);
    assert.equal(videoEmbed("inte en länk"), null);
  });

  it("kartan söker på adressen och tål utropstecken", () => {
    assert.equal(mapEmbedUrl("  "), null);
    assert.equal(mapEmbedUrl("Storgatan 1, Gävle"), "https://www.google.com/maps/embed?origin=mfe&pb=!1m3!2m1!1sStorgatan+1%2C+G%C3%A4vle!6i15");
    assert.ok(!mapEmbedUrl("Hej! Gatan 2")?.includes("Hej!"));
  });

  it("ger standardsidan för trasigt eller gammalt innehåll", () => {
    assert.deepEqual(contentOrDefault({ version: 1, blocks: [] }), defaultContent());
    assert.deepEqual(contentOrDefault(null), defaultContent());
  });

  it("hittar butikens bilder och döljer utgångna kampanjer", () => {
    const start = defaultContent().pages[0];
    assert.ok(start);
    const gallery = { kind: "gallery" as const, id: "galleri", title: "", images: ["bildbildbild01", "bildbildbild02"] };
    const imageText = { ...newBlock("imageText"), imageId: "bildbildbild01" };
    const about = { ...newPage("Om oss", [""]), blocks: [imageText] };
    const content = shopContentSchema.parse(withPages({ ...start, blocks: [gallery] }, about));
    assert.deepEqual(imagesIn(content), ["bildbildbild01", "bildbildbild02"]);
    const banner = { kind: "banner" as const, id: "banner", text: "Rea", href: "", until: "2026-10-31" };
    assert.equal(isBannerActive(banner, "2026-10-31"), true);
    assert.equal(isBannerActive(banner, "2026-11-01"), false);
  });
});
