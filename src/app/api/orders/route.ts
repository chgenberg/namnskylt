import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_ORDER_BADGES, badgeDocumentSchema } from "@/engine";
import { badgeShotUploadSchema, normalizeBadgeShot } from "@/lib/images/badge-shot";
import { placeOrder } from "@/lib/orders/place-order";

const orderRequestSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.email(),
    company: z.string().trim().max(120).optional(),
  }),
  badges: z.array(badgeDocumentSchema).min(1).max(MAX_ORDER_BADGES),
  badgeShot: badgeShotUploadSchema,
});

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = orderRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ogiltig order", issues: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const { badgeShot, ...order } = parsed.data;
    const receipt = await placeOrder({ ...order, source: "web", badgeShot: await normalizeBadgeShot(badgeShot) });
    return NextResponse.json(receipt, { status: 201 });
  } catch (error) {
    console.error("Ordern kunde inte läggas hos leverantören", error);
    return NextResponse.json({ error: "Leverantören kunde inte ta emot ordern" }, { status: 502 });
  }
}
