import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { resellerPass } from "@/lib/reseller-auth/session";
import { signInCookies } from "@/lib/reseller-auth/sign-in";
import { OWNER_TENANT } from "@/lib/tenants/model";

export const runtime = "nodejs";

const perClient = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });
/** Bara lösenordet. Ett anrop med e-post hör till återförsäljarens inlogg och avvisas här. */
const bodySchema = z.strictObject({ password: z.string().min(1).max(200) });

/** Admin-inlogget: namnskylt.coms eget, med lösenordet i `RESELLER_PASSWORD`. */
export async function POST(request: Request) {
  if (!resellerPass.configured()) {
    return NextResponse.json({ error: "Inloggningen är inte konfigurerad" }, { status: 503 });
  }
  if (!perClient.take(clientKey(request))) {
    return NextResponse.json({ error: "För många försök. Vänta en stund." }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Fyll i lösenordet" }, { status: 400 });
  if (!resellerPass.matches(parsed.data.password)) return NextResponse.json({ error: "Fel lösenord" }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  for (const cookie of await signInCookies(OWNER_TENANT)) response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}

/** Loggar ut, vilket av de två inloggen kakan än kom från. */
export function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(resellerPass.cookie, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
