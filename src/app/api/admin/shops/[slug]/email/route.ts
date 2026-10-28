import { NextResponse } from "next/server";
import { siteOrigin } from "@/lib/http/origin";
import { darkPlate, isLightLogo } from "@/lib/images/logo-tone";
import { buildShopEmail } from "@/lib/outreach/shop-email";
import { databaseConfigured, getCompanyProfile } from "@/lib/orders/repository";
import { currentTenant } from "@/lib/reseller-auth/session";
import { SHOP_SLUG } from "@/lib/shops/model";
import { getShop } from "@/lib/shops/repository";
import { isOwner } from "@/lib/tenants/model";

export const runtime = "nodejs";

/** Mejlet till en butiks återförsäljare, för förhandsvisningen i panelen. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const tenant = await currentTenant();
  if (!tenant || !isOwner(tenant)) {
    return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  }
  const { slug } = await params;
  if (!databaseConfigured() || !SHOP_SLUG.test(slug)) return NextResponse.json({ error: "Hittades inte" }, { status: 404 });
  const [shop, sender, origin] = await Promise.all([getShop(slug), getCompanyProfile(tenant), siteOrigin()]);
  if (!shop) return NextResponse.json({ error: "Hittades inte" }, { status: 404 });
  const base = `${origin}/butik/${shop.slug}`;
  const email = buildShopEmail({
    shop,
    shopUrl: base,
    mockupUrl: `${base}/mejlbild`,
    logoUrl: shop.profile.logo ? `${base}/logo` : null,
    logoPlate: (await isLightLogo(shop.profile.logo)) ? darkPlate(shop.profile.primaryColor) : null,
    sender,
    unsubscribeUrl: `${origin}/avregistrera?butik=${shop.slug}`,
  });
  return NextResponse.json({ ...email, to: shop.profile.email || null, from: sender.email || null });
}
