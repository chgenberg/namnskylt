import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { funnelFromRows, stageRate, type FunnelInput } from "./funnel";

const row = (over: Partial<FunnelInput> = {}): FunnelInput => ({
  wave: "A",
  sent: true,
  delivered: true,
  landed: false,
  demoOpened: false,
  attributed: false,
  orders: [],
  ...over,
});

describe("funnelFromRows", () => {
  test("räknar varje steg", () => {
    const funnel = funnelFromRows([
      row(),
      row({ landed: true, demoOpened: true }),
      row({ landed: true, demoOpened: true, attributed: true, orders: [{ isDemo: false, source: "shop" }] }),
    ]);
    assert.deepEqual(funnel, { sent: 3, delivered: 3, landed: 2, demoOpened: 2, attributed: 1, firstOrder: 1 });
  });

  test("demoorder och återförsäljarens egen order är ingen första order", () => {
    const funnel = funnelFromRows([
      row({ attributed: true, orders: [{ isDemo: true, source: "shop" }] }),
      row({ attributed: true, orders: [{ isDemo: false, source: "reseller" }] }),
    ]);
    assert.equal(funnel.firstOrder, 0);
    assert.equal(funnel.attributed, 2);
  });

  test("den interna vågen hålls utanför", () => {
    assert.equal(funnelFromRows([row({ wave: "internal" }), row()]).sent, 1);
  });

  test("order utan aktivering räknas inte", () => {
    assert.equal(funnelFromRows([row({ orders: [{ isDemo: false, source: "shop" }] })]).firstOrder, 0);
  });
});

describe("stageRate", () => {
  test("andel av steget före", () => {
    const funnel = funnelFromRows([row(), row({ landed: true })]);
    assert.equal(stageRate(funnel, "landed"), 50);
    assert.equal(stageRate(funnel, "sent"), null);
    assert.equal(stageRate({ ...funnel, delivered: 0 }, "landed"), null);
  });
});
