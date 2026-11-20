import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_ORDER_BADGES, badgeDocumentSchema } from "@/engine";
import { endPriceTable } from "@/engine/price-model";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { requireDb } from "@/lib/db/client";
import { badgeShotUploadSchema, normalizeBadgeShot } from "@/lib/images/badge-shot";
import { MISSING_LOGO_IMAGE_ERROR, missingLogoImages } from "@/lib/logo-images/repository";
import { customerPoSchema } from "@/lib/orders/customer-po";
import { NOT_OFFERED_ERROR, allOffered } from "@/lib/orders/model";
import { databaseConfigured, getPriceModel } from "@/lib/orders/repository";
import { isOutreachPreviewShop, OUTREACH_PREVIEW_ORDER_ERROR } from "@/lib/outreach/demo-source";
import { shopHasOutreachLead } from "@/lib/outreach/repository";
import { saveCustomerQuote } from "@/lib/quotes/customer-quote";
import { normalizeQuoteShots, quoteShotsUploadSchema } from "@/lib/quotes/shots";
import { getShopOwner } from "@/lib/shops/editor-repository";
import { SHOP_SLUG } from "@/lib/shops/model";
import { shopOrderPricing } from "@/lib/shops/price-list";
import { getShop } from "@/lib/shops/repository";
import { OWNER_TENANT } from "@/lib/tenants/model";

export const runtime = "nodejs";

const HOUR_MS = 60 * 60 * 1000;
/** Varje offert sparar skyltar och bilder, och vem som helst kan göra en utan att uppge något: taken skyddar databasen. */
const perClient = createRateLimiter({ limit: 8, windowMs: HOUR_MS });
const site = createRateLimiter({ limit: 300, windowMs: 24 * HOUR_MS });

const requestSchema = z.object({
  /**
   * Det kunden vill ha stående på offerten om sig själv. Allt är frivilligt: offerten ska gå att ladda
   * ner utan att fylla i något (besked av ägaren 2026-11-20). Uppgifterna krävs först när den godkänns.
   */
  customer: z
    .object({
      name: z.string().trim().max(120).optional(),
      email: z.union([z.literal(""), z.email("E-postadressen går inte att läsa").max(200)]).optional(),
      company: z.string().trim().max(120).optional(),
      orgNumber: z.string().trim().max(20).optional(),
    })
    .optional(),
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
 * **Inget behöver fyllas i** (ägarens besked samma dag: offerten ska gå att ladda ner bara för att
 * visa kollegorna hur skyltarna blir). Ingen behöver vara inloggad, och kunden får inget mejl.
 * Offerten sparas utan kund i kundregistret. Kunden läggs upp, med kassans uppgifter och
 * leveransadressen, först när offerten godkänns. Den som äger panelen får ett besked om
 * offerten (`saveCustomerQuote`).
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

  try {
    const shop = shopSlug ? await getShop(shopSlug) : null;
    if (shopSlug && !shop) return bad("Butiken finns inte", 404);
    // Webbshoppen och butiker utan ägare är namnskylt.coms; en övertagen butik är återförsäljarens.
    const owner = shop ? await getShopOwner(shop.slug) : null;
    if (shop && isOutreachPreviewShop({ ownerId: owner, hasOutreachLead: await shopHasOutreachLead(requireDb(), shop.slug) })) {
      return bad(OUTREACH_PREVIEW_ORDER_ERROR, 409);
    }
    if (await missingLogoImages(badges)) return bad(MISSING_LOGO_IMAGE_ERROR);
    const priceModel = await getPriceModel();
    // Offerten sparas, och den som äger panelen får ett besked om den.
    const { quoteNo, token } = await saveCustomerQuote({
      tenant: owner ?? OWNER_TENANT,
      requester: customer ?? null,
      badges,
      badgeShot: await normalizeBadgeShot(parsed.data.badgeShot),
      project: parsed.data.project || null,
      customerPo: parsed.data.customerPo ?? null,
      // Butikens priser, som när kunden beställer i butiken. Annars listpris.
      pricing: shopOrderPricing(badges, shop?.priceList, endPriceTable(priceModel)),
      shots: await normalizeQuoteShots(parsed.data.shots),
    });
    return NextResponse.json({ quoteNo, pdfPath: `/offert/${token}/pdf`, quotePath: `/offert/${token}` }, { status: 201 });
  } catch (error) {
    console.error("Kundens offert kunde inte sparas", error);
    return bad("Offerten kunde inte sparas just nu. Försök igen om en stund.", 500);
  }
}
