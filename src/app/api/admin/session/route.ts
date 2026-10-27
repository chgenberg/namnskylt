import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { RESELLER_MAX_AGE_SECONDS, resellerPass } from "@/lib/reseller-auth/session";

export const runtime = "nodejs";

const perClient = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });
const bodySchema = z.object({ password: z.string().max(200) });

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
  if (!parsed.success || !resellerPass.matches(parsed.data.password)) {
    return NextResponse.json({ error: "Fel lösenord" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(resellerPass.cookie, await resellerPass.token(), cookieOptions(RESELLER_MAX_AGE_SECONDS));
  return response;
}

export function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(resellerPass.cookie, "", cookieOptions(0));
  return response;
}
