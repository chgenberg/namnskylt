"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { siteOrigin } from "@/lib/http/origin";
import { createAccessLink } from "@/lib/reseller-auth/access-links";
import { accountExists, passwordMatches, setPassword } from "@/lib/reseller-auth/accounts";
import { decideApplication, getApplication } from "@/lib/reseller-auth/applications";
import { MIN_PASSWORD_CHARS } from "@/lib/reseller-auth/limits";
import { requireReseller } from "@/lib/reseller-auth/session";
import { isOwner, TENANT_ID } from "@/lib/tenants/model";

/** En hemlig länk att skicka vidare. Koden visas bara här; i databasen ligger dess hash. */
export type LinkResult = { ok: true; url: string; email: string; expiresAt: string } | { ok: false; error: string };
export type DecisionResult = { ok: true } | { ok: false; error: string };

const NOT_OWNER = "Bara namnskylt.com hanterar återförsäljarnas konton";

async function linkUrl(token: string): Promise<string> {
  return `${await siteOrigin()}/aterforsaljare/konto/${token}`;
}

/** Godkänner en ansökan och ger länken där den sökande väljer lösenord. Kontot skapas först då. */
export async function approveApplicationAction(applicationId: string): Promise<LinkResult> {
  if (!isOwner(await requireReseller())) return { ok: false, error: NOT_OWNER };
  const id = z.uuid().safeParse(applicationId);
  if (!id.success) return { ok: false, error: "Ansökan finns inte" };
  const application = await getApplication(id.data);
  if (!application) return { ok: false, error: "Ansökan finns inte" };
  if (application.status === "rejected") return { ok: false, error: "Ansökan är avslagen" };
  if (application.accountId) return { ok: false, error: "Kontot är redan skapat" };
  if (application.status === "pending" && !(await decideApplication(id.data, "approved"))) {
    return { ok: false, error: "Ansökan är redan avgjord" };
  }
  // En redan godkänd ansökan får en ny länk; den gamla slutar gälla.
  const link = await createAccessLink({ applicationId: id.data });
  revalidatePath("/admin", "layout");
  return { ok: true, url: await linkUrl(link.token), email: application.email, expiresAt: link.expiresAt };
}

export async function rejectApplicationAction(applicationId: string): Promise<DecisionResult> {
  if (!isOwner(await requireReseller())) return { ok: false, error: NOT_OWNER };
  const id = z.uuid().safeParse(applicationId);
  if (!id.success || !(await decideApplication(id.data, "rejected"))) return { ok: false, error: "Ansökan är redan avgjord" };
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** En länk där kontots ägare väljer nytt lösenord. Äldre länkar för kontot slutar gälla. */
export async function passwordLinkAction(accountId: string, email: string): Promise<LinkResult> {
  if (!isOwner(await requireReseller())) return { ok: false, error: NOT_OWNER };
  if (!TENANT_ID.test(accountId) || isOwner(accountId) || !(await accountExists(accountId))) return { ok: false, error: "Kontot finns inte" };
  const link = await createAccessLink({ accountId });
  return { ok: true, url: await linkUrl(link.token), email, expiresAt: link.expiresAt };
}

const changeSchema = z.object({ current: z.string().min(1).max(200), next: z.string().min(MIN_PASSWORD_CHARS).max(200) });

/** Återförsäljaren byter sitt eget lösenord. Admin-inlogget har inget konto och byts i driftmiljön. */
export async function changePasswordAction(input: { current: string; next: string }): Promise<DecisionResult> {
  const tenant = await requireReseller();
  if (isOwner(tenant)) return { ok: false, error: "Admin-lösenordet byts i driftmiljön" };
  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Det nya lösenordet ska ha minst ${MIN_PASSWORD_CHARS} tecken` };
  if (!(await passwordMatches(tenant, parsed.data.current))) return { ok: false, error: "Det nuvarande lösenordet stämmer inte" };
  await setPassword(tenant, parsed.data.next);
  return { ok: true };
}
