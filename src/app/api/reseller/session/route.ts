import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { databaseConfigured } from "@/lib/orders/repository";
import { authenticate } from "@/lib/reseller-auth/accounts";
import { resellerPass } from "@/lib/reseller-auth/session";
import { signInCookies } from "@/lib/reseller-auth/sign-in";

export const runtime = "nodejs";

const perClient = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });
const bodySchema = z.strictObject({ email: z.email().max(200), password: z.string().min(1).max(200) });

/**
 * Återförsäljarens inlogg: e-post och lösenord mot ett konto i `reseller_accounts`.
 * Ger aldrig admin-inlogget — `authenticate` släpper inte igenom ägarens id.
 */
export async function POST(request: Request) {
  // Kakan signeras med RESELLER_PASSWORD; utan det går ingen att logga in.
  if (!resellerPass.configured() || !databaseConfigured()) {
    return NextResponse.json({ error: "Inloggningen är inte konfigurerad" }, { status: 503 });
  }
  if (!perClient.take(clientKey(request))) {
    return NextResponse.json({ error: "För många försök. Vänta en stund." }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Fyll i e-post och lösenord" }, { status: 400 });
  const account = await authenticate(parsed.data.email, parsed.data.password);
  if (!account) return NextResponse.json({ error: "Fel e-post eller lösenord" }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  for (const cookie of await signInCookies(account.id)) response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
