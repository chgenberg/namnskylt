import type { Sql, TransactionSql } from "postgres";
import type { BadgeShape, MaterialId } from "@/engine/types";
import type { ImportedLead } from "./customer-import";
import { isBlockingReason } from "./customer-import";
import {
  type AssetReview,
  type CampaignStep,
  type ControlMode,
  type Country,
  idempotencyKey,
  type LeadStatus,
  type MessageStatus,
  normalizeEmail,
  type OutreachBrand,
  type StopReason,
  type SuppressionReason,
  type SuppressionSource,
  type Wave,
} from "./model";

/**
 * All SQL för utskicket. Tar anslutningen som argument så att den går att
 * testa mot en riktig databas utan Next; `repository.ts` binder den till appen.
 */

type Db = Sql | TransactionSql;
type Json = Parameters<Sql["json"]>[0];

export interface LeadRow {
  id: string;
  email: string;
  contactName: string | null;
  companyName: string;
  phone: string | null;
  city: string | null;
  country: Country;
  customerSince: string | null;
  activated: boolean;
  known: boolean;
  website: string | null;
  upShopUrl: string | null;
  brand: OutreachBrand | null;
  wave: Wave | null;
  status: LeadStatus;
  checkReason: string | null;
  stopReason: StopReason | null;
  approvedAt: Date | null;
  shopSlug: string | null;
  inviteToken: string | null;
  resellerId: string | null;
  landedAt: Date | null;
  demoOpenedAt: Date | null;
  /** När mottagaren bad om att bli uppringd på sidan med filmen (2026-11-25). */
  callbackAt: Date | null;
  repliedAt: Date | null;
  attributedAt: Date | null;
  firstOrderAt: Date | null;
  note: string | null;
  createdAt: Date;
}

const LEAD_COLUMNS = `
  id, email, contact_name as "contactName", company_name as "companyName", phone, city, country,
  to_char(customer_since, 'YYYY-MM-DD') as "customerSince", activated, known, website, up_shop_url as "upShopUrl",
  brand, wave, status, check_reason as "checkReason", stop_reason as "stopReason", approved_at as "approvedAt",
  shop_slug as "shopSlug", invite_token as "inviteToken", reseller_id as "resellerId", landed_at as "landedAt",
  demo_opened_at as "demoOpenedAt", callback_at as "callbackAt", replied_at as "repliedAt", attributed_at as "attributedAt",
  first_order_at as "firstOrderAt", note, created_at as "createdAt"`;

export interface CampaignRow {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "active" | "paused" | "done";
  pausedReason: string | null;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  signature: CampaignSignature;
  dailyCap: number;
  steps: CampaignStep[];
}

export interface CampaignSignature {
  name?: string;
  title?: string;
  phone?: string;
  email?: string;
}

const CAMPAIGN_COLUMNS = `
  id, slug, name, status, paused_reason as "pausedReason", from_name as "fromName", from_email as "fromEmail",
  reply_to as "replyTo", signature, daily_cap as "dailyCap", steps`;

export interface MessageRow {
  id: string;
  campaignId: string;
  leadId: string;
  step: number;
  status: MessageStatus;
  idempotencyKey: string;
  subject: string | null;
  notBefore: Date;
  attempts: number;
  claimedAt: Date | null;
  sentAt: Date | null;
  resendId: string | null;
  lastError: string | null;
}

const MESSAGE_COLUMNS = `
  id, campaign_id as "campaignId", lead_id as "leadId", step, status, idempotency_key as "idempotencyKey",
  subject, not_before as "notBefore", attempts, claimed_at as "claimedAt", sent_at as "sentAt",
  resend_id as "resendId", last_error as "lastError"`;

/* ───────────── Leads ───────────── */

export interface UpsertLeadResult {
  inserted: number;
  updated: number;
  untouched: number;
}

/** Nya rader blir `draft`/`blocked`. Godkända och senare skrivs aldrig över. */
export async function upsertLeads(sql: Db, leads: readonly ImportedLead[]): Promise<UpsertLeadResult> {
  const result: UpsertLeadResult = { inserted: 0, updated: 0, untouched: 0 };
  for (const lead of leads) {
    const blocked = lead.checkReasons.some(isBlockingReason);
    const status: LeadStatus = blocked ? "blocked" : "draft";
    const checkReason = lead.checkReasons.join(",") || null;
    const [row] = await sql<{ inserted: boolean }[]>`
      insert into outreach_leads (email, contact_name, company_name, phone, city, country, customer_since,
                                  activated, known, website, up_shop_url, wave, status, check_reason)
      values (${normalizeEmail(lead.email)}, ${lead.contactName}, ${lead.companyName}, ${lead.phone}, ${lead.city},
              ${lead.country}, ${lead.customerSince}, ${lead.activated}, ${lead.known}, ${lead.website},
              ${lead.upShopUrl}, ${lead.wave}, ${status}, ${checkReason})
      on conflict ((lower(email))) do update set
        contact_name = excluded.contact_name, company_name = excluded.company_name, phone = excluded.phone,
        city = excluded.city, country = excluded.country, customer_since = excluded.customer_since,
        activated = excluded.activated, known = excluded.known, website = excluded.website,
        up_shop_url = excluded.up_shop_url, check_reason = excluded.check_reason,
        status = excluded.status, updated_at = now()
        where outreach_leads.status in ('draft', 'blocked')
      returning (xmax = 0) as inserted`;
    if (!row) result.untouched++;
    else if (row.inserted) result.inserted++;
    else result.updated++;
  }
  return result;
}

/** Den som redan har ett återförsäljarkonto ska inte få ett säljmejl. */
export async function blockExistingResellers(sql: Db): Promise<number> {
  const rows = await sql`
    update outreach_leads l set status = 'blocked',
      check_reason = concat_ws(',', nullif(l.check_reason, ''), 'already-reseller'), updated_at = now()
     where l.status in ('draft') and exists (select 1 from reseller_accounts r where lower(r.email) = lower(l.email))
    returning l.id`;
  return rows.length;
}

export interface LeadFilter {
  wave?: Wave | null;
  status?: LeadStatus;
  country?: Country;
  limit?: number;
}

export async function listLeads(sql: Db, filter: LeadFilter = {}): Promise<LeadRow[]> {
  const limit = filter.limit ?? 1000;
  return sql<LeadRow[]>`
    select ${sql.unsafe(LEAD_COLUMNS)} from outreach_leads
     where (${filter.wave ?? null}::text is null or wave = ${filter.wave ?? null})
       and (${filter.status ?? null}::text is null or status = ${filter.status ?? null})
       and (${filter.country ?? null}::text is null or country = ${filter.country ?? null})
     order by company_name
     limit ${limit}`;
}

export async function getLead(sql: Db, id: string): Promise<LeadRow | null> {
  const [row] = await sql<LeadRow[]>`select ${sql.unsafe(LEAD_COLUMNS)} from outreach_leads where id = ${id}`;
  return row ?? null;
}

export async function approveLeads(sql: Db, ids: readonly string[], approvedBy: string): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await sql<{ id: string }[]>`
    update outreach_leads set status = 'approved', approved_at = now(), approved_by = ${approvedBy}, updated_at = now()
     where id = any(${[...ids]}::uuid[]) and status = 'draft'
    returning id`;
  return rows.map((r) => r.id);
}

export async function setLeadWave(sql: Db, ids: readonly string[], wave: Wave | null): Promise<void> {
  if (!ids.length) return;
  await sql`update outreach_leads set wave = ${wave}, updated_at = now() where id = any(${[...ids]}::uuid[])`;
}

export async function setLeadShop(sql: Db, leadId: string, shopSlug: string, brand: OutreachBrand | null): Promise<void> {
  await sql`update outreach_leads set shop_slug = ${shopSlug},
              brand = ${brand ? sql.json(brand as unknown as Json) : null}, updated_at = now()
            where id = ${leadId}`;
}

const UNIQUE_VIOLATION = "23505";

/**
 * Knyter butiken till leadet innan bilderna görs. `false` om butiken redan hör
 * till ett annat lead — två kontakter på samma företag delar inte butik.
 */
export async function claimLeadShop(sql: Db, leadId: string, shopSlug: string): Promise<boolean> {
  try {
    await sql`update outreach_leads set shop_slug = ${shopSlug}, updated_at = now() where id = ${leadId}`;
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === UNIQUE_VIOLATION) return false;
    throw error;
  }
}

/** Leads i vågorna som saknar butik eller hjältebild. `force` tar med alla, för att rendera om. */
export async function leadsNeedingDemo(
  sql: Db,
  input: { waves: readonly Wave[]; limit: number; force?: boolean },
): Promise<LeadRow[]> {
  return sql<LeadRow[]>`
    select ${sql.unsafe(LEAD_COLUMNS)} from outreach_leads l
     where l.wave = any(${[...input.waves]}::text[]) and l.status in ('draft', 'approved')
       and (${input.force ?? false} or l.shop_slug is null
            or not exists (select 1 from outreach_assets a where a.lead_id = l.id and a.kind = 'hero'))
     order by l.company_name
     limit ${input.limit}`;
}

export async function shopForSource(sql: Db, host: string): Promise<{ slug: string; ownerId: string | null } | null> {
  const [row] = await sql<{ slug: string; ownerId: string | null }[]>`
    select slug, owner_id as "ownerId" from shops
     where split_part(lower(regexp_replace(data->>'sourceUrl', '^(https?://)?(www\\.)?', '')), '/', 1) = ${host}
     order by owner_id nulls first limit 1`;
  return row ?? null;
}

export async function shopHasOutreachLead(sql: Db, slug: string): Promise<boolean> {
  const [row] = await sql<{ found: boolean }[]>`select exists (select 1 from outreach_leads where shop_slug = ${slug}) as found`;
  return row?.found ?? false;
}

/** Stoppar resten av sekvensen för leadet; första orsaken vinner. */
export async function stopLead(sql: Db, leadId: string, reason: StopReason): Promise<void> {
  await sql`update outreach_leads set stop_reason = coalesce(stop_reason, ${reason}), updated_at = now() where id = ${leadId}`;
  await sql`update outreach_messages set status = 'cancelled', cancel_reason = ${reason}, updated_at = now()
             where lead_id = ${leadId} and status in ('scheduled', 'ready')`;
}

export async function recordLanding(sql: Db, leadId: string): Promise<void> {
  await sql`update outreach_leads set landed_at = coalesce(landed_at, now()), updated_at = now() where id = ${leadId}`;
  await stopLead(sql, leadId, "landed");
}

/** Mottagaren bad om att bli uppringd på sidan med filmen. Det första tillfället står kvar. */
export async function recordCallback(sql: Db, leadId: string): Promise<void> {
  await sql`update outreach_leads set callback_at = coalesce(callback_at, now()), updated_at = now() where id = ${leadId}`;
}

export async function recordDemoOpened(sql: Db, leadId: string): Promise<void> {
  await sql`update outreach_leads set demo_opened_at = coalesce(demo_opened_at, now()), updated_at = now() where id = ${leadId}`;
}

export async function setLeadInvite(sql: Db, leadId: string, inviteToken: string): Promise<void> {
  await sql`update outreach_leads set invite_token = ${inviteToken}, updated_at = now() where id = ${leadId}`;
}

export async function leadIdForInvite(sql: Db, inviteToken: string): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`select id from outreach_leads where invite_token = ${inviteToken}`;
  return row?.id ?? null;
}

/** Kopplar ett nytt återförsäljarkonto till leadet via inbjudan, annars via e-post. */
export async function attributeLead(
  sql: Db,
  input: { inviteToken: string; email: string; resellerId: string },
): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`
    update outreach_leads set reseller_id = ${input.resellerId}, attributed_at = coalesce(attributed_at, now()),
                              status = 'converted', updated_at = now()
     where id = (select id from outreach_leads
                  where invite_token = ${input.inviteToken} or lower(email) = lower(${input.email})
                  order by (invite_token = ${input.inviteToken}) desc nulls last limit 1)
    returning id`;
  if (row) await stopLead(sql, row.id, "activated");
  return row?.id ?? null;
}

/* ───────────── Kampanj ───────────── */

export async function getCampaign(sql: Db, id: string): Promise<CampaignRow | null> {
  const [row] = await sql<CampaignRow[]>`select ${sql.unsafe(CAMPAIGN_COLUMNS)} from outreach_campaigns where id = ${id}`;
  return row ?? null;
}

export async function listCampaigns(sql: Db): Promise<CampaignRow[]> {
  return sql<CampaignRow[]>`select ${sql.unsafe(CAMPAIGN_COLUMNS)} from outreach_campaigns order by created_at desc`;
}

export async function activeCampaigns(sql: Db): Promise<CampaignRow[]> {
  return sql<CampaignRow[]>`select ${sql.unsafe(CAMPAIGN_COLUMNS)} from outreach_campaigns where status = 'active'`;
}

export interface CampaignInput {
  slug: string;
  name: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  signature: CampaignSignature;
  dailyCap: number;
  steps: readonly CampaignStep[];
}

export async function upsertCampaign(sql: Db, input: CampaignInput): Promise<CampaignRow> {
  const [row] = await sql<CampaignRow[]>`
    insert into outreach_campaigns (slug, name, from_name, from_email, reply_to, signature, daily_cap, steps)
    values (${input.slug}, ${input.name}, ${input.fromName}, ${input.fromEmail}, ${input.replyTo},
            ${sql.json(input.signature as unknown as Json)}, ${input.dailyCap}, ${sql.json(input.steps as unknown as Json)})
    on conflict (slug) do update set name = excluded.name, from_name = excluded.from_name,
      from_email = excluded.from_email, reply_to = excluded.reply_to, signature = excluded.signature,
      daily_cap = excluded.daily_cap, steps = excluded.steps, updated_at = now()
    returning ${sql.unsafe(CAMPAIGN_COLUMNS)}`;
  if (!row) throw new Error("Kampanjen sparades inte");
  return row;
}

export async function setCampaignStatus(
  sql: Db,
  id: string,
  status: CampaignRow["status"],
  pausedReason: string | null = null,
): Promise<void> {
  await sql`update outreach_campaigns set status = ${status}, paused_reason = ${pausedReason}, updated_at = now()
             where id = ${id}`;
}

/** Pausar alla aktiva kampanjer — webhooken gör det vid klagomål. */
export async function pauseActiveCampaigns(sql: Db, reason: string): Promise<number> {
  const rows = await sql`update outreach_campaigns set status = 'paused', paused_reason = ${reason}, updated_at = now()
                          where status = 'active' returning id`;
  return rows.length;
}

/* ───────────── Meddelanden ───────────── */

/**
 * Skapar ett meddelande per påslaget steg för godkända leads i kampanjen.
 * Steg 1 blir `ready`, senare steg `scheduled` tills föregående steg levererats.
 */
export async function ensureMessages(sql: Db, campaign: CampaignRow, leadIds: readonly string[]): Promise<number> {
  let created = 0;
  for (const leadId of leadIds) {
    for (const step of campaign.steps.filter((s) => s.enabled)) {
      const rows = await sql`
        insert into outreach_messages (campaign_id, lead_id, step, status, idempotency_key)
        values (${campaign.id}, ${leadId}, ${step.step}, ${step.step === 1 ? "ready" : "scheduled"},
                ${idempotencyKey(campaign.id, leadId, step.step)})
        on conflict (campaign_id, lead_id, step) do nothing
        returning id`;
      created += rows.length;
    }
    await sql`update outreach_leads set status = 'in_sequence', updated_at = now()
               where id = ${leadId} and status = 'approved'`;
  }
  return created;
}

/**
 * Tar nästa sändbara rad; två samtidiga tick kan aldrig få samma. Ett stoppat
 * lead tas aldrig, även om en rad har hamnat i `ready` igen efter stoppet.
 */
export async function claimNextReady(sql: Db, campaignId: string, now: Date): Promise<MessageRow | null> {
  const [row] = await sql<MessageRow[]>`
    update outreach_messages m set status = 'sending', claimed_at = ${now}, attempts = m.attempts + 1, updated_at = now()
     where m.id = (
       select q.id from outreach_messages q
        where q.campaign_id = ${campaignId} and q.status = 'ready' and q.not_before <= ${now}
          and (q.next_attempt_at is null or q.next_attempt_at <= ${now})
          and not exists (select 1 from outreach_leads l where l.id = q.lead_id and l.stop_reason is not null)
        order by q.not_before, q.step, q.created_at
        for update skip locked
        limit 1)
    returning ${sql.unsafe(MESSAGE_COLUMNS)}`;
  return row ?? null;
}

/** Det `claimNextReady` skulle ta, för torrkörningen; stoppade leads visas inte. */
export async function listReady(sql: Db, campaignId: string, now: Date, limit: number): Promise<MessageRow[]> {
  return sql<MessageRow[]>`
    select ${sql.unsafe(MESSAGE_COLUMNS)} from outreach_messages q
     where q.campaign_id = ${campaignId} and q.status = 'ready' and q.not_before <= ${now}
       and not exists (select 1 from outreach_leads l where l.id = q.lead_id and l.stop_reason is not null)
     order by q.not_before, q.step, q.created_at limit ${limit}`;
}

export async function messagesForLead(sql: Db, leadId: string): Promise<(MessageRow & { cancelReason: string | null })[]> {
  return sql<(MessageRow & { cancelReason: string | null })[]>`
    select ${sql.unsafe(MESSAGE_COLUMNS)}, cancel_reason as "cancelReason" from outreach_messages
     where lead_id = ${leadId} order by step`;
}

/** Senaste stegets status per lead, för listan. */
export async function latestMessageStatus(sql: Db): Promise<Map<string, MessageStatus>> {
  const rows = await sql<{ leadId: string; status: MessageStatus }[]>`
    select distinct on (lead_id) lead_id as "leadId", status from outreach_messages order by lead_id, step desc`;
  return new Map(rows.map((r) => [r.leadId, r.status]));
}

export async function leadIdsWithHero(sql: Db): Promise<Set<string>> {
  return leadIdsWithAsset(sql, "hero");
}

async function leadIdsWithAsset(sql: Db, kind: AssetKind): Promise<Set<string>> {
  const rows = await sql<{ leadId: string }[]>`select distinct lead_id as "leadId" from outreach_assets where kind = ${kind}`;
  return new Set(rows.map((r) => r.leadId));
}

export async function getMessage(sql: Db, id: string): Promise<MessageRow | null> {
  const [row] = await sql<MessageRow[]>`select ${sql.unsafe(MESSAGE_COLUMNS)} from outreach_messages where id = ${id}`;
  return row ?? null;
}

export async function messageByResendId(sql: Db, resendId: string): Promise<MessageRow | null> {
  const [row] = await sql<MessageRow[]>`select ${sql.unsafe(MESSAGE_COLUMNS)} from outreach_messages
                                         where resend_id = ${resendId}`;
  return row ?? null;
}

export async function markSent(sql: Db, id: string, resendId: string, subject: string, now: Date): Promise<void> {
  await sql`update outreach_messages set status = 'sent', resend_id = ${resendId}, subject = ${subject},
              sent_at = ${now}, last_error = null, updated_at = now()
            where id = ${id} and status = 'sending'`;
}

const MAX_ATTEMPTS = 3;
const RETRY_BASE_MINUTES = 15;

/** Tillfälliga fel läggs tillbaka med väntetid; efter tre försök eller permanent fel krävs en människa. */
export async function markFailed(
  sql: Db,
  message: Pick<MessageRow, "id" | "attempts">,
  error: string,
  retryable: boolean,
  now: Date,
): Promise<MessageStatus> {
  const giveUp = !retryable || message.attempts >= MAX_ATTEMPTS;
  const next = new Date(now.getTime() + RETRY_BASE_MINUTES * 60_000 * 2 ** Math.max(0, message.attempts - 1));
  const status: MessageStatus = giveUp ? "needs_review" : "ready";
  await sql`update outreach_messages set status = ${status}, last_error = ${error.slice(0, 500)},
              next_attempt_at = ${giveUp ? null : next}, updated_at = now()
            where id = ${message.id} and status = 'sending'`;
  return status;
}

/** Skippar raden utan att räkna den som skickad — t.ex. en spärr som kom efter claim. */
export async function markSkipped(sql: Db, id: string, reason: string): Promise<void> {
  await sql`update outreach_messages set status = 'skipped', cancel_reason = ${reason}, updated_at = now()
             where id = ${id} and status in ('sending', 'ready')`;
}

/** En dry-run tar ingen rad i anspråk; en tidigare claim lämnas tillbaka orörd. */
/** Tillbaka i kön men inte förrän `until` — för en våg eller allowlist som inte släpper fram leadet än. */
export async function deferMessage(sql: Db, id: string, until: Date, reason: string): Promise<void> {
  await sql`update outreach_messages set status = 'ready', attempts = greatest(attempts - 1, 0), claimed_at = null,
              next_attempt_at = ${until}, last_error = ${reason}, updated_at = now()
            where id = ${id} and status = 'sending'`;
}

export async function releaseClaim(sql: Db, id: string): Promise<void> {
  await sql`update outreach_messages set status = 'ready', attempts = greatest(attempts - 1, 0), claimed_at = null,
              updated_at = now()
            where id = ${id} and status = 'sending'`;
}

const STALE_MINUTES = 10;
const IDEMPOTENCY_WINDOW_HOURS = 24;

/**
 * Rader som fastnat i `sending` efter en krasch. Inom Resends 24-timmarsfönster
 * skyddar idempotensnyckeln mot dubbletter; efter det kan mejlet ha gått — människa avgör.
 * Har leadet stoppats under tiden går raden aldrig tillbaka till kön: mejlet kan
 * redan ha gått, så även den raden lämnas till en människa.
 */
export async function reclaimStale(sql: Db, now: Date): Promise<{ retried: number; review: number }> {
  const staleBefore = new Date(now.getTime() - STALE_MINUTES * 60_000);
  const windowStart = new Date(now.getTime() - IDEMPOTENCY_WINDOW_HOURS * 3_600_000);
  const expired = await sql`update outreach_messages set status = 'needs_review', last_error = 'Fastnade i sending',
                              updated_at = now()
                            where status = 'sending' and claimed_at < ${windowStart} returning id`;
  const stopped = await sql`update outreach_messages m set status = 'needs_review',
                              last_error = 'Fastnade i sending och leadet stoppades', updated_at = now()
                            from outreach_leads l
                            where l.id = m.lead_id and l.stop_reason is not null
                              and m.status = 'sending' and m.claimed_at < ${staleBefore}
                            returning m.id`;
  const retried = await sql`update outreach_messages set status = 'ready', updated_at = now()
                            where status = 'sending' and claimed_at < ${staleBefore} and claimed_at >= ${windowStart}
                            returning id`;
  return { retried: retried.length, review: expired.length + stopped.length };
}

/**
 * Senare steg blir `ready` när föregående steg är levererat och väntetiden passerat.
 * `notBeforeFor` räknar vardagar utanför SQL.
 */
export async function promoteDueSteps(
  sql: Db,
  campaign: CampaignRow,
  notBeforeFor: (deliveredAt: Date, delayBusinessDays: number) => Date,
): Promise<number> {
  let promoted = 0;
  for (const step of campaign.steps.filter((s) => s.enabled && s.step > 1)) {
    const candidates = await sql<{ id: string; deliveredAt: Date }[]>`
      select m.id, prev.sent_at as "deliveredAt"
        from outreach_messages m
        join outreach_messages prev on prev.lead_id = m.lead_id and prev.campaign_id = m.campaign_id
                                   and prev.step = m.step - 1 and prev.status = 'delivered'
        join outreach_leads l on l.id = m.lead_id
       where m.campaign_id = ${campaign.id} and m.step = ${step.step} and m.status = 'scheduled'
         and l.stop_reason is null`;
    for (const c of candidates) {
      const rows = await sql`update outreach_messages set status = 'ready',
                               not_before = ${notBeforeFor(c.deliveredAt, step.delayBusinessDays)}, updated_at = now()
                             where id = ${c.id} and status = 'scheduled' returning id`;
      promoted += rows.length;
    }
  }
  return promoted;
}

/** Riktiga utskick sedan `since` — underlaget för tak och uppvärmning. */
export async function countSentSince(sql: Db, since: Date): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from outreach_messages
     where sent_at >= ${since} and status in ('sent','delivered','bounced','complained')`;
  return row?.n ?? 0;
}

export async function firstRealSentAt(sql: Db): Promise<Date | null> {
  const [row] = await sql<{ at: Date | null }[]>`select min(sent_at) as at from outreach_messages where sent_at is not null`;
  return row?.at ?? null;
}

/* ───────────── Spärrlistan ───────────── */

export async function suppress(
  sql: Db,
  input: { email: string; reason: SuppressionReason; source: SuppressionSource; messageId?: string | null },
): Promise<boolean> {
  const email = normalizeEmail(input.email);
  const rows = await sql`
    insert into outreach_suppressions (email, reason, source, message_id)
    values (${email}, ${input.reason}, ${input.source}, ${input.messageId ?? null})
    on conflict (email) do nothing returning email`;
  await sql`update outreach_leads set status = 'suppressed', updated_at = now()
             where lower(email) = ${email} and status not in ('converted')`;
  const [lead] = await sql<{ id: string }[]>`select id from outreach_leads where lower(email) = ${email}`;
  if (lead) {
    const stop: StopReason =
      input.reason === "bounce" ? "bounced" : input.reason === "complaint" ? "complained" : "unsubscribed";
    await stopLead(sql, lead.id, stop);
  }
  return rows.length > 0;
}

export async function isSuppressed(sql: Db, email: string): Promise<boolean> {
  const [row] = await sql`select 1 from outreach_suppressions where email = ${normalizeEmail(email)}`;
  return !!row;
}

/* ───────────── Kontroll och tick ───────────── */

export interface ControlRow {
  paused: boolean;
  mode: ControlMode;
  updatedAt: Date;
}

export async function getControl(sql: Db): Promise<ControlRow> {
  const [row] = await sql<ControlRow[]>`select paused, mode, updated_at as "updatedAt" from outreach_control where id`;
  return row ?? { paused: true, mode: "dry_run", updatedAt: new Date(0) };
}

export async function setControl(sql: Db, input: { paused?: boolean; mode?: ControlMode }, by: string): Promise<void> {
  await sql`update outreach_control set paused = coalesce(${input.paused ?? null}, paused),
              mode = coalesce(${input.mode ?? null}, mode), updated_by = ${by}, updated_at = now() where id`;
}

export async function startTick(sql: Db, trigger: string): Promise<number> {
  const [row] = await sql<{ id: number }[]>`insert into outreach_ticks (trigger) values (${trigger}) returning id`;
  if (!row) throw new Error("Tick sparades inte");
  return row.id;
}

export async function finishTick(sql: Db, id: number, result: unknown): Promise<void> {
  await sql`update outreach_ticks set finished_at = now(), result = ${sql.json(result as Json)} where id = ${id}`;
}

export interface TickRow {
  id: number;
  trigger: string;
  startedAt: Date;
  finishedAt: Date | null;
  result: unknown;
}

export async function recentTicks(sql: Db, limit = 10): Promise<TickRow[]> {
  return sql<TickRow[]>`select id, trigger, started_at as "startedAt", finished_at as "finishedAt", result
                          from outreach_ticks order by started_at desc limit ${limit}`;
}

/* ───────────── Händelser ───────────── */

/** `false` om händelsen redan tagits emot — Svix skickar om vid timeout. */
export async function insertEvent(
  sql: Db,
  input: { providerEventId: string; messageId: string | null; resendId: string | null; type: string; payload: unknown; occurredAt: Date },
): Promise<boolean> {
  const rows = await sql`
    insert into outreach_events (provider_event_id, message_id, resend_id, type, payload, occurred_at)
    values (${input.providerEventId}, ${input.messageId}, ${input.resendId}, ${input.type},
            ${sql.json(input.payload as Json)}, ${input.occurredAt})
    on conflict (provider_event_id) do nothing returning id`;
  return rows.length > 0;
}

export async function setMessageStatus(sql: Db, id: string, from: readonly MessageStatus[], to: MessageStatus): Promise<boolean> {
  const rows = await sql`update outreach_messages set status = ${to}, updated_at = now()
                          where id = ${id} and status = any(${[...from]}::text[]) returning id`;
  return rows.length > 0;
}

/** Leveranshändelserna för pausreglerna, i de typer webhooken sparar. */
export async function deliveryEventsSince(
  sql: Db,
  since: Date,
): Promise<{ type: string; messageId: string | null; at: Date }[]> {
  return sql<{ type: string; messageId: string | null; at: Date }[]>`
    select type, message_id as "messageId", occurred_at as at from outreach_events where occurred_at >= ${since}`;
}

/* ───────────── Bilder ───────────── */

export interface AssetInput {
  id: string;
  leadId: string;
  kind: AssetKind;
  materialId: string;
  mime: string;
  bytes: Buffer;
  width: number;
  height: number;
  badge: unknown;
  logoStatus: "logo" | "text-only";
}

export type AssetKind = "hero" | "tile" | "persona";

/** Byter bara de bildtyper som anges, så att en dyr personbild överlever en ny skylt. */
export async function replaceAssets(
  sql: Db,
  leadId: string,
  assets: readonly AssetInput[],
  kinds: readonly AssetKind[] = ["hero", "tile"],
): Promise<void> {
  await sql`delete from outreach_assets where lead_id = ${leadId} and kind = any(${[...kinds]}::text[])`;
  for (const a of assets) {
    await sql`insert into outreach_assets (id, lead_id, kind, material_id, mime, bytes, width, height, badge, logo_status)
              values (${a.id}, ${leadId}, ${a.kind}, ${a.materialId}, ${a.mime}, ${a.bytes}, ${a.width}, ${a.height},
                      ${sql.json(a.badge as Json)}, ${a.logoStatus})`;
  }
}

export interface AssetMeta {
  id: string;
  kind: AssetKind;
  /** Skrivs bara av `prepareDemo` ur katalogen. */
  materialId: MaterialId;
  colorId: string;
  /** Skyltens form och mått ur det sparade dokumentet — bildtexten ska gälla skylten på bilden. */
  shape: BadgeShape;
  widthMm: number;
  heightMm: number;
  /** Bildens mått i pixlar. */
  width: number;
  height: number;
  logoStatus: "logo" | "text-only";
  /** Gäller bara personbilden; skylt och rutor renderas ur dokumentet och granskas inte. */
  review: AssetReview;
}

const ASSET_COLUMNS = `a.id, a.kind, a.material_id as "materialId", a.badge->>'colorId' as "colorId",
  a.badge->>'shape' as "shape", (a.badge->'size'->>'widthMm')::float8 as "widthMm",
  (a.badge->'size'->>'heightMm')::float8 as "heightMm", a.width, a.height,
  a.logo_status as "logoStatus", a.review`;

export async function assetsForLead(sql: Db, leadId: string): Promise<AssetMeta[]> {
  return sql<AssetMeta[]>`select ${sql.unsafe(ASSET_COLUMNS)} from outreach_assets a
                           where a.lead_id = ${leadId} order by a.kind, a.created_at`;
}

/** Personbilden som får visas för mottagaren: bara en som en människa har godkänt. */
export function approvedPersona<T extends Pick<AssetMeta, "kind" | "review">>(assets: readonly T[]): T | null {
  return assets.find((a) => a.kind === "persona" && a.review === "approved") ?? null;
}

export async function setPersonaReview(sql: Db, assetId: string, review: AssetReview): Promise<boolean> {
  const rows = await sql`update outreach_assets set review = ${review} where id = ${assetId} and kind = 'persona' returning id`;
  return rows.length > 0;
}

export interface PersonaForReview extends AssetMeta {
  leadId: string;
  companyName: string;
  /** Den renderade skylten att jämföra loggan mot. */
  heroId: string | null;
}

export async function personasByReview(sql: Db, review: AssetReview, limit = 200): Promise<PersonaForReview[]> {
  return sql<PersonaForReview[]>`
    select ${sql.unsafe(ASSET_COLUMNS)}, a.lead_id as "leadId", l.company_name as "companyName",
           (select h.id from outreach_assets h where h.lead_id = a.lead_id and h.kind = 'hero' limit 1) as "heroId"
      from outreach_assets a join outreach_leads l on l.id = a.lead_id
     where a.kind = 'persona' and a.review = ${review}
     order by l.company_name limit ${limit}`;
}

export async function personaReviewByLead(sql: Db): Promise<Map<string, AssetReview>> {
  const rows = await sql<{ leadId: string; review: AssetReview }[]>`
    select lead_id as "leadId", review from outreach_assets where kind = 'persona'`;
  return new Map(rows.map((r) => [r.leadId, r.review]));
}

export async function getAssetBadge(sql: Db, id: string): Promise<unknown> {
  const [row] = await sql<{ badge: unknown }[]>`select badge from outreach_assets where id = ${id}`;
  return row?.badge ?? null;
}

export async function getAssetBytes(sql: Db, id: string): Promise<{ mime: string; bytes: Buffer } | null> {
  const [row] = await sql<{ mime: string; bytes: Buffer }[]>`select mime, bytes from outreach_assets where id = ${id}`;
  return row ?? null;
}

/* ───────────── Tratten ───────────── */

export interface FunnelSourceRow {
  wave: Wave | null;
  sent: boolean;
  delivered: boolean;
  landed: boolean;
  demoOpened: boolean;
  attributed: boolean;
  /** Ordrar efter aktiveringen, från butiken eller det nya kontot; `funnelFromRows` väljer vilka som räknas. */
  orders: { isDemo: boolean; source: string }[];
}

export async function funnelRows(sql: Db): Promise<FunnelSourceRow[]> {
  return sql<FunnelSourceRow[]>`
    select l.wave,
           exists (select 1 from outreach_messages m where m.lead_id = l.id and m.sent_at is not null) as sent,
           exists (select 1 from outreach_messages m where m.lead_id = l.id and m.status in ('delivered','complained')) as delivered,
           l.landed_at is not null as landed,
           l.demo_opened_at is not null as "demoOpened",
           l.attributed_at is not null as attributed,
           coalesce((select json_agg(json_build_object('isDemo', o.is_demo, 'source', o.source))
                       from orders o
                      where l.attributed_at is not null and o.placed_at >= l.attributed_at
                        and (o.shop_slug = l.shop_slug or o.reseller_id = l.reseller_id)), '[]'::json) as orders
      from outreach_leads l`;
}
