import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { accountView, authenticateCustomer } from "@/lib/customer-auth/accounts";
import { MAX_PASSWORD_CHARS, normalizeEmail } from "@/lib/customer-auth/model";
import { isSameSiteJson } from "@/lib/http/same-site";
import { signInCustomer, signOutCustomer, signedOutCookie } from "@/lib/customer-auth/session";
import { databaseConfigured } from "@/lib/orders/repository";
import { SHOP_SLUG } from "@/lib/shops/model";

export const runtime = "nodejs";

const HOUR_MS = 60 * 60 * 1000;
const perClient = createRateLimiter({ limit: 20, windowMs: HOUR_MS });
/** Gränsen per konto håller också mot den som gissar lösenord från många adresser. */
const perAccount = createRateLimiter({ limit: 10, windowMs: HOUR_MS });

const shopSchema = z.string().regex(SHOP_SLUG).nullish();
const loginSchema = z.strictObject({
  /** Butiken kunden loggar in i. Utelämnad = namnskylt.com. */
  shop: shopSchema,
  email: z.email().max(200),
  password: z.string().min(1).max(MAX_PASSWORD_CHARS),
});
const logoutSchema = z.strictObject({ shop: shopSchema });

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
/** Ett anrop från en annan sajt får aldrig logga in besökaren: då hamnade besökarens order på någon annans konto. */
const FOREIGN = "Anropet kom inte från sajten";

/** Slutkundens inlogg: e-post och lösenord mot ett konto på namnskylt.com eller i en butik. */
export async function POST(request: Request) {
  if (!databaseConfigured()) return fail("Inloggningen är inte påslagen", 503);
  if (!isSameSiteJson(request)) return fail(FOREIGN, 403);
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Fyll i e-post och lösenord", 400);
  const shop = parsed.data.shop ?? null;
  const tooMany = !perClient.take(clientKey(request)) || !perAccount.take(`${shop ?? ""}:${normalizeEmail(parsed.data.email)}`);
  if (tooMany) return fail("För många försök. Vänta en stund.", 429);
  const account = await authenticateCustomer(shop, parsed.data.email, parsed.data.password);
  if (!account) return fail("Fel e-post eller lösenord", 401);
  const response = NextResponse.json({ account: accountView(account) });
  const cookie = await signInCustomer(account);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}

/** Loggar ut kunden på namnskylt.com eller i butiken. */
export async function DELETE(request: Request) {
  if (!isSameSiteJson(request)) return fail(FOREIGN, 403);
  const parsed = logoutSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fail("Ogiltig förfrågan", 400);
  const shop = parsed.data.shop ?? null;
  await signOutCustomer(shop);
  const response = NextResponse.json({ ok: true });
  const cookie = signedOutCookie(shop);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
