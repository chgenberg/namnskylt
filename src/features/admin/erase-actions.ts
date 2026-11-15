"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eraseCustomer } from "@/lib/orders/erase";
import type { AccountErasure } from "@/lib/orders/erase-model";
import { accountErasurePlan, eraseAccount, eraseApplication } from "@/lib/reseller-auth/erase";
import { requireReseller } from "@/lib/reseller-auth/session";
import { isOwner, TENANT_ID } from "@/lib/tenants/model";

export type EraseResult = { ok: true } | { ok: false; error: string };
export type AccountPlanResult = { ok: true; plan: AccountErasure } | { ok: false; error: string };

const NOT_OWNER = "Bara namnskylt.com hanterar återförsäljarnas konton";
const NO_ACCOUNT = "Kontot finns inte";

/** Tar bort en av den inloggades egna kunder. Ordrar som hör till bokföringen behålls utan personuppgifter. */
export async function deleteCustomerAction(customerId: string): Promise<EraseResult> {
  const tenant = await requireReseller();
  const id = z.uuid().safeParse(customerId);
  if (!id.success) return { ok: false, error: "Kunden finns inte" };
  try {
    const erased = await eraseCustomer(tenant, id.data);
    if (!erased) return { ok: false, error: "Kunden finns inte" };
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (error) {
    console.error("Kunden kunde inte tas bort", error);
    return { ok: false, error: "Kunden kunde inte tas bort" };
  }
}

/** Det som tas bort och behålls om kontot raderas, till bekräftelsen. */
export async function accountErasurePlanAction(accountId: string): Promise<AccountPlanResult> {
  if (!isOwner(await requireReseller())) return { ok: false, error: NOT_OWNER };
  if (!TENANT_ID.test(accountId)) return { ok: false, error: NO_ACCOUNT };
  try {
    const plan = await accountErasurePlan(accountId);
    return plan ? { ok: true, plan } : { ok: false, error: NO_ACCOUNT };
  } catch (error) {
    console.error("Kontots innehåll kunde inte räknas", error);
    return { ok: false, error: "Kontot kunde inte läsas" };
  }
}

/** Tar bort ett återförsäljarkonto med allt som hör till det. Bara admin, och aldrig ägarens eget id. */
export async function deleteAccountAction(accountId: string): Promise<EraseResult> {
  if (!isOwner(await requireReseller())) return { ok: false, error: NOT_OWNER };
  if (!TENANT_ID.test(accountId) || isOwner(accountId)) return { ok: false, error: NO_ACCOUNT };
  try {
    const erased = await eraseAccount(accountId);
    if (!erased) return { ok: false, error: NO_ACCOUNT };
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (error) {
    console.error("Kontot kunde inte tas bort", error);
    return { ok: false, error: "Kontot kunde inte tas bort" };
  }
}

/** Tar bort en ansökan. Bara admin. */
export async function deleteApplicationAction(applicationId: string): Promise<EraseResult> {
  if (!isOwner(await requireReseller())) return { ok: false, error: NOT_OWNER };
  const id = z.uuid().safeParse(applicationId);
  if (!id.success) return { ok: false, error: "Ansökan finns inte" };
  try {
    if (!(await eraseApplication(id.data))) return { ok: false, error: "Ansökan finns inte" };
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (error) {
    console.error("Ansökan kunde inte tas bort", error);
    return { ok: false, error: "Ansökan kunde inte tas bort" };
  }
}
