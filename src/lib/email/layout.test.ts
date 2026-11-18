import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  actionsRow,
  brandRow,
  emailDocument,
  END_ROW,
  factsRow,
  footerLines,
  headRow,
  nameBrand,
  noteLink,
  pictureRow,
  quoteRow,
  siteBrand,
  type EmailBrand,
} from "./layout";

const SITE = siteBrand("https://www.namnskylt.com/");

describe("mejlmallens avsändare", () => {
  test("namnskylt.com har sajtens logga som PNG och bläcksvart knapp", () => {
    assert.deepEqual(SITE, { name: "namnskylt.com", logo: { url: "https://www.namnskylt.com/logo-namnskylt-mejl.png", width: 168, height: 32 }, accent: "#0a0a0b" });
    assert.match(brandRow(SITE), /<img class="paper plate" src="https:\/\/www\.namnskylt\.com\/logo-namnskylt-mejl\.png" width="168" height="32" alt="namnskylt\.com"/);
  });

  test("en säljare utan logga står med sitt namn, och namnet kan aldrig bli html", () => {
    const row = brandRow(nameBrand('Profil & <Co> "AB"'));
    assert.match(row, /Profil &amp; &lt;Co&gt; &quot;AB&quot;/);
    assert.doesNotMatch(row, /<img|<Co>/);
  });

  test("loggans adress och mått kan aldrig bryta sig ur taggen", () => {
    const brand = { name: "X", logo: { url: 'https://x.se/a.png" onerror="alert(1)', width: "40\" onload=\"x" as unknown as number, height: 20 }, accent: "#0a0a0b" };
    const row = brandRow(brand);
    assert.doesNotMatch(row, /" onerror="|onload="x/);
    assert.match(row, /width="1" height="20"/);
  });
});

describe("mejlmallens knappar", () => {
  const actions = [
    { href: "https://www.namnskylt.com/offert/abc?svar=godkann", label: "Godkänn offerten" },
    { href: "https://www.namnskylt.com/offert/abc?svar=neka", label: "Neka offerten", kind: "secondary" as const },
  ];

  test("den första är fylld i säljarens färg med läsbar text, den andra har bara en kant", () => {
    const dark = actionsRow(actions, nameBrand("Säljare", "#7A1F2B"));
    assert.match(dark, /class="btn" style="display:inline-block;background:#7a1f2b;color:#ffffff;border:1px solid #7a1f2b;/);
    assert.match(dark, /class="btn btn-ghost" style="display:inline-block;background:#ffffff;color:#0a0a0b;/);
    assert.match(actionsRow(actions, nameBrand("Säljare", "#ffe680")), /background:#ffe680;color:#0a0a0b;/);
  });

  test("bara den bläcksvarta knappen vänds i mörkt läge", () => {
    assert.match(actionsRow(actions, SITE), /class="btn btn-ink"/);
    assert.doesNotMatch(actionsRow(actions, nameBrand("Säljare", "#7a1f2b")), /btn-ink/);
  });

  test("en färg som inte är en hexkod kommer aldrig in i mejlets stil", () => {
    for (const accent of ["red;background:url(https://ond.se/x)", '#fff" onclick="x', "#12345", ""]) {
      const brand: EmailBrand = { name: "Säljare", logo: null, accent };
      const html = actionsRow(actions, brand);
      assert.match(html, /background:#0a0a0b;color:#ffffff;/, accent);
      assert.doesNotMatch(html, /ond\.se|onclick/, accent);
      assert.equal(nameBrand("Säljare", accent).accent, "#0a0a0b");
    }
  });

  test("länkarna står hela, med och-tecken som html", () => {
    const html = actionsRow([{ href: "https://x.se/a?b=1&c=2", label: "Öppna <nu>" }], SITE);
    assert.equal(html.split('href="https://x.se/a?b=1&amp;c=2"').length - 1, 2);
    assert.match(html, /Öppna &lt;nu&gt;/);
    assert.match(html, /v:roundrect/);
  });
});

describe("mejlmallens rader", () => {
  test("text utifrån kan aldrig bli html", () => {
    const evil = '<script>alert("x")</script>';
    for (const html of [
      headRow({ eyebrow: evil, title: evil, lead: evil }),
      quoteRow(evil),
      factsRow([{ label: evil, value: evil, strong: true }]),
      pictureRow({ url: "https://x.se/a.png", width: 528, height: 264, alt: evil, caption: evil, href: `https://x.se/?q=${evil}` }),
      noteLink(`https://x.se/?q=${evil}`, evil),
      ...footerLines([evil]),
    ]) {
      assert.doesNotMatch(html, /<script>/);
      assert.match(html, /&lt;script&gt;/);
    }
  });

  test("summans rad är större och i fetstil", () => {
    const html = factsRow([
      { label: "Antal", value: "12 skyltar" },
      { label: "Att betala", value: "2 569 kr", strong: true },
    ]);
    assert.match(html, /font-size:15px;[^"]*">12 skyltar/);
    assert.match(html, /font-size:17px;[^"]*font-weight:bold;">2 569 kr/);
  });

  test("säljarens uppgifter under kortet blir en rad i sidfoten", () => {
    assert.deepEqual(footerLines(["Exempel AB · Org.nr 556123-4567", "Storgatan 1,\n111 22 Stockholm"]), ["Exempel AB · Org.nr 556123-4567<br>Storgatan 1, 111 22 Stockholm"]);
    assert.deepEqual(footerLines([]), []);
  });

  test("hela mejlet är ett dokument med dold förhandstext, och håller sig under Gmails gräns", () => {
    const html = emailDocument({
      title: "Offert OF-1",
      preheader: "Här är offerten.",
      rows: [brandRow(SITE), headRow({ eyebrow: "Offert · OF-1", title: "Din offert" }), END_ROW],
      footer: footerLines(["Exempel AB"]),
    });
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /<title>Offert OF-1<\/title>/);
    assert.match(html, /display:none;[^"]*">Här är offerten\./);
    assert.ok(Buffer.byteLength(html) < 40 * 1024);
  });
});
