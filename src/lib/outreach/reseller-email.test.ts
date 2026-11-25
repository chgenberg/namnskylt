import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { COPY, forbiddenIn, FORBIDDEN_PHRASES, genitive, localeFor, type EmailStep } from "./copy";
import { RELATION_SEGMENTS } from "./model";
import { buildResellerEmail, type ResellerEmailInput } from "./reseller-email";

const SITE = "https://namnskylt.com";
const FILM = `${SITE}/demo?k=v1.l.abc.123.sig`;
const UNSUBSCRIBE = `${SITE}/avregistrera/v1.u.abc.456.sig`;

const input: ResellerEmailInput = {
  step: 1,
  segment: "activated-known",
  locale: "sv",
  contactName: "Anna Lindqvist",
  company: "Profil & <Co>",
  customerSinceYear: 2019,
  filmUrl: FILM,
  unsubscribeUrl: UNSUBSCRIBE,
  privacyUrl: `${SITE}/integritet`,
  sender: { legalName: "Skylt & Gravyrteknik i Sverige AB", orgNumber: "556464-2261", address: "Gatan 1\n111 22 Göteborg" },
  signature: { name: "Gänget på Namnskylt", email: "hej@namnskylt.com" },
};

function build(overrides: Partial<ResellerEmailInput> = {}) {
  const result = buildResellerEmail({ ...input, ...overrides });
  if (!result.ok) throw new Error(`saknas: ${result.missing.join(", ")}`);
  return result.email;
}

const visibleText = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[#a-z0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Det som står mellan hälsningen och avsändarens sidfot — det mottagaren faktiskt läser, utan adresser. */
const bodyText = (text: string) => (text.split("\n—\n")[0] ?? "").replace(/https?:\/\/\S+/g, "");

const hrefsOf = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => (m[1] ?? "").replace(/&amp;/g, "&"));

describe("återförsäljarmejlet", () => {
  test("escapar företagsnamnet", () => {
    const email = build();
    assert.match(email.html, /Profil &amp; &lt;Co&gt;/);
    assert.doesNotMatch(email.html, /<Co>/);
    assert.equal(email.subject, "Anna, namnskyltar till era kunder?");
  });

  test("är kort: under 90 ord att läsa före sidfoten", () => {
    for (const step of [1, 2] as EmailStep[]) {
      const words = bodyText(build({ step }).text).split(/\s+/).filter(Boolean);
      assert.ok(words.length < 90, `steg ${step}: ${words.length} ord`);
    }
  });

  test("säger vad som saknas i stället för att bygga ett trasigt mejl", () => {
    const result = buildResellerEmail({
      ...input,
      company: " ",
      filmUrl: "",
      unsubscribeUrl: "",
      sender: { legalName: "", orgNumber: "", address: "" },
    });
    assert.equal(result.ok, false);
    assert.deepEqual(!result.ok && result.missing, ["företag", "filmlänk", "avregistrering", "avsändare"]);
  });

  test("norska bygger inget mejl förrän texterna finns", () => {
    const result = buildResellerEmail({ ...input, locale: "nb" });
    assert.deepEqual(!result.ok && result.missing, ["språk"]);
    assert.equal(localeFor("no"), "nb");
    assert.equal(localeFor("se"), "sv");
  });

  test("en enda knapp, och den ringer Pär", () => {
    for (const step of [1, 2] as EmailStep[]) {
      const { html, text } = build({ step });
      // Knappen står två gånger i koden: en gång för Outlook (VML) och en gång för alla andra.
      const buttons = [...html.matchAll(/class="btn"/g)];
      assert.equal(buttons.length, 1, `steg ${step}`);
      assert.match(html, /<a href="tel:\+46761884800" class="btn"/);
      assert.match(visibleText(html), /Ring Pär: 076-188 48 00/);
      assert.match(visibleText(html), /Pär Philipson från Merchin, som utvecklat plattformen tillsammans med oss, visar dig hur det fungerar på fem minuter\./);
      assert.match(text, /076-188 48 00/);
    }
  });

  test("toppbilden: överst, länkar till filmen och märks som AI-genererad", () => {
    assert.doesNotMatch(build().html, /<img/);
    const { html } = build({ heroImage: { url: `${SITE}/mejl/aterforsaljare-kontor.jpg`, width: 1056, height: 894 } });
    assert.equal([...html.matchAll(/<img/g)].length, 1);
    assert.match(html, /<a href="https:\/\/namnskylt\.com\/demo\?k=v1\.l\.abc\.123\.sig"[^>]*><img src="https:\/\/namnskylt\.com\/mejl\/aterforsaljare-kontor\.jpg" width="528" alt="Pär Philipson med en namnskylt från namnskylt\.com"/);
    assert.match(visibleText(html), /Bilden är AI-genererad\. Skylten finns på riktigt\./);
    assert.ok(html.indexOf("<img") < html.indexOf("Hej Anna!"), "bilden står före hälsningen");
  });

  test("länkarna: filmen, ringa, avregistrering och integritet, inget annat", () => {
    const hrefs = hrefsOf(build().html);
    const web = hrefs.filter((href) => !href.startsWith("tel:"));
    const paths = new Set(
      web.map((href) => {
        const url = new URL(href);
        assert.equal(url.hostname, "namnskylt.com", href);
        return `${url.pathname}${url.search}`;
      }),
    );
    assert.deepEqual([...paths].sort(), ["/avregistrera/v1.u.abc.456.sig", "/demo?k=v1.l.abc.123.sig", "/integritet"]);
    assert.deepEqual([...new Set(hrefs.filter((href) => href.startsWith("tel:")))], ["tel:+46761884800"]);
  });

  test("texten har filmen och avregistreringen", () => {
    const email = build();
    assert.ok(email.text.includes(FILM));
    assert.ok(email.text.includes(UNSUBSCRIBE));
  });

  test("sidfoten har Skylt & Gravyrteknik, relationen och integritetssidan", () => {
    const { html, text } = build();
    assert.match(html, /Org\.nr 556464-2261/);
    assert.match(html, /Gatan 1, 111 22 Göteborg/);
    assert.match(html, /kund hos Skylt &amp; Gravyrteknik sedan 2019/);
    assert.match(text, /Avregistrera: https:\/\/namnskylt\.com\/avregistrera\//);
  });

  test("signerat av gänget med hej@namnskylt.com", () => {
    const text = visibleText(build().html);
    assert.match(text, /Hälsningar, Gänget på Namnskylt hej@namnskylt\.com/);
  });

  test("One-Click-avregistrering i headrarna", () => {
    const { headers } = build();
    assert.equal(headers["List-Unsubscribe"], `<${UNSUBSCRIBE}>`);
    assert.equal(headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  });

  test("håller sig under 40 kB, med Outlooks knapp och mörkt läge", () => {
    const { html } = build();
    assert.ok(Buffer.byteLength(html) < 40 * 1024);
    assert.match(html, /v:roundrect/);
    assert.match(html, /prefers-color-scheme:dark/);
  });

  test("utan riktigt namn blir hälsningen bara Hej!", () => {
    const { html, subject } = build({ contactName: null });
    assert.match(html, />Hej!</);
    assert.equal(subject, "Namnskyltar till era kunder?");
    assert.equal(build({ contactName: null, step: 2 }).subject, "Hann ni se filmen?");
  });
});

describe("förbjudna formuleringar", () => {
  test("inget segment eller steg innehåller något förbjudet", () => {
    for (const segment of RELATION_SEGMENTS) {
      for (const step of [1, 2] as EmailStep[]) {
        const email = build({ segment, step });
        const all = `${email.subject}\n${email.preheader}\n${visibleText(email.html)}\n${email.text}`;
        assert.deepEqual(forbiddenIn(all), [], `${segment} ${step}`);
      }
    }
  });

  test("spärren hittar det den ska", () => {
    assert.deepEqual(forbiddenIn("Från 49 kr styck med 30 % marginal"), ["kronbelopp", "procent", "marginal"]);
    assert.deepEqual(forbiddenIn("Mässing och akryl, klart på en dag"), ["på en dag", "mässing", "akryl"]);
    assert.deepEqual(forbiddenIn("Helt gratis"), ["gratis"]);
    assert.ok(FORBIDDEN_PHRASES.length >= 10);
  });

  test("genitiv utan dubbelt s, och med kolon efter en förkortning", () => {
    assert.equal(genitive("Nordtryck"), "Nordtrycks");
    assert.equal(genitive("Ljus & Reklams"), "Ljus & Reklams");
    assert.equal(genitive("Profilab AB"), "Profilab AB:s");
    assert.equal(genitive("Tryck 24"), "Tryck 24:s");
    assert.equal(genitive("Ab Reklam"), "Ab Reklams");
    assert.equal(COPY.sv?.subject(2, { firstName: null, company: "Profilab", segment: "inactive-known" }), "Hann ni se filmen?");
  });
});
