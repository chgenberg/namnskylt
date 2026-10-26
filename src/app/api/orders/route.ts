import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_ORDER_BADGES, badgeDocumentSchema, layoutBadge, renderBadgeSvg } from "@/engine";
import { loadNodeFontEngine } from "@/lib/fonts/load-node";
import { createSupplierClient } from "@/lib/supplier/client";
import { toSupplierSignDocument } from "@/lib/supplier/map";

const orderRequestSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.email(),
    company: z.string().trim().max(120).optional(),
  }),
  badges: z.array(badgeDocumentSchema).min(1).max(MAX_ORDER_BADGES),
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

  const { customer, badges } = parsed.data;
  try {
    const fonts = await loadNodeFontEngine();
    const receipt = await createSupplierClient().placeOrder({
      customer,
      lines: badges.map((badge, i) => ({
        document: toSupplierSignDocument(badge, fonts),
        productionSvg: renderBadgeSvg(badge, layoutBadge(badge, fonts), {
          mode: "production",
          fonts,
        }),
        quantity: badge.quantity,
        reference: `NS-${i + 1}`,
      })),
    });
    return NextResponse.json(receipt, { status: 201 });
  } catch (error) {
    console.error("Ordern kunde inte läggas hos leverantören", error);
    return NextResponse.json({ error: "Leverantören kunde inte ta emot ordern" }, { status: 502 });
  }
}
