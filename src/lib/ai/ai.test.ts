import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, parseSmartInput } from "@/engine";
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
    assert.match(personaPrompt(withLogo, UNKNOWN_WEARER), /single-colour logo .* to the left of the text/);
    assert.match(personaPrompt(doc, UNKNOWN_WEARER), /No other text, logos or symbols/);
  });

  it("ber om att bevara kundens foto vid provning", () => {
    assert.match(tryOnPrompt(doc), /Keep the person's face, identity/);
  });
});
