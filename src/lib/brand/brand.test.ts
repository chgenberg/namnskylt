import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { colorDistance, isBrandColor, parseCssColor } from "./color";
import { isPublicAddress } from "./ip";
import { matchColorCombo, matchFont } from "./match";
import { brandColors, fontFamilies } from "./parse-css";
import { parsePage } from "./parse-html";
import { parsePublicUrl } from "./url";

describe("isPublicAddress", () => {
  it("stoppar privata, lokala och reserverade adresser", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "::",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "64:ff9b::a00:1",
      "2001:db8::1",
    ]) {
      assert.equal(isPublicAddress(ip), false, ip);
    }
  });

  it("släpper publika adresser", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "2a00:1450:4001:80b::200e", "::ffff:8.8.8.8"]) {
      assert.equal(isPublicAddress(ip), true, ip);
    }
  });

  it("släpper inte skräp", () => {
    assert.equal(isPublicAddress("exempel.se"), false);
  });
});

describe("parsePublicUrl", () => {
  it("lägger till https och godtar vanliga adresser", () => {
    assert.equal(parsePublicUrl("exempel.se").href, "https://exempel.se/");
    assert.equal(parsePublicUrl("http://www.exempel.se/om-oss").hostname, "www.exempel.se");
  });

  it("vägrar allt som kan nå interna tjänster", () => {
    for (const raw of [
      "http://localhost",
      "http://127.0.0.1",
      "http://[::1]/",
      "http://2130706433/",
      "http://intranet/",
      "http://printer.local",
      "https://exempel.se:8080",
      "https://user:pass@exempel.se",
      "file:///etc/passwd",
      "ftp://exempel.se",
      "javascript:alert(1)",
    ]) {
      assert.throws(() => parsePublicUrl(raw), raw);
    }
  });
});

describe("parsePage", () => {
  const html = `<!doctype html><html><head>
    <title>Tandvården Kungsholmen | Din tandläkare</title>
    <meta name="description" content="Modern tandvård i Stockholm">
    <meta name="theme-color" content="#0a7c86">
    <link rel="stylesheet" href="/css/site.css">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700&family=Inter">
    <link rel="icon" href="/favicon.ico">
    <script type="application/ld+json">{"@type":"Organization","logo":{"@type":"ImageObject","url":"/img/ld-logo.png"}}</script>
    <style>body { font-family: "Inter", sans-serif; }</style>
  </head><body>
    <header><a href="/"><img class="site-logo" src="/img/logo.svg" alt="Tandvården"></a></header>
    <main><h1>Välkommen</h1><p>Vi tar hand om dina tänder &amp; ditt leende.</p></main>
    <footer><img src="/img/klarna-logo.png" alt="Klarna"></footer>
  </body></html>`;
  const signals = parsePage(html, "https://tandvarden.se/start");

  it("hittar loggan i sidhuvudet först och hoppar över betalloggor", () => {
    const urls = signals.logos.flatMap((l) => (l.kind === "url" ? [l.url] : []));
    assert.equal(urls[0], "https://tandvarden.se/img/logo.svg");
    assert.ok(urls.includes("https://tandvarden.se/img/ld-logo.png"));
    assert.ok(!urls.includes("https://tandvarden.se/img/klarna-logo.png"));
  });

  it("läser metadata, stilmallar, Google Fonts och text", () => {
    assert.equal(signals.title, "Tandvården Kungsholmen | Din tandläkare");
    assert.equal(signals.themeColor, "#0a7c86");
    assert.deepEqual(signals.stylesheets, ["https://tandvarden.se/css/site.css"]);
    assert.deepEqual(signals.googleFonts, ["Barlow Condensed", "Inter"]);
    assert.match(signals.text, /dina tänder & ditt leende/);
    assert.doesNotMatch(signals.text, /font-family/);
  });

  it("tar en inbäddad svg-logga", () => {
    const path = `<path d="${"M0 0L10 10".repeat(30)}"/>`;
    const page = parsePage(`<header><a class="logo" href="/"><svg viewBox="0 0 10 10">${path}</svg></a></header>`, "https://a.se");
    assert.equal(page.logos[0]?.kind, "svg");
  });
});

describe("fontFamilies", () => {
  it("väger body och rubriker tyngst och hoppar över ikontypsnitt", () => {
    const css = `.x{font-family:Georgia,serif}.y{font-family:"Font Awesome 6 Free"}body{font-family:'Montserrat',sans-serif}h1{font-family:Montserrat}`;
    assert.deepEqual(fontFamilies(css), ["Montserrat", "Georgia"]);
  });

  it("läser typsnittsvariabler men inte storleksvariabler", () => {
    const css = `:root{--font-size-sm:0.875rem;--font-weight:normal;--font-family-base:var(--x, "IBM Plex Sans"), sans-serif}`;
    assert.deepEqual(fontFamilies(css), ["IBM Plex Sans"]);
  });
});

describe("brandColors", () => {
  it("rankar varumärkesvariabler och theme-color, utan neutrala färger", () => {
    const css = `:root{--brand-primary:#0a2f6b;--text:#222}body{color:#333;background:#fff}.btn{background:#e4002b}p{color:#e4002b}`;
    const colors = brandColors(css, null);
    assert.equal(colors[0], "#0a2f6b");
    assert.ok(colors.includes("#e4002b"));
    assert.ok(!colors.includes("#ffffff") && !colors.includes("#222222"));
  });

  it("slår ihop nästan likadana färger", () => {
    assert.equal(brandColors(`a{color:#0057b8}b{color:#0058b9}`).length, 1);
  });
});

describe("color", () => {
  it("tolkar hex, rgb och hsl", () => {
    assert.deepEqual(parseCssColor("#0af"), [0, 170, 255]);
    assert.deepEqual(parseCssColor("rgb(10, 20, 30)"), [10, 20, 30]);
    assert.deepEqual(parseCssColor("hsl(0, 100%, 50%)"), [255, 0, 0]);
    assert.equal(parseCssColor("var(--x)"), null);
  });

  it("räknar grått som neutralt", () => {
    assert.equal(isBrandColor([128, 128, 128]), false);
    assert.equal(isBrandColor([0, 87, 184]), true);
    assert.ok(colorDistance([0, 0, 0], [255, 255, 255]) > 90);
  });
});

describe("matchFont", () => {
  it("ger Arial Narrow åt smala typsnitt och Arial åt resten", () => {
    assert.equal(matchFont(["Barlow Condensed"]).fontId, "arial-narrow");
    assert.equal(matchFont(["Oswald", "Inter"]).fontId, "arial-narrow");
    assert.equal(matchFont(["Inter"]).fontId, "arial");
    assert.deepEqual(matchFont([]), { fontId: "arial", sourceFamily: null, widthRatio: null });
  });
});

describe("matchColorCombo", () => {
  it("väljer den kombination som bär varumärkets färg", () => {
    assert.equal(matchColorCombo(["#0b2a5b"], "plastic-2-layer"), "darkblue-white");
    assert.equal(matchColorCombo(["#d71920"], "plastic-2-layer"), "red-white");
    assert.equal(matchColorCombo(["#00693e"], "plastic-2-layer"), "darkgreen-white");
    assert.equal(matchColorCombo(["#0a5cc2"], "plastic-2-layer"), "blue-white");
  });

  it("väljer inget när inget liknar", () => {
    assert.equal(matchColorCombo(["#ff66cc"], "plastic-2-layer"), null);
    assert.equal(matchColorCombo([], "plastic-2-layer"), null);
  });
});
