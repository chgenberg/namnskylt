import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { accountView, createCustomerAccount } from "@/lib/customer-auth/accounts";
import { ACCOUNT_EXISTS_ERROR, customerPasswordSchema, profileFromDraft } from "@/lib/customer-auth/model";
import { signInCustomer } from "@/lib/customer-auth/session";
import { isSameSiteJson } from "@/lib/http/same-site";
import { databaseConfigured } from "@/lib/orders/repository";
import { SHOP_SLUG } from "@/lib/shops/model";
import { getShop } from "@/lib/shops/repository";

export const runtime = "nodejs";

const perClient = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });

const bodySchema = z.strictObject({
  /** Butiken kontot skapas i. Utelämnad = namnskylt.com. */
  shop: z.string().regex(SHOP_SLUG).nullish(),
  email: z.email().max(200),
  password: customerPasswordSchema,
  /** Kundens uppgifter, om kunden vill fylla i dem direkt. Kassan är då ifylld redan vid första ordern. */
  profile: z.unknown().optional(),
});

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * Skapar ett kundkonto från inloggningssidan och loggar in det. I kassan
 * skapas kontot i stället tillsammans med ordern (`POST /api/orders`).
 */
export async function POST(request: Request) {
  if (!databaseConfigured()) return fail("Det går inte att skapa konto just nu", 503);
  // Ett anrop från en annan sajt får aldrig skapa ett konto och logga in besökaren på det.
  if (!isSameSiteJson(request)) return fail("Anropet kom inte från sajten", 403);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue?.path[0] === "password" ? issue.message : "Fyll i e-post och lösenord", 400);
  }
  if (!perClient.take(clientKey(request))) return fail("För många försök. Vänta en stund.", 429);
  const shop = parsed.data.shop ?? null;
  if (shop && !(await getShop(shop))) return fail("Butiken finns inte", 404);
  // Uppgifterna får lämnas tomma. Det som fylls i ska gå att använda i kassan.
  const profile = profileFromDraft(parsed.data.profile);
  if (!profile.ok) return fail(profile.error, 400);
  const account = await createCustomerAccount({ shop, email: parsed.data.email, password: parsed.data.password, profile: profile.profile });
  if (!account) return fail(ACCOUNT_EXISTS_ERROR, 409);
  const response = NextResponse.json({ account: accountView(account) }, { status: 201 });
  const cookie = await signInCustomer(account);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
