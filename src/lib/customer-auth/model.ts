import { z } from "zod";
import { orgNumberSchema } from "@/lib/company/org-number";
import { deliveryAddressSchema, type DeliveryAddress } from "@/lib/orders/delivery";

/**
 * Slutkundens konto (beslut av ägaren 2026-11-17). Kunden loggar in med e-post
 * och lösenord för att slippa fylla i sina uppgifter igen och för att se sina
 * ordrar. Ett konto hör till namnskylt.com eller till en butik: `shop` är
 * butikens adress, och `null` är namnskylt.com. Samma e-post får ha ett konto
 * på varje ställe.
 */

/** Kortaste lösenordet ett kundkonto får ha. */
export const MIN_CUSTOMER_PASSWORD_CHARS = 8;
export const MAX_PASSWORD_CHARS = 200;
/** Så länge gäller en inloggning. Kunden beställer sällan, och ska ändå känna igen sig nästa gång. */
export const CUSTOMER_SESSION_DAYS = 180;

export const customerPasswordSchema = z
  .string()
  .min(MIN_CUSTOMER_PASSWORD_CHARS, `Lösenordet ska ha minst ${MIN_CUSTOMER_PASSWORD_CHARS} tecken`)
  .max(MAX_PASSWORD_CHARS);

/** Svaret när e-postadressen redan har ett konto på samma ställe. */
export const ACCOUNT_EXISTS_ERROR = "Det finns redan ett konto med den e-postadressen. Logga in i stället.";

/** E-postadressen som kontot sparas och slås upp med. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Kakan med inloggningen. Butikerna ligger på samma adress som namnskylt.com och får därför var sin. */
export function customerCookieName(shop: string | null): string {
  return shop ? `ns_kund_${shop}` : "ns_kund";
}

/** Kontots sidor: på namnskylt.com eller i butiken. */
export function accountPaths(shop: string | null) {
  const base = shop ? `/butik/${shop}` : "";
  return {
    home: `${base}/konto`,
    login: `${base}/konto/logga-in`,
    designer: `${base}/skapa`,
    /** Länken där kunden väljer nytt lösenord. */
    password: (token: string) => `${base}/konto/losenord/${token}`,
    /** Skyltmotorn med en tidigare order i varukorgen. */
    reorder: (orderNo: string) => `${base}/skapa?igen=${encodeURIComponent(orderNo)}`,
  };
}

/** Det kunden fyllde i senast. Kassan fylls i med det nästa gång. */
export interface AccountProfile {
  name: string;
  company: string;
  orgNumber: string;
  delivery: DeliveryAddress | null;
}

export const EMPTY_PROFILE: AccountProfile = { name: "", company: "", orgNumber: "", delivery: null };

/** Kontot som det lämnar servern: aldrig med lösenordets hash eller kontots id. */
export interface CustomerAccountView {
  email: string;
  profile: AccountProfile;
}

const text = (max: number) => z.string().trim().max(max).catch("");

const storedProfileSchema = z.object({
  name: text(120),
  company: text(120),
  orgNumber: text(20),
  delivery: deliveryAddressSchema.nullable().catch(null),
});

/** Läser en sparad profil. Det som saknas eller inte går att läsa blir tomt. */
export function parseProfile(value: unknown): AccountProfile {
  const parsed = storedProfileSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : EMPTY_PROFILE;
}

/** Uppgifterna som kunden ändrar under Mitt konto. Organisationsnumret får vara tomt, men inte fel. */
export const profileInputSchema = z.object({
  name: z.string().trim().max(120),
  company: z.string().trim().max(120),
  orgNumber: z.union([z.literal(""), orgNumberSchema], "Organisationsnumret ska ha tio siffror"),
  delivery: deliveryAddressSchema.nullable(),
}) satisfies z.ZodType<AccountProfile, unknown>;

/** Profilen efter en order: det kunden just fyllde i gäller, och det som inte fylldes i står kvar. */
export function profileAfterOrder(
  previous: AccountProfile,
  customer: { name: string; company?: string | null; orgNumber?: string | null },
  delivery: DeliveryAddress | null,
): AccountProfile {
  return {
    name: customer.name.trim() || previous.name,
    company: customer.company?.trim() || previous.company,
    orgNumber: customer.orgNumber?.trim() || previous.orgNumber,
    delivery: delivery ?? previous.delivery,
  };
}

/** Koden i en inloggningskaka eller en lösenordslänk: 32 slumpade byte i base64url. */
export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
