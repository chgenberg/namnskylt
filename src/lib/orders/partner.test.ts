import assert from "node:assert/strict";
import { test } from "node:test";
import { createBadgeDocument } from "@/engine";
import { partnerRequestNumber, splitByProducer } from "./partner";

test("splitByProducer skickar bara verkstadens material till leverantörs-API:t", () => {
  const brass = createBadgeDocument();
  const plastic = { ...createBadgeDocument(), materialId: "plastic-2-layer" as const, colorId: "white-black" };
  const steel = { ...createBadgeDocument(), materialId: "stainless" as const, colorId: "steel-laser" };

  const split = splitByProducer([brass, plastic, steel]);

  assert.deepEqual(split.partner, [brass]);
  assert.deepEqual(split.workshop, [plastic, steel]);
});

test("partnerRequestNumber är stabilt för en given tidpunkt", () => {
  assert.equal(partnerRequestNumber(1_700_000_000_000), "QB-LOYW3V28");
});
