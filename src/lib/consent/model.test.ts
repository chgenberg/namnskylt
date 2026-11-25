import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { analyticsAllowedOn, gaMeasurementIdOf, parseConsent } from "./model";

describe("val om kakor", () => {
  test("läser valet ur kakan", () => {
    assert.equal(parseConsent("a=1; ns_samtycke=alla; b=2"), "alla");
    assert.equal(parseConsent("ns_samtycke=nodvandiga"), "nodvandiga");
    assert.equal(parseConsent("ns_samtycke=kanske"), null);
    assert.equal(parseConsent(""), null);
  });

  test("bara ett riktigt mätnings-id slår på Google Analytics", () => {
    assert.equal(gaMeasurementIdOf(" g-ab12cd34ef "), "G-AB12CD34EF");
    for (const value of ["", null, undefined, "UA-12345-1", "G-", "<script>", "GTM-ABC123"]) {
      assert.equal(gaMeasurementIdOf(value), null, String(value));
    }
  });

  test("bara på namnskylt.coms egna sidor", () => {
    assert.equal(analyticsAllowedOn("www.namnskylt.com", "/demo"), true);
    assert.equal(analyticsAllowedOn("namnskylt.com", "/"), true);
    assert.equal(analyticsAllowedOn("www.namnskylt.com", "/admin/ordrar"), false);
    assert.equal(analyticsAllowedOn("www.namnskylt.com", "/butik/profilhuset"), false);
    assert.equal(analyticsAllowedOn("skyltar.profilhuset.se", "/"), false);
  });
});
