import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatDate, formatDay, formatRelative, formatSek } from "./index";

describe("formatSek", () => {
  test("tusental grupperas och enheten står sist", () => {
    assert.match(formatSek(1234), /^1\s234 kr$/);
    assert.equal(formatSek(95), "95 kr");
  });
});

describe("datum i svensk tid", () => {
  test("dagen räknas i Stockholm, inte i UTC", () => {
    assert.match(formatDay("2026-03-01T23:30:00Z"), /^2 mars 2026$/);
  });

  test("klockslaget följer med i den korta formen", () => {
    assert.match(formatDate("2026-06-15T10:05:00Z"), /^15 juni 12:05$/);
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-03-02T08:00:00Z");

  test("samma svenska dygn är i dag, även när UTC-datumet skiljer", () => {
    assert.equal(formatRelative("2026-03-01T23:30:00Z", now), "i dag");
  });

  test("går från dagar till veckor till datum", () => {
    assert.equal(formatRelative("2026-03-01T10:00:00Z", now), "i går");
    assert.equal(formatRelative("2026-02-25T10:00:00Z", now), "för 5 dagar sedan");
    assert.equal(formatRelative("2026-02-09T10:00:00Z", now), "för 3 veckor sedan");
    assert.match(formatRelative("2025-11-20T10:00:00Z", now), /^20 nov\.? 2025$/);
  });
});
