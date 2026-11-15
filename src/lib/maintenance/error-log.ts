import "server-only";
import { db, requireDb } from "@/lib/db/client";
import { ERROR_KEEP_DAYS, ERROR_KEEP_ROWS, errorEntry, type ErrorEntry, type LoggedError } from "./model";
import { countErrors, deleteAllErrors, insertError, pruneErrors, selectErrors } from "./store";

/** Ett fel som upprepas hundratals gånger i minuten ska inte också belasta databasen. */
const MAX_PER_MINUTE = 60;
const MINUTE_MS = 60_000;
let windowStart = 0;
let windowCount = 0;

function roomInWindow(now: number): boolean {
  if (now - windowStart >= MINUTE_MS) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount++;
  return windowCount <= MAX_PER_MINUTE;
}

/** Next anmäler samma fel två gånger när en sida kastar. Samma fel inom några sekunder sparas en gång. */
const SAME_ERROR_MS = 5_000;
const MAX_REMEMBERED = 200;
const lastSeen = new Map<string, number>();

function seenJustNow(entry: ErrorEntry, now: number): boolean {
  const key = `${entry.source}|${entry.route ?? ""}|${entry.digest ?? ""}|${entry.message}`;
  const last = lastSeen.get(key);
  if (lastSeen.size >= MAX_REMEMBERED) lastSeen.clear();
  lastSeen.set(key, now);
  return last !== undefined && now - last < SAME_ERROR_MS;
}

/**
 * Sparar ett fel på servern i felloggen, så att det syns under Drift i panelen.
 * Kastar aldrig: loggen får inte själv bli ett fel. Utan databas händer ingenting.
 * `route` är ruttens mönster (`/offert/[token]`), aldrig den verkliga sökvägen.
 */
export async function logServerError(source: string, error: unknown, route?: string | null): Promise<void> {
  try {
    const sql = db();
    if (!sql) return;
    const now = Date.now();
    const entry = errorEntry(source, error, route);
    if (seenJustNow(entry, now) || !roomInWindow(now)) return;
    await insertError(sql, entry);
  } catch (failure) {
    console.error("Felet kunde inte sparas i felloggen", failure);
  }
}

/** Tar bort fel äldre än 30 dagar och håller loggen under 2 000 rader. Svarar med antalet borttagna. */
export async function pruneErrorLog(): Promise<number> {
  return pruneErrors(requireDb(), ERROR_KEEP_DAYS, ERROR_KEEP_ROWS);
}

/** De senaste felen och hur många som finns totalt. */
export async function listServerErrors(limit: number): Promise<{ errors: LoggedError[]; total: number }> {
  const sql = requireDb();
  return { errors: await selectErrors(sql, limit), total: await countErrors(sql) };
}

export async function clearErrorLog(): Promise<number> {
  return deleteAllErrors(requireDb());
}
