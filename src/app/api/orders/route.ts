import { NextResponse } from "next/server";
import { getShopOwner } from "@/lib/shops/editor-repository";
import { shopOrderPricing } from "@/lib/shops/price-list";
import { z } from "zod";
import { MAX_ORDER_BADGES, badgeDocumentSchema } from "@/engine";
import { endPriceTable } from "@/engine/price-model";
import { orgNumberSchema } from "@/lib/company/org-number";
import { badgeShotUploadSchema, normalizeBadgeShot } from "@/lib/images/badge-shot";
import { MISSING_LOGO_IMAGE_ERROR, missingLogoImages } from "@/lib/logo-images/repository";
import { deliveryAddressSchema, deliveryPhoneIssue, shippingMethodSchema } from "@/lib/orders/delivery";
import { NOT_OFFERED_ERROR, allOffered } from "@/lib/orders/model";
import { splitByProducer } from "@/lib/orders/partner";
import { placeOrder } from "@/lib/orders/place-order";
import { databaseConfigured, getPriceModel } from "@/lib/orders/repository";
import { startCheckout } from "@/lib/payments/checkout";
import { CUSTOMER_TYPES } from "@/lib/payments/model";
import { paymentsConfigured } from "@/lib/payments/stripe";
import { SHOP_SLUG } from "@/lib/shops/model";
import { OWNER_TENANT } from "@/lib/tenants/model";
import { getShop } from "@/lib/shops/repository";
import { requireDb } from "@/lib/db/client";
import { isOutreachPreviewShop, OUTREACH_PREVIEW_ORDER_ERROR } from "@/lib/outreach/demo-source";
import { shopHasOutreachLead } from "@/lib/outreach/repository";

const orderRequestSchema = z.object({
  /** Ett företag faktureras och anger organisationsnummer. En privatperson betalar med kort. */
  customerType: z.enum(CUSTOMER_TYPES),
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.email(),
    company: z.string().trim().max(120).optional(),
    orgNumber: z.string().trim().max(20).optional(),
  }),
  badges: z.array(badgeDocumentSchema).min(1).max(MAX_ORDER_BADGES),
  badgeShot: badgeShotUploadSchema,
  shop: z.string().regex(SHOP_SLUG).optional(),
  /** Vart skyltarna skickas. Kunden beställer själv, så de går alltid till kunden. */
  delivery: deliveryAddressSchema,
  /** Leveranssättet kunden valde i kassan. Utelämnat = standardfrakt. */
  shippingMethod: shippingMethodSchema.optional(),
  /** Kunden har kryssat i att köpvillkoren gäller. */
  acceptedTerms: z.literal(true, "Godkänn köpvillkoren för att beställa"),
  /** Besökets slumpade id i skyltmotorns statistik. Följer med kortbetalningen, så att den betalda ordern räknas till besöket. */
  visit: z.string().regex(/^[0-9a-f]{16,32}$/).optional(),
});

/** Fälten vars fel är skrivna för kunden som fyller i formuläret. */
const CUSTOMER_FACING = new Set(["delivery", "acceptedTerms"]);

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = orderRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: issue && CUSTOMER_FACING.has(String(issue.path[0])) ? issue.message : "Ogiltig order", issues: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  if (!allOffered(parsed.data.badges)) return bad(NOT_OFFERED_ERROR);
  // En leverans som fraktas behöver mottagarens telefon. Formuläret kräver den; här gäller samma regel.
  const phoneIssue = deliveryPhoneIssue(parsed.data.delivery, parsed.data.shippingMethod);
  if (phoneIssue) return bad(phoneIssue);

  try {
    const { badgeShot, shop: shopSlug, delivery, shippingMethod = "standard", customerType, customer, badges, visit } = parsed.data;
    // Upphämtningen pekar ut verkstadens adress och erbjuds inte i en återförsäljares butik.
    if (shopSlug && shippingMethod === "pickup") return bad("Upphämtning går inte att välja i butiken");
    const shop = shopSlug && databaseConfigured() ? await getShop(shopSlug) : null;
    if (shopSlug && !shop) return bad("Butiken finns inte", 404);
    // Webbshoppen och demobutikerna är namnskylt.coms; en övertagen butik är återförsäljarens.
    const owner = shop ? await getShopOwner(shop.slug) : null;
    if (shop && isOutreachPreviewShop({ ownerId: owner, hasOutreachLead: await shopHasOutreachLead(requireDb(), shop.slug) })) {
      return bad(OUTREACH_PREVIEW_ORDER_ERROR, 409);
    }
    const priceModel = await getPriceModel();
    const orderDelivery = { to: "customer" as const, address: delivery, ...(shippingMethod !== "standard" && { method: shippingMethod }) };

    if (customerType === "private") {
      // Kortbetalningen går till namnskylt.com. I en butik säljer återförsäljaren, som fakturerar sina kunder själv.
      if (shop) return bad("I butiken beställer företag på faktura. Ange företagsnamn och organisationsnummer.");
      if (!paymentsConfigured() || !databaseConfigured()) return bad("Kortbetalning är inte aktiverad än. Beställ som företag, eller hör av dig till oss.");
      // Expressfraktens pris sätts i efterhand och går inte att betala i förväg.
      if (shippingMethod === "express") return bad("Expressfrakt går inte att välja med kortbetalning. Välj standardfrakt eller upphämtning.");
      if (splitByProducer(badges).partner.length > 0) return bad("Skylten tillverkas på förfrågan och går inte att betala med kort.");
      if (await missingLogoImages(badges)) return bad(MISSING_LOGO_IMAGE_ERROR);
      const checkout = await startCheckout(
        {
          customer: { name: customer.name, email: customer.email },
          badges,
          delivery: orderDelivery,
          badgeShot: await normalizeBadgeShot(badgeShot),
          visit: visit ?? null,
        },
        priceModel,
      );
      // Ingen order finns än: kunden skickas till betalningen, och ordern läggs när den är klar.
      return NextResponse.json({ status: "payment", url: checkout.url });
    }

    // Ett företag faktureras, och fakturan kräver ett organisationsnummer.
    const company = customer.company?.trim() ?? "";
    const orgNumber = orgNumberSchema.safeParse(customer.orgNumber ?? "");
    if (company.length < 2) return bad("Ange företagets namn");
    if (!orgNumber.success) return bad("Organisationsnumret ska ha tio siffror");

    const receipt = await placeOrder({
      customer: { name: customer.name, email: customer.email, company, orgNumber: orgNumber.data },
      badges,
      tenant: owner ?? OWNER_TENANT,
      source: shop ? "shop" : "web",
      shopSlug: shop?.slug ?? null,
      pricing: shopOrderPricing(badges, shop?.priceList, endPriceTable(priceModel)),
      priceModel,
      note: shop ? `Beställd i butiken ${shop.profile.name}` : null,
      delivery: orderDelivery,
      badgeShot: await normalizeBadgeShot(badgeShot),
    });
    return NextResponse.json(receipt, { status: 201 });
  } catch (error) {
    console.error("Ordern kunde inte läggas", error);
    return NextResponse.json({ error: "Ordern kunde inte läggas just nu. Försök igen om en stund." }, { status: 502 });
  }
}
