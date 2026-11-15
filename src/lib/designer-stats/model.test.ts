import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DESIGNER_STEPS, biggestDropText, funnel } from "./model";

describe("tratten i skyltmotorn", () => {
  it("räknar ett besök till alla steg fram till det längsta", () => {
    // 40 besök öppnade bara, 20 skrev en text, 10 gjorde ett val, 6 öppnade kassan, 2 skickade, 2 fick ordern mottagen.
    const result = funnel([40, 20, 10, 6, 2, 2]);
    assert.equal(result.visits, 80);
    assert.deepEqual(result.steps.map((step) => step.visits), [80, 40, 20, 10, 4, 2]);
    assert.deepEqual(result.steps.map((step) => step.keptPercent), [null, 50, 50, 50, 40, 50]);
    assert.deepEqual(result.steps.map((step) => step.step), [...DESIGNER_STEPS]);
    assert.equal(result.enough, true);
  });

  it("pekar ut övergången där flest besök försvinner", () => {
    const result = funnel([10, 8, 62, 6, 2, 2]);
    assert.deepEqual(result.biggestDrop, { from: "choice", to: "checkout", left: 62, of: 72 });
    assert.equal(biggestDropText(result.biggestDrop!), "Flest lämnar mellan Val gjort och Kassan öppnad: 62 av 72.");
    // Lika stora tapp: det första gäller.
    assert.deepEqual(funnel([5, 5, 0, 0, 0, 3]).biggestDrop, { from: "open", to: "text", left: 5, of: 13 });
  });

  it("tål att ett besök hoppar över ett steg", () => {
    // Alla öppnade kassan direkt utan att ändra något: stegen före har lika många besök.
    const result = funnel([0, 0, 0, 12, 0, 0]);
    assert.deepEqual(result.steps.map((step) => step.visits), [12, 12, 12, 12, 0, 0]);
    assert.deepEqual(result.biggestDrop, { from: "checkout", to: "submitted", left: 12, of: 12 });
    assert.deepEqual(result.steps.map((step) => step.keptPercent), [null, 100, 100, 100, 0, null]);
  });

  it("säger ifrån när besöken är för få, och har inget tapp utan besök eller när alla går hela vägen", () => {
    assert.equal(funnel([5, 2, 1, 1, 0, 0]).enough, false);
    assert.equal(funnel([5, 2, 1, 1, 0, 1]).enough, true);
    const empty = funnel([]);
    assert.equal(empty.visits, 0);
    assert.equal(empty.biggestDrop, null);
    assert.equal(empty.enough, false);
    assert.equal(funnel([0, 0, 0, 0, 0, 15]).biggestDrop, null);
    // Skräp räknas som noll.
    assert.equal(funnel([-3, 2.9, Number.NaN]).visits, 2);
  });
});
