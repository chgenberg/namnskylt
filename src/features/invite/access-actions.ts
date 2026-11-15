"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { DEFAULT_COMPANY } from "@/lib/company/profile";
import { saveCompanyProfile, saveResellerDeliveryAddress } from "@/lib/orders/repository";
import { consumeAccessLink, findAccessLink } from "@/lib/reseller-auth/access-links";
import { accountIdByEmail, createAccount, freeTenantId, setPassword } from "@/lib/reseller-auth/accounts";
import { tenantSlug } from "@/lib/reseller-auth/application-model";
import { getApplication, linkApplicationAccount } from "@/lib/reseller-auth/applications";
import { MIN_PASSWORD_CHARS } from "@/lib/reseller-auth/limits";
import { signInCookies } from "@/lib/reseller-auth/sign-in";

const HOUR_MS = 60 * 60 * 1000;
const attempts = createRateLimiter({ limit: 20, windowMs: HOUR_MS });
const passwordSchema = z.string().min(MIN_PASSWORD_CHARS).max(200);

export type AccessResult = { ok: true } | { ok: false; error: string };

const GONE = "Länken är använd eller har gått ut. Be namnskylt.com om en ny.";

/**
 * Väljer lösenord via en hemlig länk. En länk från en godkänd ansökan skapar
 * kontot med ansökans uppgifter; en återställningslänk byter lösenordet på ett
 * konto som finns. Länken gäller en gång, och den som lyckas är inloggad.
 */
export async function setPasswordAction(token: string, password: string): Promise<AccessResult> {
  if (!attempts.take(`access:${token}`)) return { ok: false, error: "För många försök. Vänta en stund." };
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { ok: false, error: `Lösenordet ska ha minst ${MIN_PASSWORD_CHARS} tecken` };
  const link = await findAccessLink(token);
  if (!link) return { ok: false, error: GONE };

  let tenant: string;
  if (link.kind === "reset") {
    if (!link.accountId || !(await consumeAccessLink(token))) return { ok: false, error: GONE };
    await setPassword(link.accountId, parsed.data);
    tenant = link.accountId;
  } else {
    const application = link.applicationId ? await getApplication(link.applicationId) : null;
    if (!application || application.status !== "approved" || application.accountId) return { ok: false, error: GONE };
    if (await accountIdByEmail(application.email)) {
      return { ok: false, error: "Det finns redan ett konto med den e-postadressen. Logga in, eller be namnskylt.com om en ny lösenordslänk." };
    }
    if (!(await consumeAccessLink(token))) return { ok: false, error: GONE };
    tenant = await freeTenantId(tenantSlug(application.company));
    await createAccount({ id: tenant, name: application.company, email: application.email, password: parsed.data });
    // Ansökans uppgifter blir företagets: de står på offerterna och är det verkstaden fakturerar.
    await saveCompanyProfile(tenant, {
      ...DEFAULT_COMPANY,
      name: application.company,
      tagline: "",
      orgNumber: application.orgNumber,
      address: application.address,
      email: application.email,
      invoiceEmail: application.invoiceEmail,
      phone: application.phone,
      website: application.website,
    });
    // Leveransadressen blir den som fylls i när skyltarna ska "till oss".
    if (application.delivery) await saveResellerDeliveryAddress(tenant, application.delivery);
    await linkApplicationAccount(application.id, tenant);
  }
  const jar = await cookies();
  for (const cookie of await signInCookies(tenant)) jar.set(cookie.name, cookie.value, cookie.options);
  return { ok: true };
}
