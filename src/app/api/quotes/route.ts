import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_ORDER_BADGES, badgeDocumentSchema } from "@/engine";
import { endPriceTable } from "@/engine/price-model";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { orgNumberSchema } from "@/lib/company/org-number";
import { requireDb } from "@/lib/db/client";
import { badgeShotUploadSchema, normalizeBadgeShot } from "@/lib/images/badge-shot";
import { MISSING_LOGO_IMAGE_ERROR, missingLogoImages } from "@/lib/logo-images/repository";
import { customerPoSchema } from "@/lib/orders/customer-po";
import { ERASED_CUSTOMER_ERROR, isErasedCustomer } from "@/lib/orders/erase-model";
import { NOT_OFFERED_ERROR, allOffered } from "@/lib/orders/model";
import { databaseConfigured, getPriceModel, upsertCustomer } from "@/lib/orders/repository";
import { isUnassignedCustomer } from "@/lib/orders/unassigned-customer";
import { isOutreachPreviewShop, OUTREACH_PREVIEW_ORDER_ERROR } from "@/lib/outreach/demo-source";
import { shopHasOutreachLead } from "@/lib/outreach/repository";
import { createQuote } from "@/lib/quotes/repository";
import { normalizeQuoteShots, quoteShotsUploadSchema } from "@/lib/quotes/shots";
import { getShopOwner } from "@/lib/shops/editor-repository";
import { SHOP_SLUG } from "@/lib/shops/model";
import { shopOrderPricing } from "@/lib/shops/price-list";
import { getShop } from "@/lib/shops/repository";
import { OWNER_TENANT } from "@/lib/tenants/model";

export const runtime = "nodejs";

const HOUR_MS = 60 * 60 * 1000;
/** Varje offert sparar skyltar och bilder, och vem som helst kan göra en: taken skyddar databasen. */
const perClient = createRateLimiter({ limit: 12, windowMs: HOUR_MS });
const site = createRateLimiter({ limit: 600, windowMs: 24 * HOUR_MS });

const requestSchema = z.object({
  /** Kunden som gör offerten: samma uppgifter som i kassan, eftersom en godkänd offert blir en order som faktureras. */
  customer: z.object({
    name: z.string().trim().min(1, "Skriv ditt namn").max(120),
    email: z.email("Skriv en e-postadress").max(200),
    company: z.string().trim().max(120),
    orgNumber: z.string().trim().max(20),
  }),
  badges: z.array(badgeDocumentSchema).min(1).max(MAX_ORDER_BADGES),
  badgeShot: badgeShotUploadSchema,
  /** Bilderna ur 3D-vyn, en plats per design. */
  shots: quoteShotsUploadSchema,
  project: z.string().trim().max(120).optional(),
  /** Kundens eget inköpsnummer, som ska stå på fakturan. */
  customerPo: customerPoSchema,
  shop: z.string().regex(SHOP_SLUG).optional(),
});

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * En slutkund gör en offert själv i skyltmotorn och laddar ner den (besked av ägaren 2026-11-20:
 * "ska kunna ladda hem en offert exakt som en återförsäljare men då med sina slutpriser"). Offerten
 * sparas hos säljaren, namnskylt.com eller butikens ägare, till kundens pris, och väntar på svar:
 * kunden godkänner den på sin egen sida, dit länken står i PDF:en, och då blir den en order.
 *
 * Inget mejlas, och ingen behöver vara inloggad. Kunden anger samma uppgifter som i kassan.
 * Leveransadressen fylls i när offerten godkänns: den som gör offerten har inte bekräftat sin
 * e-postadress, så en adress ur kundregistret får aldrig hamna på offerten.
 */
export async function POST(request: Request) {
  if (!databaseConfigured()) return bad("Offerten går inte att spara just nu.", 503);
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return bad(issue?.path[0] === "customer" ? issue.message : "Ogiltig offert");
  }
  if (!perClient.take(clientKey(request)) || !site.take("site")) return bad("Många offerter på kort tid. Försök igen om en stund.", 429);
  const { customer, badges, shop: shopSlug } = parsed.data;
  if (!allOffered(badges)) return bad(NOT_OFFERED_ERROR);

  // En godkänd offert blir en order som faktureras, och fakturan kräver företag och organisationsnummer.
  const company = customer.company.trim();
  const orgNumber = orgNumberSchema.safeParse(customer.orgNumber);
  if (company.length < 2) return bad("Ange företagets namn");
  if (!orgNumber.success) return bad("Organisationsnumret ska ha tio siffror");
  const email = customer.email.trim().toLowerCase();
  // En borttagen kunds rad får aldrig skrivas över, och inte heller platshållaren för utkast utan kund.
  if (isErasedCustomer({ email })) return bad(ERASED_CUSTOMER_ERROR, 409);
  if (isUnassignedCustomer({ email })) return bad("E-postadressen går inte att använda");

  try {
    const shop = shopSlug ? await getShop(shopSlug) : null;
    if (shopSlug && !shop) return bad("Butiken finns inte", 404);
    // Webbshoppen och butiker utan ägare är namnskylt.coms; en övertagen butik är återförsäljarens.
    const owner = shop ? await getShopOwner(shop.slug) : null;
    if (shop && isOutreachPreviewShop({ ownerId: owner, hasOutreachLead: await shopHasOutreachLead(requireDb(), shop.slug) })) {
      return bad(OUTREACH_PREVIEW_ORDER_ERROR, 409);
    }
    if (await missingLogoImages(badges)) return bad(MISSING_LOGO_IMAGE_ERROR);
    const tenant = owner ?? OWNER_TENANT;
    const saved = await upsertCustomer(tenant, { name: customer.name, email, company, orgNumber: orgNumber.data });
    const priceModel = await getPriceModel();
    const { quoteNo, token } = await createQuote({
      tenant,
      customerId: saved.id,
      badges,
      demo: saved.demo,
      badgeShot: await normalizeBadgeShot(parsed.data.badgeShot),
      project: parsed.data.project || null,
      customerPo: parsed.data.customerPo ?? null,
      // Adressen fylls i när offerten godkänns, aldrig ur kundregistret.
      delivery: { to: "customer", address: null },
      // Butikens priser, som när kunden beställer i butiken. Annars listpris.
      pricing: shopOrderPricing(badges, shop?.priceList, endPriceTable(priceModel)),
      shots: await normalizeQuoteShots(parsed.data.shots),
      byCustomer: true,
    });
    return NextResponse.json({ quoteNo, pdfPath: `/offert/${token}/pdf`, quotePath: `/offert/${token}` }, { status: 201 });
  } catch (error) {
    console.error("Kundens offert kunde inte sparas", error);
    return bad("Offerten kunde inte sparas just nu. Försök igen om en stund.", 500);
  }
}
