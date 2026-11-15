import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DUE_SLACK_MS,
  ERROR_DETAIL_MAX,
  ERROR_MESSAGE_MAX,
  dueJobs,
  errorEntry,
  isDue,
  jobLockKey,
  jobNote,
  nextRunAt,
  parseJobRuns,
  type JobRun,
} from "./model";
import { schedulerEnabled } from "./scheduler";

const MINUTE_MS = 60_000;
const run = (startedAt: string, ok = true): JobRun => ({ startedAt, finishedAt: startedAt, ok, note: null });

describe("felloggens rad", () => {
  it("sparar meddelandet, stacken och ruttens mönster", () => {
    const error = new Error("Kunde inte läsa offerten");
    const entry = errorEntry("request", error, "/offert/[token]");
    assert.equal(entry.source, "request");
    assert.equal(entry.route, "/offert/[token]");
    assert.equal(entry.message, "Kunde inte läsa offerten");
    assert.ok(entry.detail?.includes("Kunde inte läsa offerten"));
    assert.equal(entry.digest, null);
  });

  it("kortar långa meddelanden och stackar", () => {
    const error = new Error("x".repeat(5000));
    error.stack = `Error: ${"y".repeat(10_000)}`;
    const entry = errorEntry("request", error);
    assert.equal(entry.message.length, ERROR_MESSAGE_MAX);
    assert.ok(entry.message.endsWith("…"));
    assert.equal(entry.detail?.length, ERROR_DETAIL_MAX);
    assert.equal(entry.route, null);
  });

  it("tar bort e-postadresser ur meddelande och stack", () => {
    const error = new Error("Kunden anna.lind@example.se finns redan");
    error.stack = "Error: Kunden anna.lind@example.se finns redan\n    at spara (order.ts:1:1)";
    const entry = errorEntry("request", error);
    assert.equal(entry.message, "Kunden [e-post] finns redan");
    assert.ok(!entry.detail?.includes("example.se"));
  });

  it("kapar frågesträngen om rutten skulle bära en", () => {
    assert.equal(errorEntry("request", new Error("fel"), "/skapa?t=Anna%20Lind#top").route, "/skapa");
  });

  it("tar med felets kod och klarar det som inte är ett Error", () => {
    const error = Object.assign(new Error("fel"), { digest: "1234567890" });
    assert.equal(errorEntry("request", error).digest, "1234567890");
    assert.equal(errorEntry("job:städning", "bara en text").message, "bara en text");
    assert.deepEqual(errorEntry("", { konstigt: true }), { source: "okänd", route: null, message: "Okänt fel", detail: null, digest: null });
  });

  it("gör meddelandet till en rad", () => {
    assert.equal(errorEntry("request", new Error("rad ett\n   rad två")).message, "rad ett rad två");
  });
});

describe("bakgrundsjobbens schema", () => {
  const every10 = { name: "var-tionde", everyMs: 10 * MINUTE_MS };
  const daily = { name: "dagligen", everyMs: 24 * 60 * MINUTE_MS };
  const now = new Date("2026-11-15T12:00:00Z");

  it("ett jobb som aldrig körts ska köras nu", () => {
    assert.equal(nextRunAt(every10, undefined), null);
    assert.equal(isDue(every10, undefined, now), true);
  });

  it("ett jobb väntar tills tiden har gått, med lite marginal för minutvarvet", () => {
    assert.equal(isDue(every10, run("2026-11-15T11:55:00Z"), now), false);
    assert.equal(isDue(every10, run("2026-11-15T11:50:00Z"), now), true);
    // Strax före hela tiden räknas som dags, annars glider jobbet en minut varje varv.
    const almost = new Date(now.getTime() - 10 * MINUTE_MS + DUE_SLACK_MS - 1000).toISOString();
    assert.equal(isDue(every10, run(almost), now), true);
    assert.equal(nextRunAt(every10, run("2026-11-15T11:55:00Z"))?.toISOString(), "2026-11-15T12:05:00.000Z");
  });

  it("väljer jobben som det är dags för, i listans ordning, även när förra körningen misslyckades", () => {
    const runs = { "var-tionde": run("2026-11-15T11:40:00Z", false), dagligen: run("2026-11-15T03:00:00Z") };
    assert.deepEqual(dueJobs([every10, daily], runs, now), [every10]);
    assert.deepEqual(dueJobs([daily, every10], {}, now), [daily, every10]);
  });

  it("läser sparade körningar och hoppar över det som inte går att tolka", () => {
    const good = run("2026-11-15T11:40:00Z");
    assert.deepEqual(parseJobRuns({ a: good, b: { startedAt: "inte en tid", finishedAt: "x", ok: true, note: null }, c: "skräp" }), { a: good });
    assert.deepEqual(parseJobRuns(null), {});
    assert.deepEqual(parseJobRuns([good]), {});
  });

  it("gör jobbets svar till en kort rad", () => {
    assert.equal(jobNote("3 rader borttagna"), "3 rader borttagna");
    assert.equal(jobNote({ images: 2, originals: 0 }), '{"images":2,"originals":0}');
    assert.equal(jobNote(7), "7");
    assert.equal(jobNote(undefined), null);
    assert.equal(jobNote("x".repeat(500))?.length, 200);
  });

  it("ger varje jobb ett eget, fast låsnummer som ryms i ett heltal", () => {
    assert.equal(jobLockKey("dispatch-retry"), jobLockKey("dispatch-retry"));
    assert.notEqual(jobLockKey("dispatch-retry"), jobLockKey("error-log-prune"));
    for (const name of ["dispatch-retry", "error-log-prune", "", "ett-mycket-långt-namn-på-ett-jobb-som-ingen-har-skrivit-än"]) {
      const key = jobLockKey(name);
      assert.ok(Number.isInteger(key) && key >= 0 && key < 2_147_483_647, name);
    }
  });

  it("körs bara med databas och aldrig medan sajten byggs", () => {
    assert.equal(schedulerEnabled({ DATABASE_URL: "postgres://localhost/x" }), true);
    assert.equal(schedulerEnabled({}), false);
    assert.equal(schedulerEnabled({ DATABASE_URL: "postgres://localhost/x", NEXT_PHASE: "phase-production-build" }), false);
  });
});
