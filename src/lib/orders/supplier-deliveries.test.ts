import assert from "node:assert/strict";
import { test } from "node:test";
import { createBadgeDocument, type BadgeDocument } from "@/engine";
import { supplierOrderStateSchema } from "@/lib/supplier/status";
import { deliveryAt, deliveryBadges, deliveryParam, deliveryQuantity, parseSupplierDeliveries, supplierDeliveryLines } from "./supplier-deliveries";

const named = (name: string, quantity = 1): BadgeDocument => ({ ...createBadgeDocument([name]), quantity });

const delivery = (position: number, lines: number[]) => ({
  position,
  name: "Exempel AB",
  contactName: "Anna Lind",
  line1: "Gatan 1",
  line2: null,
  zip: "411 01",
  city: "Göteborg",
  country: "SE",
  phone: "070-000 00 00",
  email: null,
  lines,
  trackingUrl: null,
});

test("rad n i anropet till verkstaden är orderns n:te skylt", () => {
  const badges = [named("Anna"), named("Kalle", 2), named("Maria")];
  assert.deepEqual(
    deliveryBadges(badges, { lines: [3, 1, 3, 9] }).map((badge) => badge.rows[0]?.text),
    ["Anna", "Maria"],
  );
  assert.equal(deliveryQuantity(badges, { lines: [2, 3] }), 3);
});

test("leveranserna läses säkert ur databasen, i ordning", () => {
  assert.deepEqual(parseSupplierDeliveries(null), []);
  assert.deepEqual(parseSupplierDeliveries("trasig"), []);
  const read = parseSupplierDeliveries([delivery(2, [2]), delivery(1, [1])]);
  assert.deepEqual(read.map((d) => d.position), [1, 2]);
  assert.equal(deliveryAt(read, 2)?.lines[0], 2);
  assert.equal(deliveryAt(read, 3), null);
  assert.deepEqual(supplierDeliveryLines(read[0]!), ["Exempel AB", "Att: Anna Lind", "Gatan 1", "411 01 Göteborg", "070-000 00 00"]);
});

test("leveransens nummer i adressen är ett litet heltal", () => {
  assert.equal(deliveryParam(null), null);
  assert.equal(deliveryParam("2"), 2);
  assert.equal(deliveryParam("0"), null);
  assert.equal(deliveryParam("1e3"), null);
  assert.equal(deliveryParam("123"), null);
});

test("verkstadens besked: leveranserna är frivilliga, och en spårning måste vara http eller https", () => {
  const base = { orderNumber: "260124", status: "in_production", changedAt: "2026-11-23T10:00:00Z" };
  const plain = supplierOrderStateSchema.parse(base);
  assert.equal(plain.deliveries, undefined);
  assert.equal(plain.extraDeliveryCost, undefined);
  const split = supplierOrderStateSchema.parse({ ...base, deliveries: [delivery(1, [1]), delivery(2, [2])], extraDeliveryCost: 75 });
  assert.equal(split.deliveries?.length, 2);
  assert.equal(split.extraDeliveryCost, 75);
  const bad = { ...base, deliveries: [{ ...delivery(1, [1]), trackingUrl: "javascript:alert(1)" }] };
  assert.equal(supplierOrderStateSchema.safeParse(bad).success, false);
});
