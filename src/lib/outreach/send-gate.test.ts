import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_COMPANY } from "../company/profile";
import { approvalBlockers, BLOCKER_LABELS, outreachBlockers, parseAllowlist, senderBlockers, type GateContext, type GateLead } from "./send-gate";

const lead: GateLead = { email: "Anna@Profilab.se", country: "se", wave: "A", status: "approved", shopSlug: "profilab" };

const ctx: GateContext = {
  company: { name: "Namnskylt AB", orgNumber: "559000-0000", address: "Gatan 1, 111 22 Stockholm" },
  campaign: { fromEmail: "hej@mail.namnskylt.com", replyTo: "hej@namnskylt.com" },
  sendingDomain: "mail.namnskylt.com",
  suppressed: false,
  allowlist: null,
  mode: "dry_run",
  supplierConfigured: false,
  heroReady: true,
};

describe("outreachBlockers", () => {
  test("ett komplett lead i torrkörning har inga skäl", () => {
    assert.deepEqual(outreachBlockers(lead, ctx), []);
  });

  test("tom DEFAULT_COMPANY blockerar", () => {
    const codes = senderBlockers({ ...ctx, company: DEFAULT_COMPANY });
    assert.ok(codes.includes("sender-org-number"));
    assert.ok(codes.includes("sender-address"));
  });

  test("avsändare utanför sändningsdomänen blockerar", () => {
    const codes = outreachBlockers(lead, { ...ctx, campaign: { ...ctx.campaign, fromEmail: "hej@namnskylt.com" } });
    assert.deepEqual(codes, ["from-domain"]);
  });

  test("svarsadress som saknas eller ligger på sändningsdomänen blockerar", () => {
    for (const replyTo of ["", "svar@mail.namnskylt.com"]) {
      const codes = outreachBlockers(lead, { ...ctx, campaign: { ...ctx.campaign, replyTo } });
      assert.deepEqual(codes, ["reply-to"], replyTo);
    }
  });

  test("spärrad adress, allowlist och importspärr", () => {
    assert.deepEqual(outreachBlockers(lead, { ...ctx, suppressed: true }), ["suppressed"]);
    assert.deepEqual(outreachBlockers(lead, { ...ctx, allowlist: parseAllowlist("christopher@namnskylt.com") }), [
      "not-allowlisted",
    ]);
    assert.deepEqual(outreachBlockers(lead, { ...ctx, allowlist: parseAllowlist(" anna@profilab.se ,x@y.se") }), []);
    assert.deepEqual(outreachBlockers({ ...lead, status: "blocked" }, ctx), ["lead-blocked"]);
  });

  test("Norge och Åland är låsta", () => {
    assert.deepEqual(outreachBlockers({ ...lead, country: "no", wave: "NO" }, ctx), ["country-locked"]);
    assert.deepEqual(outreachBlockers({ ...lead, country: "ax" }, ctx), ["country-locked"]);
  });

  test("våg, butik och skylt måste finnas", () => {
    assert.deepEqual(outreachBlockers({ ...lead, wave: null }, ctx), ["wave-missing"]);
    assert.deepEqual(outreachBlockers({ ...lead, shopSlug: null }, ctx), ["shop-missing"]);
    assert.deepEqual(outreachBlockers(lead, { ...ctx, heroReady: false }), ["hero-missing"]);
  });

  test("vågen måste vara öppen i uppvärmningen", () => {
    assert.deepEqual(outreachBlockers(lead, { ...ctx, openWaves: ["internal"] }), ["wave-not-open"]);
    assert.deepEqual(outreachBlockers(lead, { ...ctx, openWaves: ["internal", "A"] }), []);
  });

  test("live utan leverantörs-API vägrar", () => {
    assert.deepEqual(outreachBlockers(lead, { ...ctx, mode: "live" }), ["supplier-not-configured"]);
    assert.deepEqual(outreachBlockers(lead, { ...ctx, mode: "live", supplierConfigured: true }), []);
  });

  test("varje skäl har en svensk etikett", () => {
    for (const label of Object.values(BLOCKER_LABELS)) assert.ok(label.length > 10);
  });
});

describe("parseAllowlist", () => {
  test("tom betyder ingen allowlist", () => {
    assert.equal(parseAllowlist(undefined), null);
    assert.equal(parseAllowlist("  "), null);
  });
});

describe("approvalBlockers", () => {
  test("ett komplett lead går att godkänna även utan avsändare", () => {
    assert.deepEqual(approvalBlockers(lead, { suppressed: false, heroReady: true }), []);
  });

  test("saknad bild, butik och våg stoppar godkännandet", () => {
    const blockers = approvalBlockers({ ...lead, wave: null, shopSlug: null }, { suppressed: false, heroReady: false });
    assert.deepEqual(blockers, ["wave-missing", "shop-missing", "hero-missing"]);
  });

  test("Norge och spärrade adresser stoppas", () => {
    assert.deepEqual(approvalBlockers({ ...lead, country: "no" }, { suppressed: true, heroReady: true }), ["suppressed", "country-locked"]);
  });
});
