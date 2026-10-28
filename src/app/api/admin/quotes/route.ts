import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_ORDER_BADGES, badgeDocumentSchema } from "@/engine";
import { badgeShotUploadSchema, normalizeBadgeShot } from "@/lib/images/badge-shot";
import { databaseConfigured, getCustomer } from "@/lib/orders/repository";
import { createQuote } from "@/lib/quotes/repository";
import { resellerPass } from "@/lib/reseller-auth/session";

export const runtime = "nodejs";

const requestSchema = z.object({
  customerId: z.uuid(),
  badges: z.array(badgeDocumentSchema).min(1).max(MAX_ORDER_BADGES),
  badgeShot: badgeShotUploadSchema,
  project: z.string().trim().max(120).optional(),
});

/** Skyltmotorn i offertläge: samma skyltar som en order, men inget skickas till tillverkningen. */
export async function POST(request: Request) {
  if (!(await resellerPass.verify((await cookies()).get(resellerPass.cookie)?.value))) {
    return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  }
  if (!databaseConfigured()) return NextResponse.json({ error: "Databasen är inte kopplad" }, { status: 503 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ogiltig offert" }, { status: 400 });

  const customer = await getCustomer(parsed.data.customerId);
  if (!customer) return NextResponse.json({ error: "Kunden finns inte" }, { status: 404 });
  try {
    const { quoteNo } = await createQuote({
      customerId: customer.id,
      badges: parsed.data.badges,
      demo: customer.demo,
      badgeShot: await normalizeBadgeShot(parsed.data.badgeShot),
      project: parsed.data.project || null,
    });
    return NextResponse.json({ quoteNo }, { status: 201 });
  } catch (error) {
    console.error("Offerten kunde inte skapas", error);
    return NextResponse.json({ error: "Offerten kunde inte sparas" }, { status: 500 });
  }
}
