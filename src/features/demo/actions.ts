"use server";

import { headers } from "next/headers";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { DEMO_CONTACT } from "@/lib/callback/contact";
import { composeCallbackEmail } from "@/lib/callback/email";
import { demoLeadFor } from "@/lib/callback/lead";
import { callbackRequestSchema } from "@/lib/callback/model";
import { requireDb } from "@/lib/db/client";
import { sendTransactional } from "@/lib/email/transactional";
import { noticeEmailSettings } from "@/lib/notices/email";
import { recordLandingDecision } from "@/lib/outreach/landing";
import { recordCallback, recordLanding } from "@/lib/outreach/repository";
import { currentTenant } from "@/lib/reseller-auth/session";
import { isOwner } from "@/lib/tenants/model";

const HOUR_MS = 60 * 60 * 1000;
const perClient = createRateLimiter({ limit: 5, windowMs: HOUR_MS });
const sitewide = createRateLimiter({ limit: 200, windowMs: 24 * HOUR_MS });

export type CallbackResult = { ok: true } | { ok: false; error: string };

const CALL_INSTEAD = `Det gick inte att skicka just nu. Ring ${DEMO_CONTACT.firstName} på ${DEMO_CONTACT.phone} i stället.`;

/**
 * Någon vill bli uppringd (besked av ägaren 2026-11-25): namn och nummer går som mejl till
 * hej@namnskylt.com, genom samma strömbrytare som sajtens övriga mejl (`NOTICE_RESEND_API_KEY`).
 * Inget sparas. Går mejlet inte iväg får besökaren veta det och numret att ringa i stället.
 */
export async function requestCallbackAction(input: unknown): Promise<CallbackResult> {
  const client = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "okänd";
  if (!perClient.take(`callback:${client}`)) return { ok: false, error: "För många försök. Vänta en stund, eller ring oss." };
  // Ett fält som bara en robot fyller i. Svaret ser ut som ett lyckat.
  if (typeof input === "object" && input !== null && "fax" in input && (input as { fax?: unknown }).fax) return { ok: true };
  const parsed = callbackRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Kontrollera uppgifterna" };
  const settings = noticeEmailSettings();
  if (!settings || !sitewide.take("callback")) return { ok: false, error: CALL_INSTEAD };
  const lead = await demoLeadFor(parsed.data.k).catch(() => null);
  const message = composeCallbackEmail(
    { name: parsed.data.name, phone: parsed.data.phone, company: lead?.company ?? null, leadEmail: lead?.email ?? null, at: new Date() },
    settings,
  );
  const sent = await sendTransactional(message, { apiKey: settings.apiKey, apiUrl: settings.apiUrl });
  // Utskickets översikt visar vem som bad om att bli uppringd (2026-11-25). Ett fel här stoppar inte svaret.
  if (sent && lead) await recordCallback(requireDb(), lead.leadId).catch(() => undefined);
  return sent ? { ok: true } : { ok: false, error: CALL_INSTEAD };
}

/** Räknar besöket från utskicksmejlet, först i webbläsaren, så att länkskannrar inte räknas. */
export async function recordDemoVisitAction(token: string): Promise<void> {
  const lead = await demoLeadFor(token).catch(() => null);
  if (!lead) return;
  const tenant = await currentTenant();
  const userAgent = (await headers()).get("user-agent");
  if (!recordLandingDecision(userAgent, tenant !== null && isOwner(tenant))) return;
  await recordLanding(requireDb(), lead.leadId);
}
