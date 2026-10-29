import { NextResponse } from "next/server";
import { shopOrderPricing } from "@/lib/shops/price-list";
import { z } from "zod";
import { MAX_ORDER_BADGES, badgeDocumentSchema } from "@/engine";
import { badgeShotUploadSchema, normalizeBadgeShot } from "@/lib/images/badge-shot";
import { placeOrder } from "@/lib/orders/place-order";
import { databaseConfigured } from "@/lib/orders/repository";
import { SHOP_SLUG } from "@/lib/shops/model";
import { OWNER_TENANT } from "@/lib/tenants/model";
import { getShop } from "@/lib/shops/repository";

const orderRequestSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.email(),
    company: z.string().trim().max(120).optional(),
  }),
  badges: z.array(badgeDocumentSchema).min(1).max(MAX_ORDER_BADGES),
  badgeShot: badgeShotUploadSchema,
  shop: z.string().regex(SHOP_SLUG).optional(),
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
    const { badgeShot, shop: shopSlug, ...order } = parsed.data;
    const shop = shopSlug && databaseConfigured() ? await getShop(shopSlug) : null;
    if (shopSlug && !shop) return NextResponse.json({ error: "Butiken finns inte" }, { status: 404 });
    // Webbshoppen och demobutikerna är namnskylt.coms egna.
    const receipt = await placeOrder({
      ...order,
      tenant: OWNER_TENANT,
      source: shop ? "shop" : "web",
      shopSlug: shop?.slug ?? null,
      pricing: shopOrderPricing(order.badges, shop?.priceList),
      note: shop ? `Beställd i butiken ${shop.profile.name}` : null,
      badgeShot: await normalizeBadgeShot(badgeShot),
    });
    return NextResponse.json(receipt, { status: 201 });
  } catch (error) {
    console.error("Ordern kunde inte läggas hos leverantören", error);
    return NextResponse.json({ error: "Leverantören kunde inte ta emot ordern" }, { status: 502 });
  }
}
