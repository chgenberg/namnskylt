import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { composeOutreachEmail, outreachCampaignSender, type ComposeInput } from "./compose";
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

describe("composeOutreachEmail", () => {
  test("mejlet har toppbilden, inte leadets bilder, och länkar till sidan med filmen", () => {
    for (const assets of [[], [asset("hero", HERO), asset("persona", PERSONA, "approved")]]) {
      const result = compose(assets);
      assert.ok(result.ok);
      assert.equal([...result.email.html.matchAll(/<img/g)].length, 1);
      assert.match(result.email.html, /<img src="https:\/\/namnskylt\.com\/mejl\/aterforsaljare-kontor\.jpg"/);
      assert.ok(!result.email.html.includes(HERO) && !result.email.html.includes(PERSONA));
      assert.match(result.email.html, /href="https:\/\/namnskylt\.com\/demo\?k=v1\.[^"]+"/);
      assert.match(result.email.html, /href="tel:\+46761884800"/);
      assert.ok(!result.email.html.includes("/for/"));
    }
  });

  test("avsändare och svar kommer från kampanjen", () => {
    const result = compose([]);
    assert.ok(result.ok);
    assert.equal(result.email.from, "Namnskylt <hej@mail.namnskylt.com>");
    assert.equal(result.email.replyTo, "hej@namnskylt.com");
  });

  test("norska kunder får inget mejl förrän texterna finns", () => {
    const result = compose([], { country: "no" });
    assert.deepEqual(!result.ok && result.missing, ["språk"]);
  });

  test("utan länkhemlighet byggs inget mejl", () => {
    const result = compose([], {}, null);
    assert.deepEqual(!result.ok && result.missing, ["länkhemlighet"]);
  });
});

describe("kampanjens avsändare", () => {
  test("Namnskylt från utskickets underdomän, svar och signatur till hej@namnskylt.com", () => {
    assert.deepEqual(outreachCampaignSender({}), {
      fromName: "Namnskylt",
      fromEmail: "info@utskick.skyltochgravyr.com",
      replyTo: "hej@namnskylt.com",
      signature: { name: "Gänget på Namnskylt", email: "hej@namnskylt.com" },
    });
    assert.equal(outreachCampaignSender({ OUTREACH_SENDING_DOMAIN: " send.example.se " }).fromEmail, "info@send.example.se");
  });
});
