import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { authenticate } from "@/lib/reseller-auth/accounts";
import { RESELLER_MAX_AGE_SECONDS, resellerPass, sessionToken } from "@/lib/reseller-auth/session";
import { OWNER_TENANT } from "@/lib/tenants/model";

export const runtime = "nodejs";

const perClient = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });
const bodySchema = z.object({ email: z.email().max(200).optional(), password: z.string().min(1).max(200) });

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function POST(request: Request) {
  if (!resellerPass.configured()) {
    return NextResponse.json({ error: "Inloggningen är inte konfigurerad" }, { status: 503 });
  }
  if (!perClient.take(clientKey(request))) {
    return NextResponse.json({ error: "För många försök. Vänta en stund." }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Fyll i e-post och lösenord" }, { status: 400 });
  const { email, password } = parsed.data;
  // Med e-post: ett återförsäljarkonto. Utan: ägarens lösenord i miljön (namnskylt.com).
  const tenant = email
    ? ((await authenticate(email, password))?.id ?? null)
    : resellerPass.matches(password)
      ? OWNER_TENANT
      : null;
  if (!tenant) return NextResponse.json({ error: "Fel e-post eller lösenord" }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(resellerPass.cookie, sessionToken(tenant), cookieOptions(RESELLER_MAX_AGE_SECONDS));
  return response;
}

export function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(resellerPass.cookie, "", cookieOptions(0));
  return response;
}
