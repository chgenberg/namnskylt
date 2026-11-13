import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { issueLinkToken, LinkSecretError, signLinkToken, verifyLinkToken } from "./link-token";

const SECRET = "a".repeat(32);
const OLD = "b".repeat(32);
const MESSAGE = "6f1c2a90-0b7e-4d3a-9a51-2f7c1e0d4b88";
const now = new Date("2026-11-10T10:00:00Z");
const nowUnix = Math.floor(now.getTime() / 1000);

describe("signerade länkar", () => {
  test("en giltig landningslänk verifieras", () => {
    const token = issueLinkToken("landing", MESSAGE, SECRET, now);
    const result = verifyLinkToken(token, "landing", [SECRET], now);
    assert.deepEqual(result.ok && result.messageId, MESSAGE);
  });

  test("ändrad signatur godtas inte", () => {
    const token = issueLinkToken("landing", MESSAGE, SECRET, now);
    const tampered = `${token.slice(0, -2)}${token.endsWith("AA") ? "BB" : "AA"}`;
    assert.equal(verifyLinkToken(tampered, "landing", [SECRET], now).ok, false);
  });

  test("ett annat meddelande-id godtas inte med samma signatur", () => {
    const token = issueLinkToken("landing", MESSAGE, SECRET, now);
    const swapped = token.replace(MESSAGE, "00000000-0000-4000-8000-000000000000");
    assert.equal(verifyLinkToken(swapped, "landing", [SECRET], now).ok, false);
  });

  test("en avregistreringslänk är ingen landningslänk, och tvärtom", () => {
    const unsubscribe = issueLinkToken("unsubscribe", MESSAGE, SECRET, now);
    const landing = issueLinkToken("landing", MESSAGE, SECRET, now);
    assert.equal(verifyLinkToken(unsubscribe, "landing", [SECRET], now).ok, false);
    assert.equal(verifyLinkToken(landing, "unsubscribe", [SECRET], now).ok, false);
    assert.equal(verifyLinkToken(unsubscribe, "unsubscribe", [SECRET], now).ok, true);
  });

  test("en utgången länk godtas inte", () => {
    const token = signLinkToken({ purpose: "landing", messageId: MESSAGE, expUnix: nowUnix - 1 }, SECRET);
    assert.equal(verifyLinkToken(token, "landing", [SECRET], now).ok, false);
  });

  test("den förra hemligheten verifierar vid rotation", () => {
    const token = issueLinkToken("landing", MESSAGE, OLD, now);
    assert.equal(verifyLinkToken(token, "landing", [SECRET], now).ok, false);
    assert.equal(verifyLinkToken(token, "landing", [SECRET, OLD], now).ok, true);
  });

  test("för kort eller saknad hemlighet utfärdar inget", () => {
    assert.throws(() => issueLinkToken("landing", MESSAGE, "kort", now), LinkSecretError);
    assert.throws(() => issueLinkToken("landing", MESSAGE, undefined, now), LinkSecretError);
  });

  test("för kort hemlighet verifierar inte heller", () => {
    assert.equal(verifyLinkToken("v1.l.x.1.y", "landing", ["kort"], now).ok, false);
  });

  test("länken innehåller ingen e-post och är kort", () => {
    const token = issueLinkToken("unsubscribe", MESSAGE, SECRET, now);
    assert.equal(token.includes("@"), false);
    assert.ok(token.length < 120, `längd ${token.length}`);
  });

  test("skräp godtas inte", () => {
    for (const junk of ["", "v1", "v1.l", "v2.l.a.b.c", "v1.l.inte-uuid.123.sig"]) {
      assert.equal(verifyLinkToken(junk, "landing", [SECRET], now).ok, false);
    }
  });
});
