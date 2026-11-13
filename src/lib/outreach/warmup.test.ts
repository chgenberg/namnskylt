import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  addBusinessDays,
  effectiveDailyCap,
  isInSendWindow,
  nextWindowOpen,
  pauseDecision,
  retryAfterSeconds,
  stockholmDayStart,
  swedishHolidays,
  warmupCap,
  type DeliveryEvent,
} from "./warmup";

const at = (iso: string) => new Date(iso);
const DAY_MS = 24 * 60 * 60 * 1000;

describe("Stockholmsdygn och fönster", () => {
  test("dygnet börjar vid lokal midnatt på båda sidor om tidsomställningen", () => {
    assert.equal(stockholmDayStart(at("2026-03-29T12:00:00Z")).toISOString(), "2026-03-28T23:00:00.000Z");
    assert.equal(stockholmDayStart(at("2026-03-30T12:00:00Z")).toISOString(), "2026-03-29T22:00:00.000Z");
    assert.equal(stockholmDayStart(at("2026-10-25T12:00:00Z")).toISOString(), "2026-10-24T22:00:00.000Z");
    assert.equal(stockholmDayStart(at("2026-10-26T12:00:00Z")).toISOString(), "2026-10-25T23:00:00.000Z");
  });

  test("fönstret öppnar 08:30 lokal tid i både sommar- och vintertid", () => {
    assert.equal(isInSendWindow(at("2026-03-27T07:29:00Z")), false);
    assert.equal(isInSendWindow(at("2026-03-27T07:30:00Z")), true);
    assert.equal(isInSendWindow(at("2026-03-30T06:29:00Z")), false);
    assert.equal(isInSendWindow(at("2026-03-30T06:30:00Z")), true);
    assert.equal(isInSendWindow(at("2026-10-23T06:30:00Z")), true);
    assert.equal(isInSendWindow(at("2026-10-26T06:30:00Z")), false);
    assert.equal(isInSendWindow(at("2026-10-26T07:30:00Z")), true);
  });

  test("fredag 15:59 är öppet och 16:00 stänger till måndag", () => {
    assert.equal(isInSendWindow(at("2026-11-13T14:59:00Z")), true);
    assert.equal(isInSendWindow(at("2026-11-13T15:00:00Z")), false);
    assert.equal(nextWindowOpen(at("2026-11-13T15:00:00Z")).toISOString(), "2026-11-16T07:30:00.000Z");
  });

  test("lördag är stängt", () => {
    assert.equal(isInSendWindow(at("2026-11-14T10:00:00Z")), false);
    assert.equal(retryAfterSeconds(at("2026-11-16T07:00:00Z")), 30 * 60);
  });

  test("trettondagen är stängd och nästa öppning är dagen efter", () => {
    assert.equal(isInSendWindow(at("2026-01-06T09:00:00Z")), false);
    assert.equal(nextWindowOpen(at("2026-01-06T09:00:00Z")).toISOString(), "2026-01-07T07:30:00.000Z");
  });

  test("påsk, Kristi himmelsfärd och midsommarafton 2026", () => {
    const days = swedishHolidays(2026);
    for (const day of ["2026-04-03", "2026-04-06", "2026-05-14", "2026-06-19", "2026-12-24", "2026-12-31"]) {
      assert.ok(days.has(day), day);
    }
    assert.equal(days.has("2026-04-07"), false);
  });

  test("öppet fönster ger samma ögonblick tillbaka", () => {
    const now = at("2026-11-10T10:00:00Z");
    assert.equal(nextWindowOpen(now), now);
    assert.equal(retryAfterSeconds(now), 0);
  });

  test("fem vardagar hoppar över julhelgen", () => {
    assert.equal(addBusinessDays(at("2026-12-18T09:00:00Z"), 5).toISOString(), "2026-12-29T09:00:00.000Z");
  });
});

describe("uppvärmning", () => {
  const first = at("2026-01-12T08:00:00Z");
  const day = (n: number) => new Date(first.getTime() + n * DAY_MS);

  test("utan riktig sändning är det intern vecka med bara allowlist", () => {
    const step = warmupCap(null, first);
    assert.equal(step.week, 0);
    assert.equal(step.perDay, null);
    assert.deepEqual(step.waves, ["internal"]);
  });

  test("dag 1, 8 och 29 i rampen", () => {
    assert.equal(warmupCap(first, day(1)).perDay, null);
    assert.equal(warmupCap(first, day(8)).perDay, 8);
    assert.ok(warmupCap(first, day(8)).waves.includes("A"));
    assert.equal(warmupCap(first, day(29)).perDay, 40);
    assert.ok(warmupCap(first, day(29)).waves.includes("C"));
    assert.equal(warmupCap(first, day(40)).perDay, 60);
    assert.equal(warmupCap(first, day(400)).perDay, 80);
    assert.equal(warmupCap(first, day(40)).waves.includes("NO"), false);
  });

  test("kampanjens tak sänker men höjer aldrig", () => {
    assert.equal(effectiveDailyCap(warmupCap(first, day(8)), 200), 8);
    assert.equal(effectiveDailyCap(warmupCap(first, day(29)), 30), 30);
    assert.equal(effectiveDailyCap(warmupCap(first, day(1)), 30), null);
  });
});

describe("pausregler", () => {
  const now = at("2026-11-10T14:00:00Z");
  const ctx = { now, realSentTotal: 50, realSentLast7Days: 30 };
  const event = (type: DeliveryEvent["type"], hoursAgo: number, messageId = `m-${hoursAgo}-${type}`): DeliveryEvent => ({
    type,
    messageId,
    at: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000),
  });

  test("inga händelser ger ingen paus", () => {
    assert.deepEqual(pauseDecision([event("delivered", 1)], ctx), { pause: false });
  });

  test("ett klagomål pausar", () => {
    assert.equal(pauseDecision([event("complained", 2)], ctx).pause, true);
  });

  test("två hårda studsar samma dygn pausar, på olika dygn inte", () => {
    assert.equal(pauseDecision([event("bounced_hard", 1), event("bounced_hard", 2)], ctx).pause, true);
    assert.equal(pauseDecision([event("bounced_hard", 1), event("bounced_hard", 30)], ctx).pause, false);
    assert.equal(pauseDecision([event("bounced_soft", 1), event("bounced_soft", 2)], ctx).pause, false);
  });

  test("tre hårda studsar på sju dygn pausar", () => {
    const events = [event("bounced_hard", 1), event("bounced_hard", 30), event("bounced_hard", 60)];
    assert.equal(pauseDecision(events, ctx).pause, true);
  });

  test("gamla händelser räknas inte", () => {
    assert.equal(pauseDecision([event("complained", 24 * 8)], ctx).pause, false);
  });

  test("fem försenade utan leverans efter 12 h pausar", () => {
    const delayed = Array.from({ length: 5 }, (_, i) => event("delivery_delayed", 13, `m${i}`));
    assert.equal(pauseDecision(delayed, ctx).pause, true);
    assert.equal(pauseDecision([...delayed, event("delivered", 1, "m0")], ctx).pause, false);
    const fresh = Array.from({ length: 5 }, (_, i) => event("delivery_delayed", 2, `m${i}`));
    assert.equal(pauseDecision(fresh, ctx).pause, false);
  });

  test("domänfel pausar", () => {
    assert.equal(pauseDecision([event("domain_error", 1, "x")], ctx).pause, true);
  });

  test("efter 200 utskick gäller procent", () => {
    const big = { now, realSentTotal: 600, realSentLast7Days: 400 };
    const bounces = (n: number) => Array.from({ length: n }, (_, i) => event("bounced_hard", 1, `b${i}`));
    assert.equal(pauseDecision(bounces(7), big).pause, false);
    assert.equal(pauseDecision(bounces(8), big).pause, true);
    assert.equal(pauseDecision([event("complained", 1)], big).pause, true);
  });
});
