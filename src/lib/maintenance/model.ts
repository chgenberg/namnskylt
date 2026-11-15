/**
 * Rena regler för driften: vad som sparas om ett fel på servern och när ett
 * bakgrundsjobb ska köras. Ingen databas och inget Node här, så att reglerna
 * går att testa för sig.
 */

export const ERROR_MESSAGE_MAX = 500;
export const ERROR_DETAIL_MAX = 2000;
const ERROR_ROUTE_MAX = 200;
const ERROR_SOURCE_MAX = 80;
const ERROR_DIGEST_MAX = 100;
/** Så länge ligger ett fel kvar i loggen. */
export const ERROR_KEEP_DAYS = 30;
/** Fler rader än så här sparas aldrig, hur många fel som än kommer. */
export const ERROR_KEEP_ROWS = 2000;

/** Ett fel så som det sparas i `error_log`. */
export interface ErrorEntry {
  /** Varifrån felet kom: `request` eller `job:<namn>`. */
  source: string;
  /** Ruttens mönster, t.ex. `/offert/[token]`. Aldrig den verkliga sökvägen. */
  route: string | null;
  message: string;
  /** Stacken, avkortad. */
  detail: string | null;
  digest: string | null;
}

/** Ett sparat fel, som driftsidan visar det. */
export interface LoggedError extends ErrorEntry {
  id: number;
  at: string;
}

const EMAIL = /[^\s@<>()"']+@[^\s@<>()"']+\.[a-z]{2,}/gi;

function cut(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** E-postadresser hör inte hemma i en fellogg, även om ett felmeddelande råkar bära en. */
function withoutAddresses(value: string): string {
  return value.replace(EMAIL, "[e-post]");
}

/**
 * Det som sparas om ett fel: meddelandet och stacken, avkortade och utan
 * e-postadresser. Rutten är mönstret och inget annat, så frågesträngen kapas om
 * någon skulle skicka med den.
 */
export function errorEntry(source: string, error: unknown, route?: string | null): ErrorEntry {
  const isError = error instanceof Error;
  const rawMessage = isError ? error.message : typeof error === "string" ? error : "Okänt fel";
  const message = cut(withoutAddresses(rawMessage.replace(/\s+/g, " ").trim()) || "Okänt fel", ERROR_MESSAGE_MAX);
  const stack = isError && typeof error.stack === "string" ? error.stack.trim() : "";
  const digest = (error as { digest?: unknown } | null)?.digest;
  const pattern = route?.split(/[?#]/)[0]?.trim();
  return {
    source: cut(source.trim() || "okänd", ERROR_SOURCE_MAX),
    route: pattern ? cut(pattern, ERROR_ROUTE_MAX) : null,
    message,
    detail: stack ? cut(withoutAddresses(stack), ERROR_DETAIL_MAX) : null,
    digest: typeof digest === "string" && digest ? cut(digest, ERROR_DIGEST_MAX) : null,
  };
}

/** Ett bakgrundsjobb som schemat kör med jämna mellanrum. */
export interface Job {
  /** Fast namn: nyckeln för låset och för senaste körningen. Byt det inte i efterhand. */
  name: string;
  /** Det driftsidan kallar jobbet. */
  label: string;
  everyMs: number;
  /** Det jobbet svarar med visas som en kort rad på driftsidan. Kastar jobbet sparas felet. */
  run: () => Promise<unknown>;
}

/** Senaste körningen av ett jobb. */
export interface JobRun {
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  note: string | null;
}

export type JobRuns = Record<string, JobRun>;

const NOTE_MAX = 200;

/** Jobbets svar som en kort rad: text som den är, annat som JSON. */
export function jobNote(result: unknown): string | null {
  if (result === undefined || result === null || result === "") return null;
  if (typeof result === "string") return cut(result, NOTE_MAX);
  if (typeof result === "number" || typeof result === "boolean") return String(result);
  try {
    return cut(JSON.stringify(result) ?? "", NOTE_MAX) || null;
  } catch {
    return null;
  }
}

function isJobRun(value: unknown): value is JobRun {
  if (typeof value !== "object" || value === null) return false;
  const run = value as Record<string, unknown>;
  return (
    typeof run.startedAt === "string" &&
    !Number.isNaN(Date.parse(run.startedAt)) &&
    typeof run.finishedAt === "string" &&
    typeof run.ok === "boolean" &&
    (run.note === null || typeof run.note === "string")
  );
}

/** Körningarna som de ligger i `settings`. Det som inte går att läsa räknas som aldrig kört. */
export function parseJobRuns(value: unknown): JobRuns {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const runs: JobRuns = {};
  for (const [name, run] of Object.entries(value)) {
    if (isJobRun(run)) runs[name] = run;
  }
  return runs;
}

/** Schemat tittar en gång i minuten. Ett jobb får starta så här mycket för tidigt, så att det inte glider en hel minut varje varv. */
export const DUE_SLACK_MS = 20_000;

/** När jobbet ska köras nästa gång. `null` = det har aldrig körts och ska köras nu. */
export function nextRunAt(job: Pick<Job, "everyMs">, last: JobRun | undefined): Date | null {
  return last ? new Date(Date.parse(last.startedAt) + job.everyMs) : null;
}

export function isDue(job: Pick<Job, "everyMs">, last: JobRun | undefined, now: Date): boolean {
  const next = nextRunAt(job, last);
  return next === null || next.getTime() - DUE_SLACK_MS <= now.getTime();
}

/** Jobben som ska köras nu, i listans ordning. */
export function dueJobs<T extends Pick<Job, "name" | "everyMs">>(jobs: readonly T[], runs: JobRuns, now: Date): T[] {
  return jobs.filter((job) => isDue(job, runs[job.name], now));
}

/** Låsets nummer för ett jobb: samma namn ger alltid samma tal, och det ryms i ett heltal i Postgres. */
export function jobLockKey(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(hash) % 2_147_483_647;
}
