import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MIGRATIONS } from "../db/migrations";
import {
  canTransitionMessage,
  COUNTRIES,
  idempotencyKey,
  LEAD_STATUSES,
  MESSAGE_STATUSES,
  type MessageStatus,
  normalizeEmail,
  outreachBrandSchema,
  relationSegment,
  STOP_REASONS,
  SUPPRESSION_REASONS,
  SUPPRESSION_SOURCES,
  WAVES,
} from "./model";

const outreachSql = MIGRATIONS.find((m) => m.id === "013_outreach")?.sql ?? "";

describe("migreringen och modellen är samma sak", () => {
  test("migreringen finns", () => assert.ok(outreachSql.length > 0));

  for (const [name, values] of Object.entries({
    LEAD_STATUSES,
    MESSAGE_STATUSES,
    STOP_REASONS,
    SUPPRESSION_REASONS,
    SUPPRESSION_SOURCES,
    WAVES,
    COUNTRIES,
  })) {
    test(`varje värde i ${name} står i ett check-villkor`, () => {
      for (const value of values) assert.ok(outreachSql.includes(`'${value}'`), `${name}: ${value} saknas`);
    });
  }
});

describe("meddelandets tillståndsmaskin", () => {
  const allowed: [MessageStatus, MessageStatus][] = [
    ["scheduled", "ready"],
    ["ready", "sending"],
    ["sending", "sent"],
    ["sending", "failed"],
    ["sending", "needs_review"],
    ["sending", "ready"],
    ["failed", "ready"],
    ["sent", "delivered"],
    ["sent", "bounced"],
    ["delivered", "complained"],
  ];
  for (const [from, to] of allowed) {
    test(`${from} → ${to} är tillåtet`, () =>
      assert.equal(canTransitionMessage(from, to), true));
  }

  const forbidden: [MessageStatus, MessageStatus][] = [
    ["scheduled", "sent"],
    ["ready", "sent"],
    ["sent", "ready"],
    ["bounced", "delivered"],
    ["needs_review", "ready"],
    ["cancelled", "ready"],
    ["delivered", "sent"],
  ];
  for (const [from, to] of forbidden) {
    test(`${from} → ${to} är förbjudet`, () =>
      assert.equal(canTransitionMessage(from, to), false));
  }

  test("slutlägen leder ingenstans", () => {
    for (const end of ["bounced", "complained", "needs_review", "cancelled", "skipped"] as const) {
      for (const to of MESSAGE_STATUSES) assert.equal(canTransitionMessage(end, to), false);
    }
  });
});

describe("relationssegmentet", () => {
  test("alla fyra kombinationer", () => {
    assert.equal(relationSegment({ activated: true, known: true }), "activated-known");
    assert.equal(relationSegment({ activated: true, known: false }), "activated-unknown");
    assert.equal(relationSegment({ activated: false, known: true }), "inactive-known");
    assert.equal(relationSegment({ activated: false, known: false }), "inactive-unknown");
  });
});

describe("hjälpare", () => {
  test("idempotensnyckeln är stabil per steg", () => {
    assert.equal(idempotencyKey("c", "l", 1), "outreach:c:l:1");
    assert.notEqual(idempotencyKey("c", "l", 1), idempotencyKey("c", "l", 2));
  });

  test("e-post normaliseras", () => assert.equal(normalizeEmail("  Anna@Firma.SE "), "anna@firma.se"));

  test("varumärket vägrar loggor som data-URL", () => {
    const base = { colors: [], industry: null, scrapedFrom: null, scrapedAt: null };
    assert.equal(outreachBrandSchema.safeParse({ ...base, logoUrl: "data:image/png;base64,AAAA" }).success, false);
    assert.equal(outreachBrandSchema.safeParse({ ...base, logoUrl: "https://firma.se/logo.png" }).success, true);
  });
});
