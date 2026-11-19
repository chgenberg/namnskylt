import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { blankLike, chooseLogo, flagLike, logoOptionOrder, previewJpeg } from "./logo-image";
import { isFamilyAlias, matchRenderedFont, renderedFamilies, type RenderedFontSample } from "./match";
import { primaryFamily, rankColors } from "./parse-css";
import { allowBrowserRequest, isPublicHost } from "./request-guard";
import { unoptimizedImageUrl, withWww } from "./url";

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

describe("unoptimizedImageUrl", () => {
  it("pekar ut originalet bakom bildtjänsten i Next.js och hos Vercel", () => {
    assert.equal(unoptimizedImageUrl("https://www.example.se/_next/image?url=%2Flogo.webp&w=96&q=75"), "https://www.example.se/logo.webp");
    assert.equal(
      unoptimizedImageUrl("https://example.se/_next/image?url=https%3A%2F%2Fcdn.example.se%2Fa%2Flogo.png&w=256&q=75"),
      "https://cdn.example.se/a/logo.png",
    );
    assert.equal(unoptimizedImageUrl("https://example.se/_vercel/image?url=%2Fbilder%2Flogo.png&w=128&q=80"), "https://example.se/bilder/logo.png");
  });

  it("lämnar vanliga adresser, och det som inte är en bild på nätet", () => {
    assert.equal(unoptimizedImageUrl("https://example.se/logo.png?url=%2Fannan.png"), null);
    assert.equal(unoptimizedImageUrl("https://example.se/_next/image?w=96&q=75"), null);
    assert.equal(unoptimizedImageUrl("https://example.se/_next/image?url=javascript%3Aalert(1)"), null);
    assert.equal(unoptimizedImageUrl("https://example.se/_next/image?url=data%3Aimage%2Fpng%3Bbase64%2CAAAA"), null);
    assert.equal(unoptimizedImageUrl("inte en adress"), null);
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

describe("blankLike", () => {
  const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
  const block = (width: number, height: number, background: string, left: number, top: number) => ({
    input: { create: { width, height, channels: 4 as const, background } },
    left,
    top,
  });

  it("en svart ruta med knappt synlig logga är ingen logga", async () => {
    // Så blir en genomskinlig svart logga när en bildtjänst gör om den till JPEG: svart botten, och kanter i mörkgrått.
    const box = await sharp({ create: { width: 96, height: 96, channels: 3, background: "#000000" } })
      .composite([block(40, 3, "#2a2a2a", 28, 40), block(3, 30, "#222222", 30, 30), block(30, 2, "#333333", 33, 70)])
      .jpeg({ quality: 75 })
      .toBuffer();
    assert.equal(await blankLike(box), true);
    const white = await sharp({ create: { width: 200, height: 80, channels: 3, background: "#FFFFFF" } }).png().toBuffer();
    assert.equal(await blankLike(white), true);
  });

  it("en logga som syns mot sin botten är kvar, också en med tunna linjer", async () => {
    const onWhite = await sharp({ create: { width: 260, height: 80, channels: 3, background: "#FFFFFF" } })
      .composite(Array.from({ length: 6 }, (_, i) => block(18, 50, "#1D1D1F", 10 + i * 40, 15)))
      .png()
      .toBuffer();
    assert.equal(await blankLike(onWhite), false);
    const hairline = await sharp({ create: { width: 1200, height: 400, channels: 3, background: "#FFFFFF" } })
      .composite([block(1000, 2, "#000000", 100, 199), block(2, 300, "#000000", 599, 50)])
      .png()
      .toBuffer();
    assert.equal(await blankLike(hairline), false);
  });

  it("en enfärgad logga på genomskinlig botten är aldrig tom", async () => {
    for (const ink of ["#000000", "#FFFFFF"]) {
      const logo = await sharp({ create: { width: 260, height: 80, channels: 4, background: TRANSPARENT } })
        .composite(Array.from({ length: 6 }, (_, i) => block(18, 50, ink, 10 + i * 40, 15)))
        .png()
        .toBuffer();
      assert.equal(await blankLike(logo), false, ink);
    }
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
