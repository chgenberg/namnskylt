import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { signWebhook } from "../supplier/status";
import type { MessageStatus, SuppressionReason } from "./model";
import { applyResendEvent, eventEffect, resendEventSchema, svixSignature, verifySvix, type WebhookStore } from "./webhook";

const SECRET = `whsec_${Buffer.from("0123456789abcdef0123456789abcdef").toString("base64")}`;
const NOW = 1_800_000_000;
const BODY = JSON.stringify({ type: "email.delivered", created_at: "2026-11-10T10:00:00Z", data: { email_id: "re_1" } });

function headers(body = BODY, timestamp = NOW, secret = SECRET) {
  return { id: "msg_1", timestamp: String(timestamp), signature: `v1,${svixSignature(secret, "msg_1", String(timestamp), body)}` };
}

describe("verifySvix", () => {
  test("rätt signatur godtas", () => {
    assert.equal(verifySvix(BODY, headers(), SECRET, NOW), true);
  });

  test("en av flera signaturer räcker vid nyckelbyte", () => {
    const h = headers();
    assert.equal(verifySvix(BODY, { ...h, signature: `v1,ZmVsCg== ${h.signature}` }, SECRET, NOW), true);
  });

  test("ändrad kropp, gammal tid och fel hemlighet avvisas", () => {
    assert.equal(verifySvix(`${BODY} `, headers(), SECRET, NOW), false);
    assert.equal(verifySvix(BODY, headers(BODY, NOW - 301), SECRET, NOW), false);
    const other = `whsec_${Buffer.from("fedcba9876543210fedcba9876543210").toString("base64")}`;
    assert.equal(verifySvix(BODY, headers(BODY, NOW, other), SECRET, NOW), false);
  });

  test("leverantörens signatur godtas inte", () => {
    const supplier = signWebhook(BODY, SECRET, NOW);
    assert.equal(verifySvix(BODY, { id: "msg_1", timestamp: String(NOW), signature: supplier }, SECRET, NOW), false);
    assert.equal(verifySvix(BODY, { id: "msg_1", timestamp: String(NOW), signature: `v1,${supplier.split("v1=")[1]}` }, SECRET, NOW), false);
  });

  test("saknade rubriker avvisas", () => {
    assert.equal(verifySvix(BODY, { id: null, timestamp: String(NOW), signature: "v1,x" }, SECRET, NOW), false);
  });
});

describe("eventEffect", () => {
  const event = (type: string, bounce?: string) =>
    resendEventSchema.parse({ type, created_at: "2026-11-10T10:00:00Z", data: { email_id: "re_1", bounce: bounce ? { type: bounce } : undefined } });

  test("permanent studs spärrar, tillfällig gör det inte", () => {
    assert.equal(eventEffect(event("email.bounced", "Permanent")).suppress, "bounce");
    assert.equal(eventEffect(event("email.bounced", "Transient")).suppress, null);
    assert.equal(eventEffect(event("email.bounced", "Transient")).type, "bounced_soft");
  });

  test("klagomål spärrar och pausar direkt", () => {
    const effect = eventEffect(event("email.complained"));
    assert.equal(effect.suppress, "complaint");
    assert.equal(effect.pauseNow, true);
  });
});

class FakeWebhookStore implements WebhookStore {
  readonly seen = new Set<string>();
  readonly log: string[] = [];
  async messageByResendId(id: string) {
    return id === "re_1" ? { id: "m1", leadId: "l1" } : null;
  }
  async leadEmail() {
    return "anna@profilab.se";
  }
  async insertEvent(input: { providerEventId: string; type: string }) {
    if (this.seen.has(input.providerEventId)) return false;
    this.seen.add(input.providerEventId);
    this.log.push(`event:${input.type}`);
    return true;
  }
  async setMessageStatus(_id: string, _from: readonly MessageStatus[], to: MessageStatus) {
    this.log.push(`status:${to}`);
    return true;
  }
  async suppress(input: { reason: SuppressionReason }) {
    this.log.push(`suppress:${input.reason}`);
  }
  async pauseAll() {
    this.log.push("pause");
  }
}

describe("applyResendEvent", () => {
  const bounce = resendEventSchema.parse({
    type: "email.bounced",
    created_at: "2026-11-10T10:00:00Z",
    data: { email_id: "re_1", bounce: { type: "Permanent" } },
  });

  test("permanent studs: status, spärr, en gång", async () => {
    const store = new FakeWebhookStore();
    assert.equal(await applyResendEvent(store, "msg_1", bounce, new Date()), "applied");
    assert.equal(await applyResendEvent(store, "msg_1", bounce, new Date()), "duplicate");
    assert.deepEqual(store.log, ["event:bounced_hard", "status:bounced", "suppress:bounce"]);
  });

  test("okänt meddelande sparas men ändrar inget", async () => {
    const store = new FakeWebhookStore();
    const unknown = { ...bounce, data: { ...bounce.data, email_id: "re_x" } };
    assert.equal(await applyResendEvent(store, "msg_2", unknown, new Date()), "unknown_message");
    assert.deepEqual(store.log, ["event:bounced_hard"]);
  });
});
