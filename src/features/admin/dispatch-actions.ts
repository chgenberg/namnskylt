"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireReseller } from "@/lib/reseller-auth/session";
import { dispatchOrder } from "@/lib/supplier/dispatch";
import { isOwner } from "@/lib/tenants/model";
import type { ActionResult } from "./actions";

const orderNoSchema = z.string().regex(/^NS-\d{1,9}$/);

/** Skickar en väntande order till Skylt & Gravyrteknik. Bara admin, och bara när kopplingen är aktiverad. */
export async function dispatchOrderAction(orderNo: string): Promise<ActionResult> {
  const tenant = await requireReseller();
  if (!isOwner(tenant)) return { ok: false, error: "Bara namnskylt.com kan skicka ordrar till verkstaden" };
  const parsed = orderNoSchema.safeParse(orderNo);
  if (!parsed.success) return { ok: false, error: "Ogiltigt ordernummer" };
  const result = await dispatchOrder(parsed.data);
  revalidatePath("/admin", "layout");
  return result.ok ? { ok: true, orderNo: parsed.data } : { ok: false, error: result.error };
}
