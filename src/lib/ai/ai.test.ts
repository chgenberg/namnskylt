import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, parseSmartInput } from "@/engine";
import { plasticBadge } from "@/engine/testing";
import { isUsablePhoto, photoRejection, type PhotoCheck } from "./photo-check";
import {
  MAX_WORKPLACE_CHARS,
  UNKNOWN_WEARER,
  badgeName,
  cleanWorkplace,
  personaPrompt,
  tryOnPrompt,
  wearerDescription,
} from "./prompts";
import { clientKey, createRateLimiter } from "./rate-limit";

const goodPhoto: PhotoCheck = { people: 1, framing: "half_body", chestVisible: true, reason: "" };

describe("fotokontroll", () => {
  it("godkänner en person i halv- eller helkropp med synligt bröst", () => {
    assert.equal(isUsablePhoto(goodPhoto), true);
    assert.equal(isUsablePhoto({ ...goodPhoto, framing: "full_body" }), true);
  });

  it("underkänner selfies, grupper och skymt bröst med svensk förklaring", () => {
    const cases: [PhotoCheck, RegExp][] = [
      [{ ...goodPhoto, framing: "head_only" }, /halvkropp eller helkropp/],
      [{ ...goodPhoto, people: 2 }, /en person/],
      [{ ...goodPhoto, people: 0, framing: "no_person" }, /ingen person/],
      [{ ...goodPhoto, chestVisible: false }, /Bröstet/],
    ];
    for (const [check, message] of cases) {
      assert.equal(isUsablePhoto(check), false);
      assert.match(photoRejection(check), message);
    }
  });
});

describe("rate limit", () => {
  it("släpper igenom upp till gränsen och räknar kostnad", () => {
    const limiter = createRateLimiter({ limit: 4, windowMs: 1000 });
    assert.equal(limiter.take("a", 3, 0), true);
    assert.equal(limiter.take("a", 3, 10), false);
    assert.equal(limiter.take("a", 1, 20), true);
    assert.equal(limiter.take("a", 1, 30), false);
    assert.equal(limiter.take("b", 1, 30), true);
  });

  it("frigör kvoten när fönstret passerat", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    assert.equal(limiter.take("a", 1, 0), true);
    assert.equal(limiter.take("a", 1, 999), false);
    assert.equal(limiter.take("a", 1, 1000), true);
  });

  it("glömmer nycklar utan förbrukning i fönstret", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    for (let i = 0; i < 50; i++) limiter.take(`ip-${i}`, 1, 0);
    limiter.take("ny", 1, 2000);
    assert.equal(limiter.size(), 1);
  });

  it("föredrar x-real-ip framför x-forwarded-for", () => {
    const headers = { "x-real-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9, 1.1.1.1" };
    assert.equal(clientKey(new Request("http://x", { headers })), "1.1.1.1");
    assert.equal(clientKey(new Request("http://x")), "unknown");
  });
});

describe("prompter", () => {
  const doc = createBadgeDocument(parseSmartInput("Åsa Öberg, Säljchef"));

  it("återger texten bokstav för bokstav och verkliga mått", () => {
    const prompts = [tryOnPrompt(doc), personaPrompt(doc, UNKNOWN_WEARER)];
    for (const prompt of prompts) {
      assert.match(prompt, /"Åsa Öberg"/);
      assert.match(prompt, /"Säljchef"/);
      assert.ok(prompt.includes(`${doc.size.widthMm} × ${doc.size.heightMm} mm`));
    }
  });

  it("beskriver en person vars kön och ålder passar namnet", () => {
    assert.match(wearerDescription({ gender: "female", age: "older" }), /\bwoman\b.*about 60/);
    assert.match(wearerDescription({ gender: "male", age: "young" }), /\bman\b.*about 25/);
    assert.match(personaPrompt(doc, { gender: "male", age: "middle" }), /Swedish man aged about 40/);
    assert.doesNotMatch(wearerDescription(UNKNOWN_WEARER), /\b(woman|man) aged/);
  });

  it("läser namnet från första graverade raden", () => {
    assert.equal(badgeName(doc), "Åsa Öberg");
    assert.equal(badgeName(createBadgeDocument([""])), null);
  });

  it("ställer personen i kundens arbetsmiljö när den är angiven", () => {
    const workplace = cleanWorkplace("Ljus tandläkarmottagning med behandlingsstol");
    const prompt = personaPrompt(doc, UNKNOWN_WEARER, workplace);
    assert.match(prompt, /as "Säljchef" in a real, lived-in Swedish workplace: Ljus tandläkarmottagning/);
    assert.doesNotMatch(personaPrompt(doc, UNKNOWN_WEARER), /lived-in/);
  });

  it("rensar miljötexten innan den hamnar i prompten", () => {
    assert.equal(cleanWorkplace('  Butik "med" <b>kassa</b>\n\n '), "Butik med b kassa /b");
    assert.equal(cleanWorkplace("a"), null);
    assert.equal(cleanWorkplace(undefined), null);
    assert.equal(cleanWorkplace("x".repeat(500))?.length, MAX_WORKPLACE_CHARS);
  });

  it("beskriver loggan på skylten bara när den finns", () => {
    const withLogo = {
      ...doc,
      logo: { d: "M0 0L1 0L1 1Z", viewWidth: 1, viewHeight: 1, placement: "left" as const, heightMm: 10 },
    };
    // Skylten är i metall, som bara går att printa på: också en svartvit logga printas.
    assert.match(personaPrompt(withLogo, UNKNOWN_WEARER), /logo printed flat in a single colour .* to the left of the text/);
    assert.match(personaPrompt(doc, UNKNOWN_WEARER), /No other text, logos or symbols/);
  });

  it("beskriver skylten i de färger den har: printad text och en logga i färg är inte svart gravyr", () => {
    const image = { src: "data:image/png;base64,AAAA", width: 4, height: 4 };
    const logo = { d: "M0 0L1 0L1 1Z", viewWidth: 1, viewHeight: 1, placement: "left" as const, heightMm: 10 };
    // Namnet printas i kundens färg och loggan i sina egna färger.
    const printed = {
      ...doc,
      marking: "print" as const,
      rows: doc.rows.map((row, i) => (i === 0 ? { ...row, printColor: "#FF40FF" } : row)),
      logo: { ...logo, image },
    };
    const prompt = personaPrompt(printed, UNKNOWN_WEARER);
    assert.match(prompt, /printed flat on the surface in colour, not engraved/);
    assert.match(prompt, /text line 1 #FF40FF, text line 2 #/);
    assert.match(prompt, /logo printed in full colour .* never turn it black, white, grey or single-colour, to the left of the text/);
    assert.doesNotMatch(prompt, /engraved single-colour|engraved and filled|engraved through/);

    // En kod för hela trycket gäller alla rader, och en svartvit logga som printas får samma färg.
    const oneColour = personaPrompt({ ...doc, marking: "print" as const, printColor: "100/0/0/0", logo }, UNKNOWN_WEARER);
    assert.match(oneColour, /\(surface #[0-9A-Fa-f]{6}, text #00[0-9A-Fa-f]{4}\)/);
    assert.match(oneColour, /logo printed flat in a single colour \(#00[0-9A-Fa-f]{4}\)/);

    // Gravyr, som finns på plast, beskrivs som förut, i materialets färg.
    const engraved = personaPrompt({ ...plasticBadge(["Åsa Öberg", "Säljchef"]), logo }, UNKNOWN_WEARER);
    assert.match(engraved, /the text is engraved/);
    assert.match(engraved, /the engraved single-colour logo exactly as in the reference image/);
    assert.doesNotMatch(engraved, /printed flat/);
  });

  it("beskriver plastens guld som borstad metall, inte som slät plast", () => {
    const plastic = (colorId: string) => personaPrompt({ ...doc, materialId: "plastic" as const, colorId }, UNKNOWN_WEARER);
    assert.match(plastic("gold-black"), /brushed metallic film that looks like brushed metal/);
    assert.match(plastic("yellow-black"), /smooth satin surface/);
    assert.doesNotMatch(plastic("yellow-black"), /brushed metallic/);
  });

  it("en skylt utan text får ingen text i bilden", () => {
    const logo = { d: "M0 0L1 0L1 1Z", viewWidth: 1, viewHeight: 1, placement: "left" as const, heightMm: 10 };
    const prompt = personaPrompt({ ...createBadgeDocument([""]), logo }, UNKNOWN_WEARER);
    assert.match(prompt, /The badge has no text at all/);
    assert.doesNotMatch(prompt, /Text in Arial|to the left of the text|the text is/);
    assert.match(prompt, /The badge also carries the logo printed flat in a single colour/);
    // På plast graveras en svartvit logga, om inget annat är valt.
    assert.match(personaPrompt({ ...plasticBadge([""]), logo }, UNKNOWN_WEARER), /The badge also carries the engraved single-colour logo/);
  });

  it("ber om att bevara kundens foto vid provning", () => {
    assert.match(tryOnPrompt(doc), /Keep the person's face, identity/);
  });
});
