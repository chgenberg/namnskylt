import type { Sql, TransactionSql } from "postgres";
import { parseJobRuns, type ErrorEntry, type JobRun, type JobRuns, type LoggedError } from "./model";

type Db = Sql | TransactionSql;
type Json = Parameters<Sql["json"]>[0];

/** Nyckeln i `settings` där jobbens senaste körningar ligger. */
const JOB_RUNS_KEY = "maintenance_jobs";

interface ErrorRow {
  id: string;
  at: Date;
  source: string;
  route: string | null;
  message: string;
  detail: string | null;
  digest: string | null;
}

export async function insertError(sql: Db, entry: ErrorEntry): Promise<void> {
  await sql`insert into error_log (source, route, message, detail, digest)
            values (${entry.source}, ${entry.route}, ${entry.message}, ${entry.detail}, ${entry.digest})`;
}

/** De senaste felen, nyast först. */
export async function selectErrors(sql: Db, limit: number): Promise<LoggedError[]> {
  const rows = await sql<ErrorRow[]>`
    select id, at, source, route, message, detail, digest from error_log order by id desc limit ${limit}`;
  return rows.map((row) => ({
    id: Number(row.id),
    at: row.at.toISOString(),
    source: row.source,
    route: row.route,
    message: row.message,
    detail: row.detail,
    digest: row.digest,
  }));
}

export async function countErrors(sql: Db): Promise<number> {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from error_log`;
  return row?.n ?? 0;
}

/** Tar bort fel äldre än `keepDays` och allt utöver de `keepRows` senaste. Svarar med antalet borttagna. */
export async function pruneErrors(sql: Db, keepDays: number, keepRows: number): Promise<number> {
  const old = await sql`delete from error_log where at < now() - make_interval(days => ${keepDays})`;
  const extra = await sql`
    delete from error_log
     where id <= (select id from error_log order by id desc offset ${keepRows} limit 1)`;
  return old.count + extra.count;
}

export async function deleteAllErrors(sql: Db): Promise<number> {
  return (await sql`delete from error_log`).count;
}

export async function selectJobRuns(sql: Db): Promise<JobRuns> {
  const [row] = await sql<{ value: unknown }[]>`select value from settings where key = ${JOB_RUNS_KEY}`;
  return parseJobRuns(row?.value);
}

/** Sparar ett jobbs senaste körning utan att röra de andra jobbens. */
export async function upsertJobRun(sql: Db, name: string, run: JobRun): Promise<void> {
  const value = sql.json({ [name]: run } as unknown as Json);
  await sql`
    insert into settings (key, value) values (${JOB_RUNS_KEY}, ${value})
    on conflict (key) do update set value = settings.value || excluded.value, updated_at = now()`;
}

/** Tar bort ett jobbs sparade körning. Används av testerna. */
export async function deleteJobRun(sql: Db, name: string): Promise<void> {
  await sql`update settings set value = value - ${name}, updated_at = now() where key = ${JOB_RUNS_KEY}`;
}
