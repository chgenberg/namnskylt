import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ESTIMATE_CEILING_PERCENT,
  clampPercent,
  estimatedPercent,
  stepIndexAt,
  timedPercent,
  type ProgressStep,
} from "./estimate";

test("estimatedPercent börjar på noll, växer och når aldrig 100", () => {
  assert.equal(estimatedPercent(0, 10_000), 0);
  const samples = [500, 2_000, 5_000, 10_000, 30_000, 600_000].map((ms) => estimatedPercent(ms, 10_000));
  samples.forEach((value, i) => {
    if (i > 0) assert.ok(value > (samples[i - 1] ?? 0), "ska växa");
    assert.ok(value < ESTIMATE_CEILING_PERCENT + 1e-9);
  });
  assert.ok(Math.abs(estimatedPercent(10_000, 10_000) - 80) < 0.5, "≈80 % vid förväntad tid");
});

test("estimatedPercent tål konstiga indata", () => {
  assert.equal(estimatedPercent(-5, 1000), 0);
  assert.equal(estimatedPercent(1000, 0), 0);
});

test("timedPercent är linjär och stannar under taket", () => {
  assert.equal(timedPercent(3_000, 6_000), 50);
  assert.equal(timedPercent(60_000, 6_000), ESTIMATE_CEILING_PERCENT);
  assert.equal(timedPercent(1, 0), ESTIMATE_CEILING_PERCENT);
});

test("clampPercent", () => {
  assert.equal(clampPercent(140), 100);
  assert.equal(clampPercent(-3), 0);
  assert.equal(clampPercent(Number.NaN), 0);
});

test("stepIndexAt väljer det senast påbörjade steget", () => {
  const steps: ProgressStep[] = [
    [0, "Öppnar"],
    [30, "Letar"],
    [70, "Klart snart"],
  ];
  assert.equal(stepIndexAt(steps, 0), 0);
  assert.equal(stepIndexAt(steps, 29.9), 0);
  assert.equal(stepIndexAt(steps, 30), 1);
  assert.equal(stepIndexAt(steps, 100), 2);
  assert.equal(stepIndexAt([], 50), -1);
});
