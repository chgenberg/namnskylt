import { NextResponse } from "next/server";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { getShopOwner } from "@/lib/shops/editor-repository";
import { shopOrderPricing } from "@/lib/shops/price-list";
import { z } from "zod";
import { MAX_ORDER_BADGES, badgeDocumentSchema } from "@/engine";
import { endPriceTable } from "@/engine/price-model";
import { orgNumberSchema } from "@/lib/company/org-number";
import { accountView, createCustomerAccount, customerAccountExists, saveAccountProfile } from "@/lib/customer-auth/accounts";
import { ACCOUNT_EXISTS_ERROR, customerPasswordSchema, profileAfterOrder, EMPTY_PROFILE, type CustomerAccountView } from "@/lib/customer-auth/model";
import { currentCustomer, signInCustomer, type CustomerCookie } from "@/lib/customer-auth/session";
import { badgeShotUploadSchema, normalizeBadgeShot } from "@/lib/images/badge-shot";
import { MISSING_LOGO_IMAGE_ERROR, missingLogoImages } from "@/lib/logo-images/repository";
import { customerPoSchema } from "@/lib/orders/customer-po";
import { deliveryAddressSchema, deliveryInstructionsSchema, deliveryPhoneIssue, shippingMethodSchema } from "@/lib/orders/delivery";
import { NOT_OFFERED_ERROR, allOffered } from "@/lib/orders/model";
import { splitByProducer } from "@/lib/orders/partner";
import { placeOrder } from "@/lib/orders/place-order";
import { attachOrderToAccount, databaseConfigured, getAccountOrder, getPriceModel } from "@/lib/orders/repository";
import { startCheckout } from "@/lib/payments/checkout";
import { CUSTOMER_TYPES } from "@/lib/payments/model";
import { paymentsConfigured } from "@/lib/payments/stripe";
import { SHOP_SLUG } from "@/lib/shops/model";
import { OWNER_TENANT, isOwner } from "@/lib/tenants/model";
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
  /** Leveransspecifikationen: kundens fritext om hur skyltarna ska skickas, till exempel till flera ställen. */
  deliveryInstructions: deliveryInstructionsSchema.optional(),
  /** Kundens eget inköpsnummer, som ska stå på fakturan. */
  customerPo: customerPoSchema,
  /** Kunden har kryssat i att köpvillkoren gäller. */
  acceptedTerms: z.literal(true, "Godkänn köpvillkoren för att beställa"),
  /** Besökets slumpade id i skyltmotorns statistik. Följer med kortbetalningen, så att den betalda ordern räknas till besöket. */
  visit: z.string().regex(/^[0-9a-f]{16,32}$/).optional(),
  /** Kunden vill ha ett konto: lösenordet som väljs i kassan. Kontot skapas när ordern är lagd. */
  account: z.object({ password: customerPasswordSchema }).optional(),
  /** En av kontots tidigare ordrar som den här beställs igen från. */
  repeatOf: z.string().regex(/^NS-\d{1,9}$/).optional(),
  /** Kassan visade kunden som inloggad. Är kunden inte det längre läggs ingen order förrän kunden har fått veta. */
  expectsAccount: z.boolean().optional(),
});

/** Så många ordrar med nytt konto får en klient försöka lägga per timme. */
const newAccounts = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });

/** Fälten vars fel är skrivna för kunden som fyller i formuläret. */
const CUSTOMER_FACING = new Set(["delivery", "acceptedTerms", "account", "customerPo"]);

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
    const { badgeShot, shop: shopSlug, delivery, shippingMethod = "standard", customerType, customer, badges, visit, account: newAccount, repeatOf, expectsAccount } =
      parsed.data;
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
    const instructions = parsed.data.deliveryInstructions ?? null;
    const orderDelivery = {
      to: "customer" as const,
      address: delivery,
      ...(shippingMethod !== "standard" && { method: shippingMethod }),
      ...(instructions && { instructions }),
    };
    // Kundens konto gäller på namnskylt.com eller i just den här butiken.
    const scope = shop?.slug ?? null;
    const signedIn = databaseConfigured() ? await currentCustomer(scope) : null;
    // Kassan visade kunden som inloggad, men inloggningen gäller inte längre. Sägs före ordern,
    // så att den inte hamnar utanför kontot utan att kunden märker det.
    if (expectsAccount && !signedIn) {
      return NextResponse.json(
        { error: "Du är inte inloggad längre. Logga in igen högst upp i varukorgen, eller skicka ordern utan konto.", signedOut: true },
        { status: 401 },
      );
    }

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
          accountId: signedIn?.id ?? null,
          customerPo: parsed.data.customerPo ?? null,
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
    // Frågan om e-postadressen redan har ett konto ställs sist, när ordern annars skulle läggas,
    // och har en gräns per klient: annars gick det att fråga sig fram till vilka som har konto.
    if (!signedIn && newAccount && databaseConfigured()) {
      if (!newAccounts.take(clientKey(request))) return bad("För många försök att skapa konto. Beställ utan konto, eller vänta en stund.", 429);
      // Sägs före ordern, så att kunden kan logga in och få ordern på sitt konto.
      if (await customerAccountExists(scope, customer.email)) {
        return bad(`${ACCOUNT_EXISTS_ERROR} Det gör du högst upp i varukorgen. Du kan också beställa utan att skapa konto.`, 409);
      }
    }

    // "Beställ igen" från kundens sida: bara en order som hör till det inloggade kontot räknas.
    const repeated = signedIn && repeatOf ? await getAccountOrder(signedIn.id, repeatOf) : null;
    const shopNote = shop ? `Beställd i butiken ${shop.profile.name}` : null;
    const buyer = { name: customer.name, email: customer.email, company, orgNumber: orgNumber.data };
    const receipt = await placeOrder({
      customer: buyer,
      badges,
      tenant: owner ?? OWNER_TENANT,
      source: shop ? "shop" : "web",
      shopSlug: shop?.slug ?? null,
      pricing: shopOrderPricing(badges, shop?.priceList, endPriceTable(priceModel)),
      priceModel,
      repeatOf: repeated?.id ?? null,
      note: repeated ? [shopNote, `Beställd igen från ${repeated.orderNo}`].filter(Boolean).join(". ") : shopNote,
      delivery: orderDelivery,
      badgeShot: await normalizeBadgeShot(badgeShot),
      accountId: signedIn?.id ?? null,
      customerPo: parsed.data.customerPo ?? null,
    });

    // Kontot får det kunden just fyllde i, så att kassan är ifylld nästa gång. Ordern är redan lagd:
    // går något fel med kontot får kunden ändå sitt kvitto.
    let account: CustomerAccountView | null = null;
    let cookie: CustomerCookie | null = null;
    let accountStatus: "created" | "exists" | undefined;
    try {
      if (signedIn) {
        const profile = profileAfterOrder(signedIn.profile, buyer, delivery);
        await saveAccountProfile(signedIn.id, profile);
        account = { email: signedIn.email, profile };
      } else if (newAccount && receipt.customerToken) {
        const created = await createCustomerAccount({
          shop: scope,
          email: customer.email,
          password: newAccount.password,
          profile: profileAfterOrder(EMPTY_PROFILE, buyer, delivery),
        });
        accountStatus = created ? "created" : "exists";
        if (created) {
          await attachOrderToAccount(created.id, receipt.orderNumber);
          cookie = await signInCustomer(created);
          account = accountView(created);
        }
      }
    } catch (error) {
      console.error("Kundkontot kunde inte sparas efter ordern", error);
    }
    // Verkstadens ordernummer är kundens ordernummer där verkstaden själv säljer: på namnskylt.com och i en butik
    // utan ägare. I en återförsäljares butik ska kunden inte möta verkstaden, så där följer numret inte med.
    const { supplierOrderNumber, ...shown } = receipt;
    const theirs = isOwner(owner ?? OWNER_TENANT) && receipt.status === "received" ? supplierOrderNumber : undefined;
    const response = NextResponse.json(
      { ...shown, ...(theirs && { supplierOrderNumber: theirs }), ...(account && { account }), ...(accountStatus && { accountStatus }) },
      { status: 201 },
    );
    if (cookie) response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    console.error("Ordern kunde inte läggas", error);
    return NextResponse.json({ error: "Ordern kunde inte läggas just nu. Försök igen om en stund." }, { status: 502 });
  }
}
