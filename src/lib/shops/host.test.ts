import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidDomain, normalizeHost, resolveHost, shopRewritePath } from "./host";

const MAIN = ["namnskylt.com", "www.namnskylt.com", "localhost"];

describe("butikens adress", () => {
  it("känner igen vår egen sajt", () => {
    assert.deepEqual(resolveHost("www.namnskylt.com", MAIN), { kind: "main" });
    assert.deepEqual(resolveHost("localhost:3100", MAIN), { kind: "main" });
    assert.deepEqual(resolveHost("namnskylt-production.up.railway.app", MAIN), { kind: "main" });
    assert.deepEqual(resolveHost(null, MAIN), { kind: "main" });
  });

  it("ger butikens underadress, men inte reserverade namn", () => {
    assert.deepEqual(resolveHost("Kontorsprofilen.Namnskylt.com:443", MAIN), { kind: "subdomain", slug: "kontorsprofilen" });
    assert.deepEqual(resolveHost("admin.namnskylt.com", MAIN), { kind: "main" });
    assert.deepEqual(resolveHost("a.b.namnskylt.com", MAIN), { kind: "main" });
  });

  it("tar emot återförsäljarens egen domän", () => {
    assert.deepEqual(resolveHost("skylt.kontorsprofilen.se", MAIN), { kind: "custom", host: "skylt.kontorsprofilen.se" });
    assert.equal(normalizeHost("Skylt.Example.se., other"), "skylt.example.se");
    assert.equal(isValidDomain("skylt.kontorsprofilen.se"), true);
    assert.equal(isValidDomain("butik.namnskylt.com"), false);
    assert.equal(isValidDomain("inte en domän"), false);
  });

  it("skriver om sidor till butiken men låter filer, API och delade länkar vara", () => {
    assert.equal(shopRewritePath("aq-skylt", "/"), "/butik/aq-skylt");
    assert.equal(shopRewritePath("aq-skylt", "/skapa"), "/butik/aq-skylt/skapa");
    assert.equal(shopRewritePath("aq-skylt", "/butik/aq-skylt/skapa"), null);
    assert.equal(shopRewritePath("aq-skylt", "/korrektur/abc"), null);
    assert.equal(shopRewritePath("aq-skylt", "/embed.js"), null);
  });
});
