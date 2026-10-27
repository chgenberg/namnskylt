import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { chooseLogo, flagLike, logoOptionOrder, previewJpeg } from "./logo-image";
import { isFamilyAlias, matchRenderedFont, renderedFamilies, type RenderedFontSample } from "./match";
import { primaryFamily, rankColors } from "./parse-css";
import { allowBrowserRequest, isPublicHost } from "./request-guard";
import { withWww } from "./url";

const sample = (stack: string, widthRatio: number, roles: Partial<RenderedFontSample> = {}): RenderedFontSample => ({
  stack,
  widthRatio,
  heading: 0,
  nav: 0,
  button: 0,
  body: 0,
  ...roles,
});

describe("allowBrowserRequest", () => {
  const publicDns = async () => ["93.184.216.34"];
  const privateDns = async () => ["10.0.0.5"];

  it("släpper igenom data- och blob-adresser som sidan själv skapat", async () => {
    assert.equal(await allowBrowserRequest("data:image/png;base64,AAAA", "image"), true);
    assert.equal(await allowBrowserRequest("blob:https://foretaget.se/123", "image"), true);
  });

  it("stoppar interna adresser, andra protokoll och portar", async () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://localhost/",
      "file:///etc/passwd",
      "ftp://foretaget.se/",
      "https://foretaget.se:8443/",
      "https://user:pass@foretaget.se/",
    ]) {
      assert.equal(await allowBrowserRequest(url, "document", publicDns), false, url);
    }
  });

  it("stoppar en domän som pekar internt", async () => {
    assert.equal(await allowBrowserRequest("https://rebind-intern.example/", "script", privateDns), false);
    assert.equal(await allowBrowserRequest("https://publik-sajt.example/app.js", "script", publicDns), true);
  });

  it("hoppar över video och strömmar", async () => {
    assert.equal(await allowBrowserRequest("https://publik-media.example/film.mp4", "media", publicDns), false);
  });

  it("räknar en värd som intern om någon av dess adresser är det", async () => {
    assert.equal(await isPublicHost("blandad.example", async () => ["93.184.216.34", "192.168.1.2"]), false);
    assert.equal(await isPublicHost("trasig-dns.example", async () => Promise.reject(new Error("NXDOMAIN"))), false);
  });
});

describe("withWww", () => {
  it("lägger till www på en ren domän", () => {
    assert.equal(withWww(new URL("https://scandichotels.se/"))?.href, "https://www.scandichotels.se/");
  });

  it("lämnar www och underdomäner", () => {
    assert.equal(withWww(new URL("https://www.ica.se/")), null);
    assert.equal(withWww(new URL("https://butik.ica.se/")), null);
  });
});

describe("matchRenderedFont", () => {
  it("väljer Arial Narrow när rubrikerna ritas smalt", () => {
    const font = matchRenderedFont(
      [sample('"ICA Rubrik", sans-serif', 0.86, { heading: 6 }), sample('"ICA Text", sans-serif', 1.02, { body: 8 })],
      primaryFamily,
    );
    assert.deepEqual(font, { fontId: "arial-narrow", sourceFamily: "ICA Rubrik", widthRatio: 0.86 });
  });

  it("väljer Arial för normalbreda typsnitt även om brödtexten är smal", () => {
    const font = matchRenderedFont(
      [sample('"Brandon Text", sans-serif', 0.95, { heading: 5, nav: 4 }), sample("Oswald", 0.78, { body: 3 })],
      primaryFamily,
    );
    assert.equal(font?.fontId, "arial");
    assert.equal(font?.sourceFamily, "Brandon Text");
  });

  it("väger ihop samma familj i flera vikter", () => {
    const families = renderedFamilies(
      [sample('"Inter", sans-serif', 1.0, { heading: 2 }), sample('"Inter", sans-serif', 1.1, { heading: 2 })],
      primaryFamily,
    );
    assert.equal(families.length, 1);
    assert.equal(families[0]?.widthRatio, 1.05);
  });

  it("visar inte interna aliasnamn som typsnitt", () => {
    assert.equal(matchRenderedFont([sample("regular, sans-serif", 0.8, { heading: 3 })], primaryFamily)?.sourceFamily, null);
    assert.equal(isFamilyAlias("Headline"), true);
    assert.equal(isFamilyAlias("Open Sans"), false);
  });

  it("ger null utan prov", () => {
    assert.equal(matchRenderedFont([], primaryFamily), null);
  });
});

describe("rankColors", () => {
  it("sorterar efter vikt och hoppar över neutrala färger och standardlänkar", () => {
    const colors = rankColors([
      { color: "rgb(0, 0, 238)", weight: 50 },
      { color: "rgb(255, 255, 255)", weight: 40 },
      { color: "rgb(0, 84, 153)", weight: 4 },
      { color: "#e30613", weight: 10 },
    ]);
    assert.deepEqual(colors, ["#e30613", "#005499"]);
  });
});

describe("chooseLogo", () => {
  it("litar på modellens val, även när det liknar en flagga", () => {
    assert.equal(chooseLogo(1, [false, true]), 1);
  });

  it("tar ingen logga när modellen säger att ingen kandidat stämmer", () => {
    assert.equal(chooseLogo(-1, [false, false]), null);
    assert.equal(chooseLogo(5, [false]), null);
  });

  it("utan modell: den bäst placerade som inte ser ut som en flagga", () => {
    assert.equal(chooseLogo(null, [true, false, false]), 1);
    assert.equal(chooseLogo(null, [true]), null);
  });
});

describe("logoOptionOrder", () => {
  it("med modellens svar: den valda först, sedan bara dess alternativ", () => {
    assert.deepEqual(logoOptionOrder(2, [0], [false, false, false, false]), [2, 0]);
    assert.deepEqual(logoOptionOrder(0, [], [false, false, false]), [0]);
  });

  it("rensar index utanför listan och dubbletter", () => {
    assert.deepEqual(logoOptionOrder(1, [1, 7, -1, 0, 0], [false, false]), [1, 0]);
    assert.deepEqual(logoOptionOrder(9, null, [false]), [0]);
  });

  it("utan modell: alla som inte liknar flaggor, begränsat antal", () => {
    assert.deepEqual(logoOptionOrder(null, null, [true, false, false]), [1, 2]);
    assert.deepEqual(logoOptionOrder(1, null, [false, false, false, false, false], 3), [1, 0, 2]);
  });
});

describe("flagLike", () => {
  it("känner igen en svensk flagga", async () => {
    const flag = await sharp({ create: { width: 160, height: 100, channels: 4, background: "#006AA7" } })
      .composite([
        { input: { create: { width: 20, height: 100, channels: 4, background: "#FECC02" } }, left: 50, top: 0 },
        { input: { create: { width: 160, height: 20, channels: 4, background: "#FECC02" } }, left: 0, top: 40 },
      ])
      .png()
      .toBuffer();
    assert.equal(await flagLike(flag), true);
  });

  it("släpper en ordbild på transparent bakgrund", async () => {
    const letters = Array.from({ length: 6 }, (_, i) => ({
      input: { create: { width: 18, height: 50, channels: 4 as const, background: "#1D1D1F" } },
      left: 10 + i * 40,
      top: 15,
    }));
    const wordmark = await sharp({ create: { width: 260, height: 80, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(letters)
      .png()
      .toBuffer();
    assert.equal(await flagLike(wordmark), false);
    assert.match(await previewJpeg(wordmark), /^data:image\/jpeg;base64,/);
  });
});
