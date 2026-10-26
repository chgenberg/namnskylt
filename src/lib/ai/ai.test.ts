import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, parseSmartInput } from "@/engine";
import { isUsablePhoto, photoRejection, type PhotoCheck } from "./photo-check";
import { PEOPLE_PERSONAS, personaPrompt, tryOnPrompt } from "./prompts";
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
    const prompts = [tryOnPrompt(doc), ...PEOPLE_PERSONAS.map((persona) => personaPrompt(doc, persona))];
    for (const prompt of prompts) {
      assert.match(prompt, /"Åsa Öberg"/);
      assert.match(prompt, /"Säljchef"/);
      assert.ok(prompt.includes(`${doc.size.widthMm} × ${doc.size.heightMm} mm`));
    }
  });

  it("ber om att bevara kundens foto vid provning", () => {
    assert.match(tryOnPrompt(doc), /Keep the person's face, identity/);
  });
});
