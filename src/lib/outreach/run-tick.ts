import "server-only";
import { getEmailSender } from "@/lib/email";
import { DEFAULT_OUTBOX_DIR, MockEmailSender } from "@/lib/email/mock-sender";
import { getCompanyProfile } from "@/lib/orders/repository";
import { supplierApiConfigured } from "@/lib/supplier/client";
import { OWNER_TENANT } from "@/lib/tenants/model";
import * as store from "./repository";
import { publicSiteUrl } from "./sender";
import { runOutreachTick, type TickResult, type TickStore, type TickTrigger } from "./tick";

/** Godtyckligt men fast: samma nyckel i varje process, så två tick aldrig kör samtidigt. */
const TICK_LOCK_KEY = 4815162342;

type Reserved = Awaited<ReturnType<ReturnType<typeof store.outreachDb>["reserve"]>>;

function databaseStore(sql: Reserved): TickStore {
  return {
    tryLock: async () => {
      const [row] = await sql<{ locked: boolean }[]>`select pg_try_advisory_lock(${TICK_LOCK_KEY}) as locked`;
      return row?.locked === true;
    },
    unlock: async () => {
      await sql`select pg_advisory_unlock(${TICK_LOCK_KEY})`;
    },
    startTick: (trigger) => store.startTick(sql, trigger),
    finishTick: (id, result) => store.finishTick(sql, id, result),
    control: () => store.getControl(sql),
    activeCampaigns: () => store.activeCampaigns(sql),
    firstRealSentAt: () => store.firstRealSentAt(sql),
    sentSince: (since) => store.countSentSince(sql, since),
    deliveryEvents: (since) => store.deliveryEventsSince(sql, since),
    pauseAll: async (reason) => {
      await store.pauseActiveCampaigns(sql, reason);
      await store.setControl(sql, { paused: true }, "auto");
    },
    reclaimStale: (now) => store.reclaimStale(sql, now),
    promote: (campaign, notBeforeFor) => store.promoteDueSteps(sql, campaign, notBeforeFor),
    claim: (campaignId, now) => store.claimNextReady(sql, campaignId, now),
    peek: (campaignId, now, limit) => store.listReady(sql, campaignId, now, limit),
    lead: (id) => store.getLead(sql, id),
    isSuppressed: (email) => store.isSuppressed(sql, email),
    assets: (leadId) => store.assetsForLead(sql, leadId),
    markSent: (id, resendId, subject, now) => store.markSent(sql, id, resendId, subject, now),
    markFailed: async (message, error, retryable, now) => {
      await store.markFailed(sql, message, error, retryable, now);
    },
    markSkipped: (id, reason) => store.markSkipped(sql, id, reason),
    defer: (id, until, reason) => store.deferMessage(sql, id, until, reason),
    release: (id) => store.releaseClaim(sql, id),
  };
}

/** Hela ticken på en reserverad anslutning — advisory lock sitter på anslutningen, inte på poolen. */
export async function runOutreachTickNow(trigger: TickTrigger): Promise<TickResult> {
  const sql = await store.outreachDb().reserve();
  try {
    const company = await getCompanyProfile(OWNER_TENANT);
    return await runOutreachTick(trigger, {
      store: databaseStore(sql),
      sender: getEmailSender(),
      outbox: new MockEmailSender(process.env.OUTREACH_OUTBOX_DIR || DEFAULT_OUTBOX_DIR),
      now: () => new Date(),
      env: process.env,
      company: { name: company.name, orgNumber: company.orgNumber, address: company.address },
      siteUrl: publicSiteUrl(),
      supplierConfigured: supplierApiConfigured(),
    });
  } finally {
    sql.release();
  }
}
