import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import { requireDb } from "@/lib/db/client";
import { logServerError } from "./error-log";
import type { Job } from "./model";
import { runDueJobs, runJob } from "./scheduler";
import { countErrors, deleteAllErrors, deleteJobRun, insertError, pruneErrors, selectErrors, selectJobRuns, upsertJobRun } from "./store";

/** Körs bara mot en riktig databas med migreringen `024_…` (tabellen `error_log`). */
const url = process.env.DATABASE_URL;
const ROLLBACK = new Error("rulla tillbaka");
const MINUTE_MS = 60_000;

describe("felloggen och bakgrundsjobben i databasen", { skip: !url }, () => {
  const id = randomUUID().slice(0, 8);
  const source = `test:${id}`;
  const jobName = (name: string) => `test-${id}-${name}`;
  const job = (name: string, run: Job["run"], everyMs = 10 * MINUTE_MS): Job => ({ name: jobName(name), label: name, everyMs, run });
  const used = ["klart", "trasigt", "långsamt", "upptaget", "a", "b"].map(jobName);

  after(async () => {
    const sql = requireDb();
    await sql`delete from error_log where source = ${source} or source like ${`job:test-${id}-%`}`;
    for (const name of used) await deleteJobRun(sql, name);
    await sql.end();
  });

  test("ett fel sparas med ruttens mönster och kastar aldrig", async () => {
    await logServerError(source, new Error("Offerten gick inte att läsa"), "/offert/[token]?kod=hemlig");
    // Next anmäler samma fel två gånger för en sida som kastar. Det sparas en gång.
    await logServerError(source, new Error("Offerten gick inte att läsa"), "/offert/[token]");
    await logServerError(source, new Error("Ett annat fel"), "/offert/[token]");
    const rows = await requireDb()<{ route: string; message: string; detail: string | null }[]>`
      select route, message, detail from error_log where source = ${source} order by id`;
    assert.deepEqual(
      rows.map((found) => found.message),
      ["Offerten gick inte att läsa", "Ett annat fel"],
    );
    const row = rows[0];
    assert.equal(row?.route, "/offert/[token]");
    assert.equal(row?.message, "Offerten gick inte att läsa");
    assert.ok(row?.detail?.includes("Offerten gick inte att läsa"));
  });

  test("rensningen tar bort gamla fel och håller antalet under taket", async () => {
    await requireDb()
      .begin(async (tx) => {
        await deleteAllErrors(tx);
        for (let i = 1; i <= 5; i++) await insertError(tx, { source, route: null, message: `fel ${i}`, detail: null, digest: null });
        await tx`insert into error_log (at, source, message) values (now() - interval '31 days', ${source}, 'gammalt fel')`;
        assert.equal(await countErrors(tx), 6);
        // Det gamla felet försvinner för åldern, och av de fem nya blir de tre senaste kvar.
        assert.equal(await pruneErrors(tx, 30, 3), 3);
        assert.deepEqual(
          (await selectErrors(tx, 10)).map((error) => error.message),
          ["fel 5", "fel 4", "fel 3"],
        );
        // Under taket tas ingenting bort.
        assert.equal(await pruneErrors(tx, 30, 3), 0);
        assert.equal(await deleteAllErrors(tx), 3);
        throw ROLLBACK;
      })
      .catch((error) => {
        if (error !== ROLLBACK) throw error;
      });
  });

  test("ett jobbs körning sparas utan att röra de andra jobbens", async () => {
    const sql = requireDb();
    const first = { startedAt: "2026-11-15T10:00:00.000Z", finishedAt: "2026-11-15T10:00:01.000Z", ok: true, note: "ett" };
    const second = { startedAt: "2026-11-15T11:00:00.000Z", finishedAt: "2026-11-15T11:00:02.000Z", ok: false, note: null };
    await upsertJobRun(sql, jobName("a"), first);
    await upsertJobRun(sql, jobName("b"), second);
    await upsertJobRun(sql, jobName("a"), { ...first, note: "ett igen" });
    const runs = await selectJobRuns(sql);
    assert.deepEqual(runs[jobName("a")], { ...first, note: "ett igen" });
    assert.deepEqual(runs[jobName("b")], second);
  });

  test("ett jobb körs, sparar sitt svar och körs inte igen förrän det är dags", async () => {
    let calls = 0;
    const counting = job("klart", async () => {
      calls++;
      return { borttagna: 2 };
    });
    assert.equal(await runJob(counting), "ok");
    const saved = (await selectJobRuns(requireDb()))[counting.name];
    assert.equal(saved?.ok, true);
    assert.equal(saved?.note, '{"borttagna":2}');
    // Samma jobb direkt igen: någon har redan kört det.
    assert.equal(await runJob(counting), "fresh");
    assert.equal(calls, 1);
    assert.equal(await runJob(counting, { force: true }), "ok");
    assert.equal(calls, 2);
  });

  test("ett jobb som kastar sparas som misslyckat och hamnar i felloggen", async () => {
    const broken = job("trasigt", async () => {
      throw new Error("Verkstaden svarade inte");
    });
    assert.equal(await runJob(broken), "failed");
    const saved = (await selectJobRuns(requireDb()))[broken.name];
    assert.equal(saved?.ok, false);
    assert.equal(saved?.note, "Verkstaden svarade inte");
    const [row] = await requireDb()<{ message: string }[]>`select message from error_log where source = ${`job:${broken.name}`}`;
    assert.equal(row?.message, "Verkstaden svarade inte");
  });

  test("ett jobb som inte blir klart avbryts och räknas som misslyckat", async () => {
    const slow = job("långsamt", () => new Promise<void>((resolve) => setTimeout(resolve, 2000).unref()));
    assert.equal(await runJob(slow, { timeoutMs: 50 }), "failed");
    assert.match((await selectJobRuns(requireDb()))[slow.name]?.note ?? "", /blev inte klart/);
  });

  test("samma jobb körs aldrig två gånger samtidigt", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started: () => void = () => undefined;
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    const locked = job("upptaget", async () => {
      started();
      await held;
    });
    const first = runJob(locked);
    await running;
    assert.equal(await runJob(locked, { force: true }), "busy");
    release();
    assert.equal(await first, "ok");
  });

  test("ett varv kör alla jobb som det är dags för, även när ett av dem går fel", async () => {
    const sql = requireDb();
    for (const name of ["trasigt", "klart"]) await deleteJobRun(sql, jobName(name));
    const order: string[] = [];
    const jobs = [
      job("trasigt", async () => {
        order.push("trasigt");
        throw new Error("fel i första jobbet");
      }),
      job("klart", async () => {
        order.push("klart");
        return "klart";
      }),
    ];
    assert.deepEqual(await runDueJobs(jobs), { [jobName("trasigt")]: "failed", [jobName("klart")]: "ok" });
    assert.deepEqual(order, ["trasigt", "klart"]);
    // Nästa minutvarv: inget är dags, inte heller jobbet som gick fel.
    assert.deepEqual(await runDueJobs(jobs), {});
    // Tio minuter senare är båda dags igen.
    assert.deepEqual(await runDueJobs(jobs, new Date(Date.now() + 10 * MINUTE_MS)), { [jobName("trasigt")]: "failed", [jobName("klart")]: "ok" });
    assert.deepEqual(order, ["trasigt", "klart", "trasigt", "klart"]);
  });
});
