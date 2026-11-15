import "server-only";
import { requireDb } from "@/lib/db/client";
import { logServerError } from "./error-log";
import { dueJobs, isDue, jobLockKey, jobNote, type Job, type JobRun, type JobRuns } from "./model";
import { selectJobRuns, upsertJobRun } from "./store";

/** Så ofta schemat tittar efter jobb som ska köras. */
const TICK_MS = 60_000;
/** Första varvet väntar tills servern har hunnit starta. */
const FIRST_TICK_MS = 30_000;
/** Ett jobb som inte blir klart får inte stoppa schemat för gott. */
const JOB_TIMEOUT_MS = 5 * 60_000;
/** Första talet i låset. Det andra är jobbets eget (`jobLockKey`). */
const LOCK_CLASS = 20261115;

const STARTED = Symbol.for("namnskylt.maintenance.scheduler");

type Env = Record<string, string | undefined>;

/** Schemat körs bara på en riktig server med databas, aldrig medan sajten byggs. */
export function schedulerEnabled(env: Env = process.env): boolean {
  return Boolean(env.DATABASE_URL) && env.NEXT_PHASE !== "phase-production-build";
}

export type JobOutcome = "ok" | "failed" | "busy" | "fresh";

function withTimeout<T>(work: Promise<T>, ms: number, name: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Jobbet ${name} blev inte klart inom ${Math.round(ms / 60_000)} minuter`)), ms);
    timer.unref();
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Kör ett jobb under dess lås i Postgres, så att två instanser aldrig kör samma
 * jobb samtidigt. `busy` = någon annan kör det just nu. `fresh` = någon annan
 * hann köra det medan vi väntade. Ett jobb som kastar sparas i felloggen och
 * räknas som kört, så att det inte provas om varje minut.
 */
export async function runJob(job: Job, options: { force?: boolean; timeoutMs?: number; now?: Date } = {}): Promise<JobOutcome> {
  // Låset sitter på anslutningen, inte på poolen, så jobbet får en egen.
  const sql = await requireDb().reserve();
  const key = jobLockKey(job.name);
  try {
    const [lock] = await sql<{ locked: boolean }[]>`select pg_try_advisory_lock(${LOCK_CLASS}::int, ${key}::int) as locked`;
    if (lock?.locked !== true) return "busy";
    try {
      const last = (await selectJobRuns(sql))[job.name];
      if (!options.force && !isDue(job, last, options.now ?? new Date())) return "fresh";
      const startedAt = new Date();
      let ok = true;
      let note: string | null;
      try {
        note = jobNote(await withTimeout(job.run(), options.timeoutMs ?? JOB_TIMEOUT_MS, job.name));
      } catch (error) {
        ok = false;
        note = jobNote(error instanceof Error ? error.message : "Okänt fel");
        await logServerError(`job:${job.name}`, error);
      }
      const run: JobRun = { startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), ok, note };
      await upsertJobRun(sql, job.name, run);
      return ok ? "ok" : "failed";
    } finally {
      await sql`select pg_advisory_unlock(${LOCK_CLASS}::int, ${key}::int)`;
    }
  } finally {
    sql.release();
  }
}

/** Kör de jobb som det är dags för, ett i taget. Ett jobb som går fel stoppar inte nästa. */
export async function runDueJobs(jobs: readonly Job[], now: Date = new Date()): Promise<Record<string, JobOutcome>> {
  const runs = await selectJobRuns(requireDb());
  const outcomes: Record<string, JobOutcome> = {};
  for (const job of dueJobs(jobs, runs, now)) {
    try {
      outcomes[job.name] = await runJob(job, { now });
    } catch (error) {
      outcomes[job.name] = "failed";
      await logServerError(`job:${job.name}`, error);
    }
  }
  return outcomes;
}

/** Jobbens senaste körningar, för driftsidan. */
export async function jobRuns(): Promise<JobRuns> {
  return selectJobRuns(requireDb());
}

/**
 * Startar schemat i den här processen: en gång i minuten körs de jobb som det
 * är dags för. Startas en enda gång per process, bara med databas och aldrig
 * under bygget. Timern håller inte processen vid liv. `false` = inte startat.
 */
export function startScheduler(jobs: readonly Job[]): boolean {
  if (!schedulerEnabled()) return false;
  const state = globalThis as unknown as Record<symbol, boolean | undefined>;
  if (state[STARTED]) return false;
  state[STARTED] = true;
  let running = false;
  const tick = async () => {
    // Ett varv som drar ut på tiden får inte köra i kapp med nästa.
    if (running) return;
    running = true;
    try {
      await runDueJobs(jobs);
    } catch (error) {
      await logServerError("job:schema", error);
    } finally {
      running = false;
    }
  };
  setTimeout(() => void tick(), FIRST_TICK_MS).unref();
  setInterval(() => void tick(), TICK_MS).unref();
  return true;
}
