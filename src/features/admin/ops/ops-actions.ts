"use server";

import { revalidatePath } from "next/cache";
import { clearErrorLog } from "@/lib/maintenance/error-log";
import { requireReseller } from "@/lib/reseller-auth/session";
import { isOwner } from "@/lib/tenants/model";

/** Tömmer felloggen. Bara admin. */
export async function clearErrorLogAction(): Promise<{ ok: true; removed: number } | { ok: false; error: string }> {
  const tenant = await requireReseller();
  if (!isOwner(tenant)) return { ok: false, error: "Bara namnskylt.com kan rensa felloggen" };
  const removed = await clearErrorLog();
  revalidatePath("/admin/drift");
  return { ok: true, removed };
}
