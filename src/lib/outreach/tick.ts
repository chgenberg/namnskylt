import type { EmailMessage, EmailSender } from "@/lib/email/types";
import { isRealEmailSend } from "@/lib/email";
import { companySender, composeOutreachEmail, previewSender } from "./compose";
import { outreachBlockers, parseAllowlist, senderBlockers, type BlockerCode, type GateContext } from "./send-gate";
import type { AssetMeta, CampaignRow, ControlRow, LeadRow, MessageRow } from "./store";
import {
  addBusinessDays,
  effectiveDailyCap,
  isInSendWindow,
  nextWindowOpen,
  pauseDecision,
  stockholmDayStart,
  warmupCap,
  type DeliveryEvent,
  type DeliveryEventType,
} from "./warmup";

/** Allt ticken gör mot databasen. Testerna byter ut den mot en minnesvariant. */
export interface TickStore {
  tryLock(): Promise<boolean>;
  unlock(): Promise<void>;
  startTick(trigger: TickTrigger): Promise<number>;
  finishTick(id: number, result: TickResult): Promise<void>;
  control(): Promise<ControlRow>;
  activeCampaigns(): Promise<CampaignRow[]>;
  firstRealSentAt(): Promise<Date | null>;
  sentSince(since: Date): Promise<number>;
  deliveryEvents(since: Date): Promise<{ type: string; messageId: string | null; at: Date }[]>;
  pauseAll(reason: string): Promise<void>;
  reclaimStale(now: Date): Promise<{ retried: number; review: number }>;
  promote(campaign: CampaignRow, notBeforeFor: (sentAt: Date, delayBusinessDays: number) => Date): Promise<number>;
  claim(campaignId: string, now: Date): Promise<MessageRow | null>;
  peek(campaignId: string, now: Date, limit: number): Promise<MessageRow[]>;
  lead(id: string): Promise<LeadRow | null>;
  isSuppressed(email: string): Promise<boolean>;
  assets(leadId: string): Promise<AssetMeta[]>;
  markSent(id: string, resendId: string, subject: string, now: Date): Promise<void>;
  markFailed(message: MessageRow, error: string, retryable: boolean, now: Date): Promise<void>;
  markSkipped(id: string, reason: string): Promise<void>;
  defer(id: string, until: Date, reason: string): Promise<void>;
  release(id: string): Promise<void>;
}

export type TickTrigger = "cron" | "admin" | "script";

export interface TickDeps {
  store: TickStore;
  /** Riktig avsändare; anropas bara i live-läge. */
  sender: EmailSender;
  /** Skriver dry-run-mejl till utboxen; ändrar inget i databasen. */
  outbox: EmailSender;
  now: () => Date;
  env: Record<string, string | undefined>;
  company: { name: string; orgNumber: string; address: string };
  siteUrl: string;
  supplierConfigured: boolean;
  /** Filmen som mejlet länkar till ligger på sidan (`DEMO_FILM`). Utan den väntar utskicket. */
  filmReady: boolean;
  /** Paus mellan två riktiga anrop till Resend. */
  sleep?: (ms: number) => Promise<void>;
}

export interface TickItem {
  messageId: string;
  step: number;
  outcome: "sent" | "dry_run" | "skipped" | "deferred" | "failed" | "blocked";
  subject?: string;
  blockers?: BlockerCode[];
  error?: string;
}

export interface TickResult {
  mode: "dry_run" | "live";
  skipped?: "disabled" | "busy" | "paused" | "outside_window" | "auto_paused" | "cap_reached" | "sender_incomplete" | "error";
  reason?: string;
  week?: number;
  budget?: number;
  promoted?: number;
  reclaimed?: { retried: number; review: number };
  items: TickItem[];
}

const SEND_GAP_MS = 600;
/** Hoppade och uppskjutna steg räknas inte mot taket, så ticken behöver ett eget golv. */
const MAX_CLAIMS_PER_TICK = 25;
const WEEK_ZERO_REASON = "Vecka 0 skickar bara till allowlist";
const HOUR_MS = 3_600_000;
const WEEK_MS = 7 * 24 * HOUR_MS;

/** Blockerare som går över av sig själva: steget får vänta i kön i stället för att hoppas över. */
const DEFERRABLE: readonly BlockerCode[] = ["not-allowlisted", "wave-not-open", "film-missing"];

const DELIVERY_TYPES: readonly DeliveryEventType[] = [
  "delivered",
  "bounced_hard",
  "bounced_soft",
  "complained",
  "delivery_delayed",
  "domain_error",
];

function asDeliveryEvents(rows: { type: string; messageId: string | null; at: Date }[]): DeliveryEvent[] {
  return rows.flatMap((r) =>
    DELIVERY_TYPES.includes(r.type as DeliveryEventType)
      ? [{ type: r.type as DeliveryEventType, messageId: r.messageId, at: r.at }]
      : [],
  );
}

/** Live kräver både att operatören valt det och att en riktig avsändare finns. */
function effectiveMode(control: ControlRow, sender: EmailSender, env: TickDeps["env"]): "dry_run" | "live" {
  return control.mode === "live" && sender.kind === "resend" && env.OUTREACH_DISABLED !== "true" ? "live" : "dry_run";
}

function notBeforeFor(sentAt: Date, delayBusinessDays: number): Date {
  return nextWindowOpen(addBusinessDays(sentAt, delayBusinessDays));
}

interface Budget {
  week: number;
  remaining: number;
  openWaves: GateContext["openWaves"];
  allowlistOnly: boolean;
}

async function sendBudget(store: TickStore, now: Date, campaignCap: number): Promise<Budget> {
  const warmup = warmupCap(await store.firstRealSentAt(), now);
  const perDay = effectiveDailyCap(warmup, campaignCap);
  const sentHour = await store.sentSince(new Date(now.getTime() - HOUR_MS));
  const sentToday = await store.sentSince(stockholmDayStart(now));
  const dayLeft = (perDay ?? warmup.perHour) - sentToday;
  return {
    week: warmup.week,
    remaining: Math.max(0, Math.min(warmup.perTick, warmup.perHour - sentHour, dayLeft)),
    openWaves: warmup.waves,
    allowlistOnly: warmup.perDay === null,
  };
}

interface Prepared {
  lead: LeadRow | null;
  blockers: BlockerCode[];
  email: EmailMessage | null;
  missing: string[];
}

async function prepare(
  deps: TickDeps,
  campaign: CampaignRow,
  message: MessageRow,
  ctx: Omit<GateContext, "suppressed" | "heroReady">,
): Promise<Prepared> {
  const lead = await deps.store.lead(message.leadId);
  if (!lead) return { lead: null, blockers: ["lead-blocked"], email: null, missing: [] };
  const assets = await deps.store.assets(lead.id);
  const blockers = outreachBlockers(lead, {
    ...ctx,
    suppressed: await deps.store.isSuppressed(lead.email),
  });
  const composed = composeOutreachEmail({
    message,
    lead,
    campaign,
    assets,
    sender: ctx.mode === "dry_run" ? previewSender(deps.company) : companySender(deps.company),
    siteUrl: deps.siteUrl,
    linkSecret: deps.env.OUTREACH_LINK_SECRET,
    now: deps.now(),
  });
  return composed.ok
    ? { lead, blockers, email: composed.email, missing: [] }
    : { lead, blockers, email: null, missing: composed.missing };
}

async function dryRunCampaign(deps: TickDeps, campaign: CampaignRow, ctx: GateContext, limit: number): Promise<TickItem[]> {
  const items: TickItem[] = [];
  for (const message of await deps.store.peek(campaign.id, deps.now(), limit)) {
    const prepared = await prepare(deps, campaign, message, ctx);
    if (prepared.email) await deps.outbox.send(prepared.email);
    items.push({
      messageId: message.id,
      step: message.step,
      outcome: "dry_run",
      subject: prepared.email?.subject,
      blockers: prepared.blockers.length ? prepared.blockers : undefined,
      error: prepared.missing.length ? `Saknar ${prepared.missing.join(", ")}` : undefined,
    });
  }
  return items;
}

async function sendOne(deps: TickDeps, campaign: CampaignRow, message: MessageRow, ctx: GateContext): Promise<TickItem> {
  const { store } = deps;
  const base = { messageId: message.id, step: message.step };
  const prepared = await prepare(deps, campaign, message, ctx);

  if (prepared.blockers.length) {
    if (prepared.blockers.every((b) => DEFERRABLE.includes(b))) {
      await store.defer(message.id, nextWindowOpen(new Date(deps.now().getTime() + 24 * HOUR_MS)), prepared.blockers.join(","));
      return { ...base, outcome: "deferred", blockers: prepared.blockers };
    }
    await store.markSkipped(message.id, prepared.blockers.join(","));
    return { ...base, outcome: "skipped", blockers: prepared.blockers };
  }
  if (!prepared.email || !prepared.lead) {
    await store.release(message.id);
    return { ...base, outcome: "blocked", error: `Saknar ${prepared.missing.join(", ")}` };
  }
  // En avregistrering kan ha kommit in efter claim.
  if (await store.isSuppressed(prepared.lead.email)) {
    await store.markSkipped(message.id, "suppressed");
    return { ...base, outcome: "skipped", blockers: ["suppressed"] };
  }
  // Leadet kan ha landat, svarat eller aktiverat efter claim; stoppet läses om precis före sändning.
  const stopReason = (await store.lead(prepared.lead.id))?.stopReason;
  if (stopReason) {
    await store.markSkipped(message.id, stopReason);
    return { ...base, outcome: "skipped", error: `Leadet är stoppat (${stopReason})` };
  }

  const result = await deps.sender.send(prepared.email);
  if (isRealEmailSend(result) && result.id) {
    await store.markSent(message.id, result.id, prepared.email.subject, deps.now());
    return { ...base, outcome: "sent", subject: prepared.email.subject };
  }
  if (result.mocked) {
    await store.release(message.id);
    return { ...base, outcome: "blocked", error: "Avsändaren är en mock" };
  }
  await store.markFailed(message, result.error ?? "Okänt fel", result.retryable, deps.now());
  return { ...base, outcome: "failed", error: result.error ?? "Okänt fel" };
}

async function runInsideLock(deps: TickDeps): Promise<TickResult> {
  const { store, env } = deps;
  const control = await store.control();
  const mode = effectiveMode(control, deps.sender, env);
  if (control.paused) return { mode, skipped: "paused", items: [] };

  const now = deps.now();
  if (!isInSendWindow(now)) return { mode, skipped: "outside_window", items: [] };

  const reclaimed = await store.reclaimStale(now);
  const realSentTotal = await store.sentSince(new Date(0));
  const decision = pauseDecision(asDeliveryEvents(await store.deliveryEvents(new Date(now.getTime() - WEEK_MS))), {
    now,
    realSentTotal,
    realSentLast7Days: await store.sentSince(new Date(now.getTime() - WEEK_MS)),
  });
  if (decision.pause) {
    await store.pauseAll(decision.reason);
    return { mode, skipped: "auto_paused", reason: decision.reason, reclaimed, items: [] };
  }

  const items: TickItem[] = [];
  let promoted = 0;
  let week = 0;
  let budget = 0;
  for (const campaign of await store.activeCampaigns()) {
    if (mode === "live") promoted += await store.promote(campaign, notBeforeFor);
    const allowance = await sendBudget(store, now, campaign.dailyCap);
    week = allowance.week;
    budget = allowance.remaining;
    const allowlist = parseAllowlist(env.OUTREACH_ALLOWLIST);
    const ctx: GateContext = {
      company: deps.company,
      campaign: { fromEmail: campaign.fromEmail, replyTo: campaign.replyTo },
      sendingDomain: env.OUTREACH_SENDING_DOMAIN ?? "",
      suppressed: false,
      allowlist,
      mode,
      supplierConfigured: deps.supplierConfigured,
      filmReady: deps.filmReady,
      openWaves: allowance.openWaves,
    };

    if (mode === "dry_run") {
      items.push(...(await dryRunCampaign(deps, campaign, ctx, Math.max(allowance.remaining, 1))));
      continue;
    }
    if (allowance.allowlistOnly && !allowlist) {
      return { mode, skipped: "cap_reached", reason: WEEK_ZERO_REASON, week, budget: 0, promoted, reclaimed, items };
    }
    const senderIssues = senderBlockers(ctx);
    if (senderIssues.length) {
      return { mode, skipped: "sender_incomplete", reason: senderIssues.join(","), week, budget, promoted, reclaimed, items };
    }
    if (allowance.remaining === 0) {
      return { mode, skipped: "cap_reached", week, budget: 0, promoted, reclaimed, items };
    }
    const seen = new Set<string>();
    for (let sent = 0; sent < allowance.remaining && seen.size < MAX_CLAIMS_PER_TICK; ) {
      if ((await store.control()).paused) break;
      const message = await store.claim(campaign.id, deps.now());
      if (!message) break;
      // Ett steg som släpptes tillbaka i kön kommer först igen; nästa tick får ta det.
      if (seen.has(message.id)) {
        await store.release(message.id);
        break;
      }
      seen.add(message.id);
      const item = await sendOne(deps, campaign, message, ctx);
      items.push(item);
      if (item.outcome === "sent" || item.outcome === "failed") {
        sent += 1;
        await (deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(SEND_GAP_MS);
      }
    }
  }
  return { mode, week, budget, promoted, reclaimed, items };
}

/** En körning: spärrar, tak, uppföljningar och högst `perTick` mejl. Live bara när allt är klart. */
export async function runOutreachTick(trigger: TickTrigger, deps: TickDeps): Promise<TickResult> {
  if (deps.env.OUTREACH_DISABLED === "true") return { mode: "dry_run", skipped: "disabled", items: [] };
  if (!(await deps.store.tryLock())) return { mode: "dry_run", skipped: "busy", items: [] };
  let tickId: number | null = null;
  let result: TickResult = { mode: "dry_run", items: [] };
  try {
    tickId = await deps.store.startTick(trigger);
    result = await runInsideLock(deps);
    return result;
  } catch (error) {
    result = { mode: result.mode, skipped: "error", reason: error instanceof Error ? error.message : "Okänt fel", items: [] };
    throw error;
  } finally {
    if (tickId !== null) await deps.store.finishTick(tickId, result).catch(() => undefined);
    await deps.store.unlock();
  }
}
