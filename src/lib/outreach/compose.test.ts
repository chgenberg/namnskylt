import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { composeOutreachEmail, type ComposeInput } from "./compose";
import { DEFAULT_CAMPAIGN_STEPS, type AssetReview } from "./model";
import type { AssetMeta, CampaignRow, LeadRow } from "./store";

const asset = (kind: AssetMeta["kind"], id: string, review: AssetReview = "pending"): AssetMeta => ({
  id,
  kind,
  materialId: "metal",
  colorId: "metal-gold",
  shape: "rounded",
  widthMm: 75,
  heightMm: 25,
  width: kind === "persona" ? 600 : 1200,
  height: kind === "persona" ? 750 : 600,
  logoStatus: "logo",
  review,
});

const HERO = "hero-0000000000000000";
const PERSONA = "pers-0000000000000000";

function compose(assets: AssetMeta[], lead: Partial<LeadRow> = {}, linkSecret: string | null = "x".repeat(40)) {
  const input: ComposeInput = {
    message: { id: "00000000-0000-4000-8000-000000000001", step: 1, idempotencyKey: "k" },
    lead: {
      id: "l1",
      email: "anna@profilab.se",
      contactName: "Anna Lindqvist",
      companyName: "Profilab AB",
      country: "se",
      customerSince: "2019-03-01",
      activated: true,
      known: true,
      ...lead,
    } as LeadRow,
    campaign: {
      fromName: "Namnskylt",
      fromEmail: "hej@mail.namnskylt.com",
      replyTo: "hej@namnskylt.com",
      signature: {},
      steps: [...DEFAULT_CAMPAIGN_STEPS],
    } as unknown as CampaignRow,
    assets,
    sender: { legalName: "Namnskylt AB", orgNumber: "559000-0000", address: "Gatan 1" },
    siteUrl: "https://namnskylt.com",
    linkSecret: linkSecret ?? undefined,
    now: new Date("2026-11-10T09:00:00Z"),
  };
  return composeOutreachEmail(input);
}

describe("composeOutreachEmail — vilken bild som följer med", () => {
  test("en personbild som inte är granskad skickas inte; mejlet visar skylten", () => {
    for (const review of ["pending", "rejected"] as const) {
      const result = compose([asset("hero", HERO), asset("persona", PERSONA, review)]);
      assert.ok(result.ok);
      assert.ok(result.email.html.includes(`/utskick/bild/${HERO}.jpg`), review);
      assert.ok(!result.email.html.includes(PERSONA), review);
      assert.doesNotMatch(result.email.html, /AI-genererad/);
    }
  });

  test("en godkänd personbild följer med och märks som AI-genererad", () => {
    const result = compose([asset("hero", HERO), asset("persona", PERSONA, "approved")]);
    assert.ok(result.ok);
    assert.ok(result.email.html.includes(`/utskick/bild/${PERSONA}.jpg`));
    assert.match(result.email.html, /AI-genererad bild/);
  });

  test("utan bild byggs inget mejl", () => {
    const result = compose([]);
    assert.deepEqual(!result.ok && result.missing, ["bild"]);
  });

  test("norska kunder får inget mejl förrän texterna finns", () => {
    const result = compose([asset("hero", HERO)], { country: "no" });
    assert.deepEqual(!result.ok && result.missing, ["språk"]);
  });

  test("utan länkhemlighet byggs inget mejl", () => {
    const result = compose([asset("hero", HERO)], {}, null);
    assert.deepEqual(!result.ok && result.missing, ["länkhemlighet"]);
  });
});
