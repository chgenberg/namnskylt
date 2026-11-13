import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { issueLinkToken, signLinkToken } from "./link-token";
import { chosenMaterial, landingMessageId, recordLandingDecision, selectedTile } from "./landing";

const SECRET = "s".repeat(40);
const now = new Date("2026-11-10T10:00:00Z");
const ID = "6f1c2a52-0000-4000-8000-000000000001";
const SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

describe("recordLandingDecision", () => {
  test("en vanlig webbläsare räknas", () => {
    assert.equal(recordLandingDecision(SAFARI, false), true);
  });

  test("botar, skannrar och tomma user agents räknas inte", () => {
    for (const ua of ["Googlebot/2.1", "Mozilla/5.0 (compatible; Proofpoint)", "python-requests/2.31", "curl/8.0", "", null]) {
      assert.equal(recordLandingDecision(ua, false), false, String(ua));
    }
  });

  test("vår egen inloggade session räknas inte", () => {
    assert.equal(recordLandingDecision(SAFARI, true), false);
  });
});

describe("landingMessageId", () => {
  test("en giltig landningslänk ger meddelandet", () => {
    assert.equal(landingMessageId(issueLinkToken("landing", ID, SECRET, now), [SECRET], now), ID);
  });

  test("ogiltig, utgången och fel purpose ger samma svar", () => {
    const expired = signLinkToken({ purpose: "landing", messageId: ID, expUnix: now.getTime() / 1000 - 1 }, SECRET);
    const unsubscribe = issueLinkToken("unsubscribe", ID, SECRET, now);
    for (const token of ["skräp", expired, unsubscribe, `${issueLinkToken("landing", ID, SECRET, now)}x`]) {
      assert.equal(landingMessageId(token, [SECRET], now), null);
    }
  });
});

describe("chosenMaterial", () => {
  test("bara material som erbjöds i mejlet", () => {
    assert.equal(chosenMaterial("stainless", ["plastic-2-layer", "stainless"]), "stainless");
    assert.equal(chosenMaterial("brass", ["plastic-2-layer", "stainless"]), null);
    assert.equal(chosenMaterial(undefined, ["stainless"]), null);
  });
});

describe("selectedTile", () => {
  const tiles = [
    { id: "t1", materialId: "plastic-2-layer", colorId: "darkblue-white" },
    { id: "t2", materialId: "plastic-2-layer", colorId: "white-black" },
    { id: "t3", materialId: "stainless", colorId: "steel-laser" },
  ];

  test("mejlets material och färg väljer rätt ruta", () => {
    assert.equal(selectedTile(tiles, { m: "plastic-2-layer", c: "white-black" })?.id, "t2");
    assert.equal(selectedTile(tiles, { m: "plastic-2-layer" })?.id, "t1");
    assert.equal(selectedTile(tiles, { m: "stainless", c: "fel" })?.id, "t3");
  });

  test("sidans egen ruta går före, och okänt ger hjältebilden", () => {
    assert.equal(selectedTile(tiles, { f: "t3", m: "plastic-2-layer" })?.id, "t3");
    assert.equal(selectedTile(tiles, { m: "brass" }), null);
    assert.equal(selectedTile(tiles, {}), null);
  });
});
