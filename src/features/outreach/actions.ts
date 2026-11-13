"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { emailMode } from "@/lib/email";
import { getCompanyProfile } from "@/lib/orders/repository";
import { ASSET_REVIEWS, CONTROL_MODES, DEFAULT_CAMPAIGN_STEPS, WAVES } from "@/lib/outreach/model";
import { ASSET_ID_PATTERN } from "@/lib/outreach/badge-asset";
import * as store from "@/lib/outreach/repository";
import { runOutreachTickNow } from "@/lib/outreach/run-tick";
import { approvalBlockers, BLOCKER_LABELS } from "@/lib/outreach/send-gate";
import type { TickResult } from "@/lib/outreach/tick";
import { requireReseller } from "@/lib/reseller-auth/session";
import { isOwner, OWNER_TENANT } from "@/lib/tenants/model";

const DEFAULT_CAMPAIGN_SLUG = "aterforsaljare-v1";

const idsSchema = z.array(z.uuid()).min(1).max(500);

async function requireOwner(): Promise<string> {
  const tenant = await requireReseller();
  if (!isOwner(tenant)) throw new Error("Bara namnskylt.com har utskick");
  return tenant;
}

const refresh = () => revalidatePath("/admin/utskick", "layout");

/** Kampanjen skapas första gången något godkänns; den startar som utkast. */
async function currentCampaign(sql: ReturnType<typeof store.outreachDb>) {
  const existing = (await store.listCampaigns(sql)).find((c) => c.slug === DEFAULT_CAMPAIGN_SLUG);
  if (existing) return existing;
  const company = await getCompanyProfile(OWNER_TENANT);
  const domain = process.env.OUTREACH_SENDING_DOMAIN?.trim() || "mail.namnskylt.com";
  return store.upsertCampaign(sql, {
    slug: DEFAULT_CAMPAIGN_SLUG,
    name: "Återförsäljare — namnskyltar som kanal",
    fromName: "Namnskylt",
    fromEmail: `hej@${domain}`,
    replyTo: company.email,
    signature: {},
    dailyCap: 40,
    steps: DEFAULT_CAMPAIGN_STEPS,
  });
}

export type ApproveResult = { ok: true; approved: number; refused: { id: string; reasons: string[] }[] } | { ok: false; error: string };

export async function approveLeadsAction(ids: string[]): Promise<ApproveResult> {
  const by = await requireOwner();
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Välj minst ett lead" };
  const sql = store.outreachDb();
  const heroes = await store.leadIdsWithHero(sql);
  const refused: { id: string; reasons: string[] }[] = [];
  const allowed: string[] = [];
  for (const id of parsed.data) {
    const lead = await store.getLead(sql, id);
    if (!lead) continue;
    const blockers = approvalBlockers(lead, { suppressed: await store.isSuppressed(sql, lead.email), heroReady: heroes.has(id) });
    if (blockers.length) refused.push({ id, reasons: blockers.map((b) => BLOCKER_LABELS[b]) });
    else allowed.push(id);
  }
  const campaign = await currentCampaign(sql);
  const approved = await store.approveLeads(sql, allowed, by);
  await store.ensureMessages(sql, campaign, approved);
  refresh();
  return { ok: true, approved: approved.length, refused };
}

const waveSchema = z.enum(WAVES).nullable();

export async function setWaveAction(ids: string[], wave: string | null): Promise<{ ok: boolean }> {
  await requireOwner();
  const parsedIds = idsSchema.safeParse(ids);
  const parsedWave = waveSchema.safeParse(wave);
  if (!parsedIds.success || !parsedWave.success) return { ok: false };
  await store.setLeadWave(store.outreachDb(), parsedIds.data, parsedWave.data);
  refresh();
  return { ok: true };
}

const controlSchema = z.object({ paused: z.boolean().optional(), mode: z.enum(CONTROL_MODES).optional() });

export async function setControlAction(input: { paused?: boolean; mode?: string }): Promise<{ ok: boolean; error?: string }> {
  const by = await requireOwner();
  const parsed = controlSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ogiltigt val" };
  if (parsed.data.mode === "live" && emailMode() !== "live") {
    return { ok: false, error: "Live kräver RESEND_API_KEY och att OUTREACH_DISABLED inte är satt" };
  }
  await store.setControl(store.outreachDb(), parsed.data, by);
  refresh();
  return { ok: true };
}

export async function setCampaignActiveAction(active: boolean): Promise<{ ok: boolean }> {
  await requireOwner();
  const sql = store.outreachDb();
  const campaign = await currentCampaign(sql);
  await store.setCampaignStatus(sql, campaign.id, active ? "active" : "paused", active ? null : "Pausad av operatör");
  refresh();
  return { ok: true };
}

export async function runTickAction(): Promise<TickResult> {
  await requireOwner();
  const result = await runOutreachTickNow("admin");
  refresh();
  return result;
}

export async function stopLeadAction(id: string): Promise<{ ok: boolean }> {
  await requireOwner();
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false };
  await store.stopLead(store.outreachDb(), parsed.data, "manual");
  refresh();
  return { ok: true };
}

const reviewSchema = z.object({ assetId: z.string().regex(ASSET_ID_PATTERN), review: z.enum(ASSET_REVIEWS) });

/** Godkänd personbild följer med i mejlet; annars visar mejlet bara skylten. */
export async function reviewPersonaAction(assetId: string, review: string): Promise<{ ok: boolean }> {
  await requireOwner();
  const parsed = reviewSchema.safeParse({ assetId, review });
  if (!parsed.success) return { ok: false };
  const ok = await store.setPersonaReview(store.outreachDb(), parsed.data.assetId, parsed.data.review);
  refresh();
  return { ok };
}
