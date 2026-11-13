import type { Wave } from "./model";

/** Sändningsfönster, svenska vardagar och uppvärmning. Allt räknas i Stockholmstid. */

const TIME_ZONE = "Europe/Stockholm";
const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_OPEN_MINUTES = 8 * 60 + 30;
const WINDOW_CLOSE_MINUTES = 16 * 60;

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

function localParts(date: Date): LocalParts & { second: number } {
  const map = new Map<string, string>(partsFormat.formatToParts(date).map((p) => [p.type, p.value]));
  const num = (key: string) => Number(map.get(key) ?? 0);
  const year = num("year");
  const month = num("month");
  const day = num("day");
  return {
    year,
    month,
    day,
    hour: num("hour"),
    minute: num("minute"),
    second: num("second"),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

function offsetMs(date: Date): number {
  const p = localParts(date);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(date.getTime() / 1000) * 1000;
}

/** Ögonblicket då klockan i Stockholm visar given lokal tid. */
export function stockholmInstant(year: number, month: number, day: number, minutes: number): Date {
  const wall = Date.UTC(year, month - 1, day, 0, minutes);
  const guess = new Date(wall - offsetMs(new Date(wall)));
  return new Date(wall - offsetMs(guess));
}

export function stockholmDayStart(now: Date): Date {
  const p = localParts(now);
  return stockholmInstant(p.year, p.month, p.day, 0);
}

/** `YYYY-MM-DD` för Stockholmsdygnet. */
function stockholmDayKey(date: Date): string {
  const p = localParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const utcKey = (date: Date) => date.toISOString().slice(0, 10);
const shift = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

/** Röda dagar plus midsommar-, jul- och nyårsafton, då ingen svarar på jobbmejl. */
export function swedishHolidays(year: number): Set<string> {
  const easter = easterSunday(year);
  const midsummerEve = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(year, 5, 19 + i))).find(
    (d) => d.getUTCDay() === 5,
  );
  const fixed = ["01-01", "01-06", "05-01", "06-06", "12-24", "12-25", "12-26", "12-31"].map((md) => `${year}-${md}`);
  const moving = [shift(easter, -2), easter, shift(easter, 1), shift(easter, 39)].map(utcKey);
  return new Set([...fixed, ...moving, ...(midsummerEve ? [utcKey(midsummerEve)] : [])]);
}

function isBusinessDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  return weekday !== 0 && weekday !== 6 && !swedishHolidays(year).has(utcKey(date));
}

export function isInSendWindow(now: Date): boolean {
  const p = localParts(now);
  const minutes = p.hour * 60 + p.minute;
  return isBusinessDate(p.year, p.month, p.day) && minutes >= WINDOW_OPEN_MINUTES && minutes < WINDOW_CLOSE_MINUTES;
}

function nextBusinessDate(year: number, month: number, day: number): [number, number, number] {
  let date = new Date(Date.UTC(year, month - 1, day));
  do date = shift(date, 1);
  while (!isBusinessDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()));
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
}

/** `now` om fönstret är öppet, annars nästa öppning. */
export function nextWindowOpen(now: Date): Date {
  if (isInSendWindow(now)) return now;
  const p = localParts(now);
  const minutes = p.hour * 60 + p.minute;
  if (isBusinessDate(p.year, p.month, p.day) && minutes < WINDOW_OPEN_MINUTES) {
    return stockholmInstant(p.year, p.month, p.day, WINDOW_OPEN_MINUTES);
  }
  const [y, m, d] = nextBusinessDate(p.year, p.month, p.day);
  return stockholmInstant(y, m, d, WINDOW_OPEN_MINUTES);
}

export function retryAfterSeconds(now: Date): number {
  return Math.max(0, Math.ceil((nextWindowOpen(now).getTime() - now.getTime()) / 1000));
}

/** Samma lokala klockslag `days` vardagar senare. */
export function addBusinessDays(from: Date, days: number): Date {
  const p = localParts(from);
  let ymd: [number, number, number] = [p.year, p.month, p.day];
  for (let i = 0; i < days; i++) ymd = nextBusinessDate(...ymd);
  return stockholmInstant(...ymd, p.hour * 60 + p.minute);
}

export interface WarmupStep {
  week: number;
  /** `null` = bara allowlist (intern vecka). */
  perDay: number | null;
  perHour: number;
  perTick: number;
  waves: readonly Wave[];
}

/** Den enda uppvärmningstabellen (MASTERPLAN avsnitt 7). Sista raden gäller för alltid. */
const WARMUP_TABLE: readonly WarmupStep[] = [
  { week: 0, perDay: null, perHour: 4, perTick: 1, waves: ["internal"] },
  { week: 1, perDay: 8, perHour: 4, perTick: 1, waves: ["internal", "A"] },
  { week: 2, perDay: 15, perHour: 6, perTick: 1, waves: ["internal", "A", "B"] },
  { week: 3, perDay: 25, perHour: 8, perTick: 1, waves: ["internal", "A", "B"] },
  { week: 4, perDay: 40, perHour: 12, perTick: 1, waves: ["internal", "A", "B", "C"] },
  { week: 5, perDay: 60, perHour: 15, perTick: 3, waves: ["internal", "A", "B", "C"] },
  { week: 7, perDay: 80, perHour: 20, perTick: 3, waves: ["internal", "A", "B", "C", "NO"] },
];

const HARD_DAILY_CAP = 80;

function warmupWeek(firstRealSentAt: Date | null, now: Date): number {
  if (!firstRealSentAt) return 0;
  return Math.max(0, Math.floor((now.getTime() - firstRealSentAt.getTime()) / (7 * DAY_MS)));
}

export function warmupCap(firstRealSentAt: Date | null, now: Date): WarmupStep {
  const week = warmupWeek(firstRealSentAt, now);
  const step = [...WARMUP_TABLE].reverse().find((s) => s.week <= week) ?? WARMUP_TABLE[0];
  if (!step) throw new Error("Uppvärmningstabellen är tom");
  return { ...step, week };
}

/** Kampanjens tak kan sänka uppvärmningens tak men aldrig höja det. */
export function effectiveDailyCap(step: WarmupStep, campaignDailyCap: number): number | null {
  if (step.perDay === null) return null;
  return Math.min(step.perDay, campaignDailyCap, HARD_DAILY_CAP);
}

export type DeliveryEventType = "delivered" | "bounced_hard" | "bounced_soft" | "complained" | "delivery_delayed" | "domain_error";

export interface DeliveryEvent {
  type: DeliveryEventType;
  messageId: string | null;
  at: Date;
}

export interface PauseContext {
  now: Date;
  realSentTotal: number;
  realSentLast7Days: number;
}

export type PauseDecision = { pause: false } | { pause: true; reason: string };

const PERCENT_RULES_AFTER_SENT = 200;
const DELAY_GRACE_MS = 12 * 60 * 60 * 1000;

function unresolvedDelays(events: readonly DeliveryEvent[], now: Date): number {
  const delivered = new Set(events.filter((e) => e.type === "delivered").map((e) => e.messageId));
  const stuck = new Set(
    events
      .filter((e) => e.type === "delivery_delayed" && e.messageId && !delivered.has(e.messageId))
      .filter((e) => now.getTime() - e.at.getTime() >= DELAY_GRACE_MS)
      .map((e) => e.messageId),
  );
  return stuck.size;
}

/** Pausreglerna i avsnitt 7. `events` är de senaste sju dygnen. */
export function pauseDecision(events: readonly DeliveryEvent[], ctx: PauseContext): PauseDecision {
  const weekAgo = ctx.now.getTime() - 7 * DAY_MS;
  const recent = events.filter((e) => e.at.getTime() >= weekAgo);
  const complaints = recent.filter((e) => e.type === "complained").length;
  const hardBounces = recent.filter((e) => e.type === "bounced_hard");

  if (recent.some((e) => e.type === "domain_error")) return { pause: true, reason: "Domänfel från Resend" };

  if (ctx.realSentTotal >= PERCENT_RULES_AFTER_SENT) {
    const base = Math.max(1, ctx.realSentLast7Days);
    if (hardBounces.length / base >= 0.02) return { pause: true, reason: "Hårda studsar ≥ 2 % senaste 7 dygnen" };
    if (complaints / base >= 0.001) return { pause: true, reason: "Klagomål ≥ 0,1 % senaste 7 dygnen" };
  } else {
    if (complaints >= 1) return { pause: true, reason: "Ett klagomål på skräppost" };
    const perDay = new Map<string, number>();
    for (const e of hardBounces) perDay.set(stockholmDayKey(e.at), (perDay.get(stockholmDayKey(e.at)) ?? 0) + 1);
    if ([...perDay.values()].some((n) => n >= 2)) return { pause: true, reason: "2 hårda studsar samma dygn" };
    if (hardBounces.length >= 3) return { pause: true, reason: "3 hårda studsar på 7 dygn" };
  }

  if (unresolvedDelays(recent, ctx.now) >= 5) return { pause: true, reason: "5 försenade leveranser utan leverans efter 12 h" };
  return { pause: false };
}
