"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createCustomerAccessLink } from "@/lib/customer-auth/access-links";
import { deleteCustomerAccount, managedCustomerAccount } from "@/lib/customer-auth/accounts";
import { accountPaths } from "@/lib/customer-auth/model";
import { siteOrigin } from "@/lib/http/origin";
import { requireReseller } from "@/lib/reseller-auth/session";
import type { DecisionResult, LinkResult } from "./reseller-admin-actions";

const NO_ACCOUNT = "Kontot finns inte";

/** Kundkontot, om den inloggade sköter det: sina butikers kunder, och för namnskylt.com även de egna. */
async function managedAccount(accountId: string) {
  const tenant = await requireReseller();
  const id = z.uuid().safeParse(accountId);
  return id.success ? managedCustomerAccount(tenant, id.data) : null;
}

/**
 * En länk där kunden väljer nytt lösenord. Sajten skickar inga mejl, så den
 * som sköter kontot skickar länken själv. Äldre länkar för kontot slutar gälla.
 */
export async function customerPasswordLinkAction(accountId: string): Promise<LinkResult> {
  const account = await managedAccount(accountId);
  if (!account) return { ok: false, error: NO_ACCOUNT };
  const link = await createCustomerAccessLink(account.id);
  return {
    ok: true,
    url: `${await siteOrigin()}${accountPaths(account.shop).password(link.token)}`,
    email: account.email,
    expiresAt: link.expiresAt,
  };
}

/** Tar bort ett kundkonto. Kundens ordrar står kvar, utan koppling till kontot. */
export async function deleteCustomerAccountAction(accountId: string): Promise<DecisionResult> {
  const account = await managedAccount(accountId);
  if (!account || !(await deleteCustomerAccount(account.id))) return { ok: false, error: NO_ACCOUNT };
  revalidatePath("/admin/kunder");
  return { ok: true };
}
