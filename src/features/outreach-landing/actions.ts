"use server";

import { headers } from "next/headers";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { requireDb } from "@/lib/db/client";
import { recordLandingDecision } from "@/lib/outreach/landing";
import { loadLanding } from "@/lib/outreach/landing-data";
import { recordLanding, setLeadInvite } from "@/lib/outreach/repository";
import { currentTenant } from "@/lib/reseller-auth/session";
import { createInvite, getInvite, getShopOwner } from "@/lib/shops/editor-repository";
import { isOwner } from "@/lib/tenants/model";

const HOUR_MS = 60 * 60 * 1000;
const activations = createRateLimiter({ limit: 10, windowMs: HOUR_MS });

async function isOwnerSession(): Promise<boolean> {
  const tenant = await currentTenant();
  return tenant !== null && isOwner(tenant);
}

/** Anropas från webbläsaren när sidan visats — länkskannrar kör sällan JavaScript. */
export async function recordLandingAction(token: string): Promise<void> {
  const data = await loadLanding(token);
  if (!data) return;
  const userAgent = (await headers()).get("user-agent");
  if (!recordLandingDecision(userAgent, await isOwnerSession())) return;
  await recordLanding(requireDb(), data.lead.id);
}

export type ActivateResult = { ok: true; inviteToken: string; email: string } | { ok: false; error: string };

/** En inbjudan till leadets butik: den oanvända återanvänds, annars skapas en ny. */
export async function activateOutreachAction(token: string): Promise<ActivateResult> {
  if (!activations.take(`activate:${token}`)) return { ok: false, error: "För många försök. Vänta en stund." };
  const data = await loadLanding(token);
  if (!data) return { ok: false, error: "Länken gäller inte längre. Svara på mejlet så hjälper vi er." };
  if (await getShopOwner(data.shop.slug)) {
    return { ok: false, error: "Butiken är redan aktiverad. Logga in med kontot som tog över den." };
  }
  const existing = data.lead.inviteToken ? await getInvite(data.lead.inviteToken) : null;
  const invite = existing ?? (await createInvite(data.shop.slug, data.lead.email));
  if (!existing) await setLeadInvite(requireDb(), data.lead.id, invite.token);
  return { ok: true, inviteToken: invite.token, email: invite.email };
}
