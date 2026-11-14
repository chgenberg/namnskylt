"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { accountIdByEmail, authenticate, createAccount, freeTenantId } from "@/lib/reseller-auth/accounts";
import { signInCookies } from "@/lib/reseller-auth/sign-in";
import { requireDb } from "@/lib/db/client";
import { attributeLead, leadIdForInvite } from "@/lib/outreach/repository";
import { acceptInvite, getInvite } from "@/lib/shops/editor-repository";
import { MIN_PASSWORD_CHARS } from "./limits";

const HOUR_MS = 60 * 60 * 1000;
const attempts = createRateLimiter({ limit: 20, windowMs: HOUR_MS });

const claimSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(200),
  password: z.string().min(MIN_PASSWORD_CHARS).max(200),
});

export type ClaimResult = { ok: true; slug: string } | { ok: false; error: string };

/**
 * Återförsäljaren tar över sin butik: nytt konto, eller ett befintligt med
 * rätt lösenord. Inloggad direkt efteråt.
 */
export async function claimInviteAction(token: string, input: unknown): Promise<ClaimResult> {
  if (!attempts.take(`invite:${token}`)) return { ok: false, error: "För många försök. Vänta en stund." };
  const invite = await getInvite(token);
  if (!invite) return { ok: false, error: "Inbjudan är använd eller har gått ut. Be om en ny." };
  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Fyll i namn, e-post och ett lösenord på minst ${MIN_PASSWORD_CHARS} tecken` };
  const { name, email, password } = parsed.data;
  const outreachLead = await leadIdForInvite(requireDb(), token);
  if (outreachLead && email.trim().toLowerCase() !== invite.email) {
    return { ok: false, error: `Använd e-postadressen inbjudan gäller: ${invite.email}` };
  }

  const existing = await accountIdByEmail(email);
  let tenant: string;
  if (existing) {
    const account = await authenticate(email, password);
    if (!account) return { ok: false, error: "Det finns redan ett konto med den e-posten — skriv dess lösenord" };
    tenant = account.id;
  } else {
    tenant = await freeTenantId(invite.slug);
    await createAccount({ id: tenant, name, email, password });
  }
  if (!(await acceptInvite(token, tenant))) return { ok: false, error: "Inbjudan är använd eller har gått ut. Be om en ny." };
  if (outreachLead) await attributeLead(requireDb(), { inviteToken: token, email, resellerId: tenant });
  const jar = await cookies();
  for (const cookie of await signInCookies(tenant)) jar.set(cookie.name, cookie.value, cookie.options);
  return { ok: true, slug: invite.slug };
}
