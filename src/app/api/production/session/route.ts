import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { PRODUCTION_COOKIE_PATH, PRODUCTION_MAX_AGE_SECONDS, productionPass } from "@/lib/production-auth/session";

export const runtime = "nodejs";

const perClient = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });
const bodySchema = z.object({ password: z.string().max(200) });

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: PRODUCTION_COOKIE_PATH,
    maxAge,
  };
}

export async function POST(request: Request) {
  if (!productionPass.configured()) return NextResponse.json({ error: "Inte tillgängligt" }, { status: 404 });
  if (!perClient.take(clientKey(request))) {
    return NextResponse.json({ error: "För många försök. Vänta en stund." }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !productionPass.matches(parsed.data.password)) {
    return NextResponse.json({ error: "Fel kod" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(productionPass.cookie, await productionPass.token(), cookieOptions(PRODUCTION_MAX_AGE_SECONDS));
  return response;
}

export function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(productionPass.cookie, "", cookieOptions(0));
  return response;
}
