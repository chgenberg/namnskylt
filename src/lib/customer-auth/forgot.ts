import "server-only";
import { sellerBrand } from "@/lib/email/seller-brand";
import { siteBrand } from "@/lib/email/layout";
import { fromWithName, sendTransactional } from "@/lib/email/transactional";
import { noticeEmailSettings } from "@/lib/notices/email";
import { databaseConfigured } from "@/lib/orders/repository";
import { getShop } from "@/lib/shops/repository";
import { createCustomerAccessLink } from "./access-links";
import { customerAccountIdByEmail } from "./accounts";
import { accountPaths } from "./model";
import { composeCustomerResetEmail, CUSTOMER_RESET_LINK_HOURS } from "./reset-email";

/** Sant när "Glömt lösenordet?" går att använda: sajtens mejl är påslagna och det finns en databas. */
export function customerPasswordResetAvailable(): boolean {
  return noticeEmailSettings() !== null && databaseConfigured();
}

/**
 * Mejlar en länk för att välja nytt lösenord, om adressen har ett konto på stället (namnskylt.com eller
 * butiken). Säger aldrig om adressen finns: anroparen svarar likadant i båda fallen, så att formuläret
 * inte avslöjar vilka som är kunder. Kastar aldrig. Mejlet går genom samma strömbrytare som
 * återförsäljarnas lösenordslänk och butikernas orderbekräftelser (`NOTICE_RESEND_API_KEY`).
 */
export async function requestCustomerPasswordReset(shopSlug: string | null, email: string): Promise<void> {
  try {
    const settings = noticeEmailSettings();
    if (!settings || !databaseConfigured()) return;
    const shop = shopSlug ? await getShop(shopSlug) : null;
    if (shopSlug && !shop) return;
    const address = email.trim().toLowerCase();
    const accountId = await customerAccountIdByEmail(shop?.slug ?? null, address);
    if (!accountId) return;
    const link = await createCustomerAccessLink(accountId, CUSTOMER_RESET_LINK_HOURS * 60 * 60 * 1000);
    const url = `${settings.origin}${accountPaths(shop?.slug ?? null).password(link.token)}`;
    // I en butik är säljaren butiken, med eget namn och utseende och utan namnskylt.com.
    const message = shop
      ? composeCustomerResetEmail({
          to: address,
          url,
          from: fromWithName(shop.profile.name, settings.replyTo),
          replyTo: shop.profile.email || settings.replyTo,
          sellerName: shop.profile.name,
          brand: await sellerBrand(shop.profile, settings.origin),
        })
      : composeCustomerResetEmail({
          to: address,
          url,
          from: settings.from,
          replyTo: settings.replyTo,
          sellerName: "namnskylt.com",
          brand: siteBrand(settings.origin),
        });
    await sendTransactional(message, settings);
  } catch (error) {
    console.error("Kundens länk för nytt lösenord kunde inte mejlas", error);
  }
}
