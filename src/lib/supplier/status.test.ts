import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advancesTo,
  isTrackableSupplierOrder,
  signWebhook,
  supplierOrderStateSchema,
  toOrderStatus,
  verifyWebhookSignature,
} from "./status";

describe("toOrderStatus", () => {
  it("översätter leverantörens steg till tidslinjen", () => {
    assert.equal(toOrderStatus("submitted"), null);
    assert.equal(toOrderStatus("in_review"), null);
    assert.equal(toOrderStatus("in_production"), "in-production");
    assert.equal(toOrderStatus("completed"), "in-production");
    assert.equal(toOrderStatus("shipped"), "shipped");
    assert.equal(toOrderStatus("delivered"), "delivered");
    assert.equal(toOrderStatus("cancelled"), "cancelled");
  });
});

describe("advancesTo", () => {
  it("går bara framåt", () => {
    assert.equal(advancesTo("received", "in-production"), true);
    assert.equal(advancesTo("approved", "shipped"), true);
    assert.equal(advancesTo("shipped", "in-production"), false);
    assert.equal(advancesTo("shipped", "shipped"), false);
  });

  it("låter inte en avslutad order ändras", () => {
    assert.equal(advancesTo("delivered", "cancelled"), false);
    assert.equal(advancesTo("cancelled", "shipped"), false);
  });

  it("makulerar fram till att paketet skickats", () => {
    assert.equal(advancesTo("in-production", "cancelled"), true);
    assert.equal(advancesTo("shipped", "cancelled"), false);
  });
});

describe("isTrackableSupplierOrder", () => {
  it("hoppar över demo- och mockordrar", () => {
    assert.equal(isTrackableSupplierOrder(null), false);
    assert.equal(isTrackableSupplierOrder("DEMO"), false);
    assert.equal(isTrackableSupplierOrder("MOCK-ABC"), false);
    assert.equal(isTrackableSupplierOrder("104233"), true);
  });
});

describe("webhooksignatur", () => {
  const body = JSON.stringify({ orderNumber: "104233", status: "shipped", changedAt: "2026-10-27T12:00:00Z" });
  const now = 1_800_000_000;

  it("godtar en korrekt signatur", () => {
    assert.equal(verifyWebhookSignature(body, signWebhook(body, "hemligt", now), "hemligt", now + 10), true);
  });

  it("avvisar fel nyckel, ändrad kropp och gammal tid", () => {
    const header = signWebhook(body, "hemligt", now);
    assert.equal(verifyWebhookSignature(body, header, "annat", now), false);
    assert.equal(verifyWebhookSignature(`${body} `, header, "hemligt", now), false);
    assert.equal(verifyWebhookSignature(body, header, "hemligt", now + 301), false);
    assert.equal(verifyWebhookSignature(body, null, "hemligt", now), false);
    assert.equal(verifyWebhookSignature(body, "t=abc,v1=zz", "hemligt", now), false);
  });
});

describe("supplierOrderStateSchema", () => {
  it("kräver känd status och giltig tid", () => {
    assert.equal(
      supplierOrderStateSchema.safeParse({ orderNumber: "1", status: "shipped", changedAt: "2026-10-27T12:00:00+01:00" }).success,
      true,
    );
    assert.equal(supplierOrderStateSchema.safeParse({ orderNumber: "1", status: "lost", changedAt: "2026-10-27T12:00:00Z" }).success, false);
    assert.equal(
      supplierOrderStateSchema.safeParse({ orderNumber: "1", status: "shipped", changedAt: "igår", trackingUrl: null }).success,
      false,
    );
  });
});
