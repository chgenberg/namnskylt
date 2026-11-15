"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { NoticeTarget } from "@/lib/notices/model";
import { markNoticesRead } from "@/lib/notices/repository";
import { requireReseller } from "@/lib/reseller-auth/session";

const targetSchema = z.union([
  z.strictObject({ orderNo: z.string().regex(/^NS-\d{1,9}$/) }),
  z.strictObject({ quoteNo: z.string().regex(/^OF-\d{1,9}$/) }),
  z.strictObject({ kind: z.literal("application") }),
  z.strictObject({ all: z.literal(true) }),
]) satisfies z.ZodType<NoticeTarget>;

/**
 * Märker den inloggades besked som lästa: de som gäller en order, en offert
 * eller ansökningarna när den sidan öppnas, eller alla på en gång.
 */
export async function markNoticesReadAction(target: NoticeTarget): Promise<{ ok: boolean }> {
  const tenant = await requireReseller();
  const parsed = targetSchema.safeParse(target);
  if (!parsed.success) return { ok: false };
  try {
    // Siffran i menyn ligger i layouten, som bara läses om när något faktiskt ändrats.
    if ((await markNoticesRead(tenant, parsed.data)) > 0) revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (error) {
    console.error("Beskeden kunde inte märkas som lästa", error);
    return { ok: false };
  }
}
