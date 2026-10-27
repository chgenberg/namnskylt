import assert from "node:assert/strict";
import { test } from "node:test";
import { gateEnabled, gateToken, isValidGateCookie, passwordMatches } from "./token";

function withPassword(value: string | undefined, run: () => Promise<void> | void) {
  return async () => {
    const before = process.env.SITE_GATE_PASSWORD;
    if (value === undefined) delete process.env.SITE_GATE_PASSWORD;
    else process.env.SITE_GATE_PASSWORD = value;
    try {
      await run();
    } finally {
      if (before === undefined) delete process.env.SITE_GATE_PASSWORD;
      else process.env.SITE_GATE_PASSWORD = before;
    }
  };
}

test(
  "koden stämmer bokstav för bokstav",
  withPassword("Hemlig-kod%1", () => {
    assert.equal(passwordMatches("Hemlig-kod%1"), true);
    assert.equal(passwordMatches("hemlig-kod%1"), false);
    assert.equal(passwordMatches(""), false);
  }),
);

test(
  "kakan är giltig bara för den signerade tokenen",
  withPassword("Hemlig-kod%1", async () => {
    const token = await gateToken();
    assert.equal(await isValidGateCookie(token), true);
    assert.equal(await isValidGateCookie(undefined), false);
    assert.equal(await isValidGateCookie("nej"), false);
  }),
);

test(
  "utan variabel är spärren avstängd och ingen kod godtas",
  withPassword(undefined, async () => {
    assert.equal(gateEnabled(), false);
    assert.equal(await isValidGateCookie(undefined), true);
    assert.equal(passwordMatches("vad som helst"), false);
  }),
);
