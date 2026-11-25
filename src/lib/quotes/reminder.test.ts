import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument } from "@/engine";
import { needsReminder, reminderDraft, reminderMailto, type ReminderInput } from "./reminder";

const NOW = new Date("2026-11-24T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

const quote = {
  status: "sent" as const,
  validUntil: "2026-12-08",
  sentAt: daysAgo(4),
  createdAt: daysAgo(5),
  demo: false,
};

const input: ReminderInput = {
  quote: {
    quoteNo: "OF-1042",
    project: "Receptionen",
    validUntil: "2026-12-08",
    sentAt: "2026-11-20T09:00:00Z",
    createdAt: "2026-11-20T08:00:00Z",
    badges: [{ ...createBadgeDocument(["Anna Lind"]), quantity: 3 }, { ...createBadgeDocument(["Erik Holm"]), quantity: 2 }],
    customer: { id: "c1", name: "Maria Berg", company: "Exempel AB", email: "maria@example.com", phone: null, orgNumber: null, address: null, demo: false },
  },
  link: "https://www.namnskylt.com/offert/abc",
  sellerName: "Skyltbolaget AB",
};

describe("påminnelsen", () => {
  it("är dags tre dagar efter att offerten skickades, så länge den gäller", () => {
    assert.equal(needsReminder(quote, NOW), true);
    assert.equal(needsReminder({ ...quote, sentAt: daysAgo(2) }, NOW), false);
    assert.equal(needsReminder({ ...quote, sentAt: daysAgo(3) }, NOW), true);
  });

  it("gäller bara en skickad offert som inte har gått ut och inte är demo", () => {
    for (const status of ["draft", "accepted", "declined", "cancelled"] as const) {
      assert.equal(needsReminder({ ...quote, status }, NOW), false, status);
    }
    assert.equal(needsReminder({ ...quote, validUntil: "2026-11-23" }, NOW), false);
    assert.equal(needsReminder({ ...quote, demo: true }, NOW), false);
    // En offert som kunden laddade ner själv, utan att lägga upp sig.
    assert.equal(needsReminder({ ...quote, noCustomer: true }, NOW), false);
  });

  it("räknar från när offerten skapades när den saknar dag för utskick", () => {
    assert.equal(needsReminder({ ...quote, sentAt: null, createdAt: daysAgo(4) }, NOW), true);
    assert.equal(needsReminder({ ...quote, sentAt: null, createdAt: daysAgo(1) }, NOW), false);
  });

  it("utkastet har förnamnet, vad offerten gäller, sista dagen, länken och säljaren", () => {
    const draft = reminderDraft(input);
    assert.equal(draft.subject, "Offert OF-1042 – Receptionen");
    assert.match(draft.body, /^Hej Maria!/);
    assert.match(draft.body, /5 namnskyltar till Receptionen/);
    assert.match(draft.body, /20 nov\. 2026/);
    assert.match(draft.body, /till och med 8 dec\. 2026/);
    assert.ok(draft.body.includes("https://www.namnskylt.com/offert/abc"));
    assert.ok(draft.body.endsWith("Med vänliga hälsningar\nSkyltbolaget AB"));
  });

  it("hälsar utan namn när kontaktpersonen saknas eller bara är företaget", () => {
    const company = { ...input.quote.customer, name: "Exempel AB" };
    assert.match(reminderDraft({ ...input, quote: { ...input.quote, customer: company } }).body, /^Hej!\n/);
    const empty = { ...input.quote.customer, name: "" };
    assert.match(reminderDraft({ ...input, quote: { ...input.quote, customer: empty, project: null } }).body, /^Hej!\n/);
    assert.equal(reminderDraft({ ...input, quote: { ...input.quote, project: null } }).subject, "Offert OF-1042");
  });

  it("mejllänken har adressen som den är och kodar ämne och text", () => {
    const draft = reminderDraft(input);
    const href = reminderMailto("maria@example.com", draft);
    assert.ok(href.startsWith("mailto:maria@example.com?subject="));
    assert.equal(decodeURIComponent(new URL(href).searchParams.get("body") ?? ""), draft.body);
    assert.ok(reminderMailto("", draft).startsWith("mailto:?subject="));
    assert.ok(reminderMailto("inte en adress?cc=x", draft).startsWith("mailto:?subject="));
  });
});
