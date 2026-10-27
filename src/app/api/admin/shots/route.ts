import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { badgeShotUploadSchema, normalizeBadgeShot } from "@/lib/images/badge-shot";
import { databaseConfigured, saveMissingBadgeShot } from "@/lib/orders/repository";
import { resellerPass } from "@/lib/reseller-auth/session";

export const runtime = "nodejs";

const requestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("order"), id: z.string().regex(/^NS-\d{1,9}$/), badgeShot: badgeShotUploadSchema.unwrap() }),
  z.object({ kind: z.literal("quote"), id: z.string().regex(/^OF-\d{1,9}$/), badgeShot: badgeShotUploadSchema.unwrap() }),
]);

/** Stillbild i efterhand för en order eller offert som saknar en. */
export async function PUT(request: Request) {
  if (!(await resellerPass.verify((await cookies()).get(resellerPass.cookie)?.value))) {
    return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  }
  if (!databaseConfigured()) return NextResponse.json({ error: "Databasen är inte kopplad" }, { status: 503 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ogiltig bild" }, { status: 400 });
  const shot = await normalizeBadgeShot(parsed.data.badgeShot);
  if (!shot) return NextResponse.json({ error: "Bilden gick inte att läsa" }, { status: 422 });
  const saved = await saveMissingBadgeShot(parsed.data.kind, parsed.data.id, shot);
  return NextResponse.json({ saved });
}
