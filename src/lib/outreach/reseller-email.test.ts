import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { COPY, forbiddenIn, FORBIDDEN_PHRASES, genitive, localeFor, type EmailStep } from "./copy";
import { RELATION_SEGMENTS } from "./model";
import { buildResellerEmail, type ResellerEmailInput } from "./reseller-email";

const SITE = "https://namnskylt.com";
const LANDING = `${SITE}/for/v1.l.abc.123.sig`;
const UNSUBSCRIBE = `${SITE}/avregistrera/v1.u.abc.456.sig`;

const input: ResellerEmailInput = {
  step: 1,
  segment: "activated-known",
  locale: "sv",
  contactName: "Anna Lindqvist",
  company: "Profil & <Co>",
  customerSinceYear: 2019,
  landingUrl: LANDING,
  unsubscribeUrl: UNSUBSCRIBE,
  privacyUrl: `${SITE}/integritet`,
  image: {
    url: `${SITE}/utskick/bild/persona-aaaaaaaaaaaaaaaa.jpg`,
    width: 600,
    height: 750,
    kind: "persona",
    badgeCaption: "metall, borstat guld, 75 × 25 mm",
    hasLogo: true,
  },
  sender: { legalName: "Namnskylt AB", orgNumber: "559000-0000", address: "Gatan 1\n111 22 Stockholm" },
  signature: { name: "Christopher Genberg", title: "Grundare", phone: "070-123 45 67", email: "christopher@namnskylt.com" },
};

function build(overrides: Partial<ResellerEmailInput> = {}) {
  const result = buildResellerEmail({ ...input, ...overrides });
  if (!result.ok) throw new Error(`saknas: ${result.missing.join(", ")}`);
  return result.email;
}

const withImage = (patch: Partial<NonNullable<ResellerEmailInput["image"]>>) =>
  input.image && { ...input.image, ...patch };

const visibleText = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[#a-z0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Det som står mellan hälsningen och avsändarens sidfot — det mottagaren faktiskt läser. */
const bodyText = (html: string) => visibleText(html).split("Namnskylt AB ·")[0] ?? "";

describe("återförsäljarmejlet", () => {
  test("escapar företagsnamnet", () => {
    const email = build();
    assert.match(email.html, /Profil &amp; &lt;Co&gt;/);
    assert.doesNotMatch(email.html, /<Co>/);
    assert.equal(email.subject, "Anna, känner du igen loggan?");
  });

  test("är kort: under 90 ord att läsa före sidfoten", () => {
    for (const step of [1, 2] as EmailStep[]) {
      const words = bodyText(build({ step }).html).split(/\s+/).filter(Boolean);
      assert.ok(words.length < 90, `steg ${step}: ${words.length} ord`);
    }
  });

  test("säger vad som saknas i stället för att bygga ett trasigt mejl", () => {
    const result = buildResellerEmail({
      ...input,
      company: " ",
      image: null,
      unsubscribeUrl: "",
      sender: { ...input.sender, orgNumber: "" },
    });
    assert.equal(result.ok, false);
    assert.deepEqual(!result.ok && result.missing, ["företag", "bild", "avregistrering", "avsändare"]);
  });

  test("norska bygger inget mejl förrän texterna finns", () => {
    const result = buildResellerEmail({ ...input, locale: "nb" });
    assert.deepEqual(!result.ok && result.missing, ["språk"]);
    assert.equal(localeFor("no"), "nb");
    assert.equal(localeFor("se"), "sv");
  });

  test("personbilden märks som AI-genererad", () => {
    const { html, text } = build();
    assert.match(visibleText(html), /AI-genererad bild\. Skylten finns på riktigt: metall, borstat guld/);
    assert.match(html, /alt="AI-genererad person som bär/);
    assert.match(text, /AI-genererad bild/);
  });

  test("bara skylten: ingen AI-märkning och ingen person", () => {
    const { html } = build({ image: withImage({ kind: "badge", width: 1200, height: 600 }) });
    assert.doesNotMatch(html, /AI-genererad/);
    assert.match(visibleText(html), /Vi gjorde Profil/);
  });

  test("bara bildadresser, inga data-URL:er och ingen webp", () => {
    const { html } = build();
    assert.doesNotMatch(html, /src="data:/);
    assert.doesNotMatch(html, /\.webp/);
    assert.match(html, /v:roundrect/);
    assert.match(html, /prefers-color-scheme:dark/);
  });

  test("alla länkar går till namnskylt.com: landning, avregistrering och integritet", () => {
    const { html } = build();
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => (m[1] ?? "").replace(/&amp;/g, "&"));
    assert.ok(hrefs.length >= 4);
    const paths = new Set(
      hrefs.map((href) => {
        const url = new URL(href);
        assert.equal(url.hostname, "namnskylt.com", href);
        return url.pathname;
      }),
    );
    assert.deepEqual([...paths].sort(), ["/avregistrera/v1.u.abc.456.sig", "/for/v1.l.abc.123.sig", "/integritet"]);
  });

  test("bilden länkar till landningen", () => {
    assert.match(build().html, /<a href="https:\/\/namnskylt\.com\/for\/v1\.l\.abc\.123\.sig"[^>]*><img/);
  });

  test("texten har båda länkarna", () => {
    const email = build();
    assert.ok(email.text.includes(LANDING));
    assert.ok(email.text.includes(UNSUBSCRIBE));
  });

  test("sidfoten har org.nr, relationen och integritetssidan", () => {
    const { html, text } = build();
    assert.match(html, /Org\.nr 559000-0000/);
    assert.match(html, /Gatan 1, 111 22 Stockholm/);
    assert.match(html, /kund hos oss sedan 2019/);
    assert.match(text, /Avregistrera: https:\/\/namnskylt\.com\/avregistrera\//);
  });

  test("One-Click-avregistrering i headrarna", () => {
    const { headers } = build();
    assert.equal(headers["List-Unsubscribe"], `<${UNSUBSCRIBE}>`);
    assert.equal(headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  });

  test("håller sig under 40 kB", () => {
    assert.ok(Buffer.byteLength(build().html) < 40 * 1024);
  });

  test("utan spårad logga lovas ingen logga", () => {
    for (const step of [1, 2] as EmailStep[]) {
      for (const kind of ["persona", "badge"] as const) {
        const email = build({ step, image: withImage({ hasLogo: false, kind }) });
        assert.doesNotMatch(visibleText(email.html), /logga/i, `${step} ${kind}`);
        assert.doesNotMatch(email.subject, /logga/i, `${step} ${kind}`);
      }
    }
  });

  test("utan riktigt namn blir hälsningen bara Hej!", () => {
    const { html, subject } = build({ contactName: null });
    assert.match(html, />Hej!</);
    assert.equal(subject, "Känner ni igen loggan?");
  });
});

describe("förbjudna formuleringar", () => {
  test("inget segment, steg eller bildval innehåller något förbjudet", () => {
    for (const segment of RELATION_SEGMENTS) {
      for (const step of [1, 2] as EmailStep[]) {
        for (const hasLogo of [true, false]) {
          for (const kind of ["persona", "badge"] as const) {
            const email = build({ segment, step, image: withImage({ hasLogo, kind }) });
            const all = `${email.subject}\n${email.preheader}\n${visibleText(email.html)}\n${email.text}`;
            assert.deepEqual(forbiddenIn(all), [], `${segment} ${step} ${kind}`);
          }
        }
      }
    }
  });

  test("spärren hittar det den ska", () => {
    assert.deepEqual(forbiddenIn("Från 49 kr styck med 30 % marginal"), ["kronbelopp", "procent", "marginal"]);
    assert.deepEqual(forbiddenIn("Mässing och akryl, klart på en dag"), ["på en dag", "mässing", "akryl"]);
    assert.deepEqual(forbiddenIn("Helt gratis"), ["gratis"]);
    assert.ok(FORBIDDEN_PHRASES.length >= 10);
  });

  test("genitiv utan dubbelt s", () => {
    assert.equal(genitive("Nordtryck"), "Nordtrycks");
    assert.equal(genitive("Ljus & Reklams"), "Ljus & Reklams");
    assert.equal(COPY.sv?.subject(2, { firstName: null, company: "Profilab", hasLogo: true, image: "persona", segment: "inactive-known" }), "Butiken åt Profilab ligger kvar");
  });
});
