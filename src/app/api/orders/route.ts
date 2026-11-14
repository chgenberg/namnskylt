import { NextResponse } from "next/server";
import { getShopOwner } from "@/lib/shops/editor-repository";
import { shopOrderPricing } from "@/lib/shops/price-list";
import { z } from "zod";
import { MAX_ORDER_BADGES, badgeDocumentSchema } from "@/engine";
import { endPriceTable } from "@/engine/price-model";
import { badgeShotUploadSchema, normalizeBadgeShot } from "@/lib/images/badge-shot";
import { deliveryAddressSchema } from "@/lib/orders/delivery";
import { NOT_OFFERED_ERROR, allOffered } from "@/lib/orders/model";
import { placeOrder } from "@/lib/orders/place-order";
import { databaseConfigured, getPriceModel } from "@/lib/orders/repository";
import { SHOP_SLUG } from "@/lib/shops/model";
import { OWNER_TENANT } from "@/lib/tenants/model";
import { getShop } from "@/lib/shops/repository";
import { requireDb } from "@/lib/db/client";
import { isOutreachPreviewShop, OUTREACH_PREVIEW_ORDER_ERROR } from "@/lib/outreach/demo-source";
import { shopHasOutreachLead } from "@/lib/outreach/repository";

const orderRequestSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.email(),
    company: z.string().trim().max(120).optional(),
  }),
  badges: z.array(badgeDocumentSchema).min(1).max(MAX_ORDER_BADGES),
  badgeShot: badgeShotUploadSchema,
  shop: z.string().regex(SHOP_SLUG).optional(),
  /** Vart skyltarna skickas. Kunden beställer själv, så de går alltid till kunden. */
  delivery: deliveryAddressSchema,
});

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = orderRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      // Adressens fel är skrivna för kunden som fyller i formuläret.
      { error: issue?.path[0] === "delivery" ? issue.message : "Ogiltig order", issues: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  if (!allOffered(parsed.data.badges)) return NextResponse.json({ error: NOT_OFFERED_ERROR }, { status: 400 });

  try {
    const { badgeShot, shop: shopSlug, delivery, ...order } = parsed.data;
    const shop = shopSlug && databaseConfigured() ? await getShop(shopSlug) : null;
    if (shopSlug && !shop) return NextResponse.json({ error: "Butiken finns inte" }, { status: 404 });
    // Webbshoppen och demobutikerna är namnskylt.coms; en övertagen butik är återförsäljarens.
    const owner = shop ? await getShopOwner(shop.slug) : null;
    if (shop && isOutreachPreviewShop({ ownerId: owner, hasOutreachLead: await shopHasOutreachLead(requireDb(), shop.slug) })) {
      return NextResponse.json({ error: OUTREACH_PREVIEW_ORDER_ERROR }, { status: 409 });
    }
    const priceModel = await getPriceModel();
    const receipt = await placeOrder({
      ...order,
      tenant: owner ?? OWNER_TENANT,
      source: shop ? "shop" : "web",
      shopSlug: shop?.slug ?? null,
      pricing: shopOrderPricing(order.badges, shop?.priceList, endPriceTable(priceModel)),
      priceModel,
      note: shop ? `Beställd i butiken ${shop.profile.name}` : null,
      delivery: { to: "customer", address: delivery },
      badgeShot: await normalizeBadgeShot(badgeShot),
    });
    return NextResponse.json(receipt, { status: 201 });
  } catch (error) {
    console.error("Ordern kunde inte läggas hos leverantören", error);
    return NextResponse.json({ error: "Leverantören kunde inte ta emot ordern" }, { status: 502 });
  }
}
