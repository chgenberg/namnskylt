import "server-only";
import type { SellerProfile } from "@/lib/company/seller";
import { darkPlate, isLightLogo } from "@/lib/images/logo-tone";
import { siteBrand, type EmailBrand } from "./layout";
import { mailLogo, type MailLogo } from "./seller-logo";

/** Säljarens logga för mejl, med mörk platta bakom en ljus logga. `null` när säljaren saknar logga. */
export async function sellerMailLogo(seller: SellerProfile): Promise<MailLogo | null> {
  if (!seller.logo) return null;
  return mailLogo(seller.logo, (await isLightLogo(seller.logo)) ? darkPlate(seller.primaryColor) : null);
}

/**
 * Hur säljaren ser ut överst i ett mejl. namnskylt.com har sajtens logga. En
 * återförsäljare har sin egen logga när `logoUrl` är en adress där den går att
 * hämta, annars sitt namn, och alltid sin egen färg på knappen.
 */
export async function sellerBrand(seller: SellerProfile, origin: string, logoUrl: string | null = null): Promise<EmailBrand> {
  if (seller.site) return siteBrand(origin);
  const logo = logoUrl ? await sellerMailLogo(seller) : null;
  return { name: seller.name, logo: logo ? { url: logoUrl as string, width: logo.width, height: logo.height } : null, accent: seller.primaryColor };
}
