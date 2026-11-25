import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { EmailMessage, EmailSender, SendEmailResult } from "../email/types";
import { DEFAULT_CAMPAIGN_STEPS } from "./model";
import type { AssetMeta, CampaignRow, ControlRow, LeadRow, MessageRow } from "./store";
import { runOutreachTick, type TickDeps, type TickStore } from "./tick";
import { stockholmInstant } from "./warmup";

/** Tisdag 10 november 2026 kl 10:00 i Stockholm — inne i fönstret. */
const IN_WINDOW = stockholmInstant(2026, 11, 10, 10 * 60);
const SATURDAY = stockholmInstant(2026, 11, 14, 10 * 60);
const DAY_MS = 86_400_000;

const campaign: CampaignRow = {
  id: "c1",
  slug: "aterforsaljare-v1",
  name: "Återförsäljare v1",
  status: "active",
  pausedReason: null,
  fromName: "Namnskylt",
  fromEmail: "hej@mail.namnskylt.com",
  replyTo: "hej@namnskylt.com",
  signature: { name: "Anna" },
  dailyCap: 40,
  steps: [...DEFAULT_CAMPAIGN_STEPS],
};

const baseLead: LeadRow = {
  id: "l1",
  email: "anna@profilab.se",
  contactName: "Anna Lindqvist",
  companyName: "Profilab AB",
  phone: null,
  city: null,
  country: "se",
  customerSince: "2019-03-01",
  activated: true,
  known: true,
  website: null,
  upShopUrl: null,
  brand: null,
  wave: "A",
  status: "in_sequence",
  checkReason: null,
  stopReason: null,
  approvedAt: new Date(0),
  shopSlug: "profilab",
  inviteToken: null,
  resellerId: null,
  landedAt: null,
  demoOpenedAt: null,
  callbackAt: null,
  repliedAt: null,
  attributedAt: null,
  firstOrderAt: null,
  note: null,
  createdAt: new Date(0),
};

const heroAsset: AssetMeta = {
  id: "hero-0000000000000000",
  kind: "hero",
  materialId: "metal",
  colorId: "metal-gold",
  shape: "rounded",
  widthMm: 75,
  heightMm: 25,
  width: 1200,
  height: 600,
  logoStatus: "text-only",
  review: "pending",
};

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const M1 = uuid(1);
const M2 = uuid(2);

function message(id = M1): MessageRow {
  return {
    id,
    campaignId: campaign.id,
    leadId: baseLead.id,
    step: 1,
    status: "ready",
    idempotencyKey: `key-${id}`,
    subject: null,
    notBefore: new Date(0),
    attempts: 0,
    claimedAt: null,
    sentAt: null,
    resendId: null,
    lastError: null,
  };
}

interface FakeOptions {
  control?: Partial<ControlRow>;
  locked?: boolean;
  firstRealSentAt?: Date | null;
  sentLastHour?: number;
  lead?: Partial<LeadRow>;
  messages?: MessageRow[];
  /** Svaren från `isSuppressed` i tur och ordning; sista upprepas. */
  suppressed?: boolean[];
  /** Ändringar på leadet per anrop till `lead` i tur och ordning; sista upprepas. Ersätter `lead`. */
  leadAnswers?: Partial<LeadRow>[];
  events?: { type: string; messageId: string | null; at: Date }[];
}

class FakeStore implements TickStore {
  readonly log: string[] = [];
  readonly messages: MessageRow[];
  private suppressedAnswers: boolean[];
  private leadAnswers: Partial<LeadRow>[];
  constructor(private readonly opts: FakeOptions = {}) {
    this.messages = opts.messages ?? [message()];
    this.suppressedAnswers = [...(opts.suppressed ?? [false])];
    this.leadAnswers = [...(opts.leadAnswers ?? [opts.lead ?? {}])];
  }
  async tryLock() {
    return this.opts.locked !== true;
  }
  async unlock() {
    this.log.push("unlock");
  }
  async startTick() {
    return 1;
  }
  async finishTick() {
    this.log.push("finish");
  }
  async control(): Promise<ControlRow> {
    return { paused: false, mode: "live", updatedAt: new Date(0), ...this.opts.control };
  }
  async activeCampaigns() {
    return [campaign];
  }
  async firstRealSentAt() {
    return this.opts.firstRealSentAt === undefined ? new Date(IN_WINDOW.getTime() - 8 * DAY_MS) : this.opts.firstRealSentAt;
  }
  async sentSince(since: Date) {
    return IN_WINDOW.getTime() - since.getTime() <= 3_600_000 ? (this.opts.sentLastHour ?? 0) : 0;
  }
  async deliveryEvents() {
    return this.opts.events ?? [];
  }
  async pauseAll(reason: string) {
    this.log.push(`pause:${reason}`);
  }
  async reclaimStale() {
    return { retried: 0, review: 0 };
  }
  async promote() {
    return 0;
  }
  async claim() {
    const next = this.messages.find((m) => m.status === "ready");
    if (!next) return null;
    next.status = "sending";
    return { ...next };
  }
  async peek(_c: string, _n: Date, limit: number) {
    return this.messages.filter((m) => m.status === "ready").slice(0, limit);
  }
  async lead() {
    const answer = this.leadAnswers.length > 1 ? this.leadAnswers.shift() : this.leadAnswers[0];
    return { ...baseLead, ...answer };
  }
  async isSuppressed() {
    return (this.suppressedAnswers.length > 1 ? this.suppressedAnswers.shift() : this.suppressedAnswers[0]) ?? false;
  }
  async assets() {
    return [heroAsset];
  }
  private set(id: string, status: MessageRow["status"], note: string) {
    const row = this.messages.find((m) => m.id === id);
    if (row) row.status = status;
    this.log.push(`${note}:${id}`);
  }
  async markSent(id: string) {
    this.set(id, "sent", "sent");
  }
  async markFailed(m: MessageRow) {
    this.set(m.id, "ready", "failed");
  }
  async markSkipped(id: string, reason: string) {
    this.set(id, "skipped", `skipped(${reason})`);
  }
  async defer(id: string) {
    this.set(id, "ready", "deferred");
  }
  async release(id: string) {
    this.set(id, "ready", "released");
  }
}

function throwingSender(kind: EmailSender["kind"] = "resend"): EmailSender {
  return {
    kind,
    send: async () => {
      throw new Error("Avsändaren får inte anropas här");
    },
  };
}

function recordingSender(result: Partial<SendEmailResult> = {}): EmailSender & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    kind: "resend",
    sent,
    send: async (m) => {
      sent.push(m);
      return { success: true, id: "re_123", mocked: false, status: 200, error: null, retryable: false, ...result };
    },
  };
}

function deps(store: TickStore, overrides: Partial<TickDeps> = {}): TickDeps & { outboxed: EmailMessage[] } {
  const outboxed: EmailMessage[] = [];
  return {
    store,
    sender: throwingSender(),
    outbox: {
      kind: "mock",
      send: async (m) => {
        outboxed.push(m);
        return { success: true, id: "mock", mocked: true, status: null, error: null, retryable: false };
      },
    },
    now: () => IN_WINDOW,
    env: { OUTREACH_SENDING_DOMAIN: "mail.namnskylt.com", OUTREACH_LINK_SECRET: "x".repeat(40) },
    company: { name: "Namnskylt AB", orgNumber: "559000-0000", address: "Gatan 1, 111 22 Stockholm" },
    siteUrl: "https://namnskylt.com",
    supplierConfigured: true,
    filmReady: true,
    sleep: async () => undefined,
    outboxed,
    ...overrides,
  };
}

describe("runOutreachTick — spärrar som aldrig anropar avsändaren", () => {
  test("OUTREACH_DISABLED", async () => {
    const store = new FakeStore();
    const d = deps(store, { env: { ...deps(store).env, OUTREACH_DISABLED: "true" } });
    assert.equal((await runOutreachTick("cron", d)).skipped, "disabled");
  });

  test("paus i kontrollraden", async () => {
    const store = new FakeStore({ control: { paused: true } });
    assert.equal((await runOutreachTick("cron", deps(store))).skipped, "paused");
    assert.deepEqual(store.log, ["finish", "unlock"]);
  });

  test("utanför sändfönstret", async () => {
    const store = new FakeStore();
    assert.equal((await runOutreachTick("cron", deps(store, { now: () => SATURDAY }))).skipped, "outside_window");
  });

  test("taket är nått", async () => {
    const store = new FakeStore({ sentLastHour: 4 });
    const result = await runOutreachTick("cron", deps(store));
    assert.equal(result.skipped, "cap_reached");
    assert.equal(store.messages[0]?.status, "ready");
  });

  test("vecka 0 utan allowlist", async () => {
    const store = new FakeStore({ firstRealSentAt: null });
    const result = await runOutreachTick("cron", deps(store));
    assert.equal(result.skipped, "cap_reached");
    assert.match(result.reason ?? "", /allowlist/);
  });

  test("ett annat tick håller låset", async () => {
    const store = new FakeStore({ locked: true });
    assert.equal((await runOutreachTick("cron", deps(store))).skipped, "busy");
  });

  test("ett klagomål pausar allt", async () => {
    const store = new FakeStore({ events: [{ type: "complained", messageId: "m0", at: IN_WINDOW }] });
    const result = await runOutreachTick("cron", deps(store));
    assert.equal(result.skipped, "auto_paused");
    assert.ok(store.log.some((l) => l.startsWith("pause:")));
  });

  test("ofullständig avsändare i företagsprofilen", async () => {
    const store = new FakeStore();
    const result = await runOutreachTick("cron", deps(store, { company: { name: "Namnskylt AB", orgNumber: "", address: "" } }));
    assert.equal(result.skipped, "sender_incomplete");
  });
});

describe("runOutreachTick — dry-run", () => {
  test("renderar till utboxen utan att ändra status", async () => {
    const store = new FakeStore({ control: { mode: "dry_run" } });
    const d = deps(store);
    const result = await runOutreachTick("admin", d);
    assert.equal(result.mode, "dry_run");
    assert.equal(d.outboxed.length, 1);
    assert.equal(store.messages[0]?.status, "ready");
    assert.equal(result.items[0]?.outcome, "dry_run");
    assert.match(d.outboxed[0]?.html ?? "", /namnskylt\.com\/demo\?k=/);
  });

  test("live utan riktig avsändare blir dry-run", async () => {
    const store = new FakeStore();
    const d = deps(store, { sender: throwingSender("mock") });
    assert.equal((await runOutreachTick("admin", d)).mode, "dry_run");
    assert.equal(store.messages[0]?.status, "ready");
  });
});

describe("runOutreachTick — live", () => {
  test("skickar ett per tick och markerar det skickat", async () => {
    const store = new FakeStore({ messages: [message(M1), message(M2)] });
    const sender = recordingSender();
    const result = await runOutreachTick("cron", deps(store, { sender }));
    assert.equal(sender.sent.length, 1);
    assert.equal(sender.sent[0]?.idempotencyKey, `key-${M1}`);
    assert.equal(sender.sent[0]?.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.deepEqual(result.items.map((i) => i.outcome), ["sent"]);
    assert.equal(store.messages[1]?.status, "ready");
  });

  test("en spärr som kommer mellan claim och fetch stoppar sändningen", async () => {
    const store = new FakeStore({ suppressed: [false, true] });
    const result = await runOutreachTick("cron", deps(store));
    assert.equal(result.items[0]?.outcome, "skipped");
    assert.equal(store.messages[0]?.status, "skipped");
  });

  test("ett lead som stoppas mellan claim och fetch får inget mejl", async () => {
    // Första läsningen (förberedelsen) ser ett aktivt lead, den andra (precis före sändning) ett stoppat.
    const store = new FakeStore({ leadAnswers: [{}, { stopReason: "landed" }] });
    const sender = recordingSender();
    const result = await runOutreachTick("cron", deps(store, { sender }));
    assert.equal(sender.sent.length, 0);
    assert.equal(result.items[0]?.outcome, "skipped");
    assert.equal(store.messages[0]?.status, "skipped");
    assert.ok(store.log.includes(`skipped(landed):${M1}`));
  });

  test("en stängd våg väntar i kön i stället för att hoppas över", async () => {
    const store = new FakeStore({ lead: { wave: "C" } });
    const result = await runOutreachTick("cron", deps(store));
    assert.equal(result.items[0]?.outcome, "deferred");
    assert.equal(store.messages[0]?.status, "ready");
  });

  test("Norge hoppas över", async () => {
    const store = new FakeStore({ lead: { country: "no" } });
    const result = await runOutreachTick("cron", deps(store));
    assert.equal(result.items[0]?.outcome, "skipped");
  });

  test("ett tillfälligt fel från Resend går tillbaka till kön", async () => {
    const store = new FakeStore();
    const sender = recordingSender({ success: false, id: null, status: 503, error: "503", retryable: true });
    const result = await runOutreachTick("cron", deps(store, { sender }));
    assert.equal(result.items[0]?.outcome, "failed");
    assert.ok(store.log.includes(`failed:${M1}`));
  });
});
