"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setExpressShipping } from "@/lib/orders/repository";
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

/**
 * Sätter expressfraktens pris på en order, i hela kronor exklusive moms. Bara
 * admin: priset kommer från verkstaden och gäller alla återförsäljares ordrar.
 */
export async function setExpressShippingAction(orderNo: string, sek: number): Promise<ActionResult> {
  const tenant = await requireReseller();
  if (!isOwner(tenant)) return { ok: false, error: "Bara namnskylt.com kan sätta expressfraktens pris" };
  const parsed = z.object({ orderNo: orderNoSchema, sek: z.number().int().min(0).max(100_000) }).safeParse({ orderNo, sek });
  if (!parsed.success) return { ok: false, error: "Ange priset i hela kronor" };
  const saved = await setExpressShipping(parsed.data.orderNo, parsed.data.sek);
  revalidatePath("/admin", "layout");
  return saved ? { ok: true, orderNo: parsed.data.orderNo } : { ok: false, error: "Priset gick inte att spara. Ordern har inte expressfrakt, eller priset är redan detsamma." };
}
