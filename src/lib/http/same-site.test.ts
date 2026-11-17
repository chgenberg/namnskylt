import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isSameSiteJson } from "./same-site";

const request = (headers: Record<string, string>) => new Request("https://www.namnskylt.com/api/customer/session", { method: "POST", headers, body: "{}" });

describe("anrop från sajten själv", () => {
  test("sajtens eget anrop med JSON släpps igenom", () => {
    assert.equal(isSameSiteJson(request({ "content-type": "application/json", "sec-fetch-site": "same-origin" })), true);
    assert.equal(isSameSiteJson(request({ "content-type": "application/json; charset=utf-8", "sec-fetch-site": "same-origin" })), true);
  });

  test("ett anrop utanför webbläsaren saknar raden om ursprung och släpps igenom", () => {
    assert.equal(isSameSiteJson(request({ "content-type": "application/json" })), true);
  });

  test("ett formulär på en annan sajt nekas, också när texten går att läsa som JSON", () => {
    assert.equal(isSameSiteJson(request({ "content-type": "text/plain", "sec-fetch-site": "cross-site" })), false);
    assert.equal(isSameSiteJson(request({ "content-type": "text/plain" })), false);
    assert.equal(isSameSiteJson(request({ "content-type": "application/x-www-form-urlencoded" })), false);
    assert.equal(isSameSiteJson(request({})), false);
  });

  test("JSON från en annan sajt eller en annan underadress nekas", () => {
    assert.equal(isSameSiteJson(request({ "content-type": "application/json", "sec-fetch-site": "cross-site" })), false);
    assert.equal(isSameSiteJson(request({ "content-type": "application/json", "sec-fetch-site": "same-site" })), false);
  });

  test("en typ som bara liknar JSON räknas inte", () => {
    assert.equal(isSameSiteJson(request({ "content-type": "application/jsonp" })), false);
    assert.equal(isSameSiteJson(request({ "content-type": "text/json" })), false);
  });
});
