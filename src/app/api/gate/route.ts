import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { GATE_COOKIE, GATE_MAX_AGE_SECONDS, gateToken, isValidGateCookie, passwordMatches } from "@/lib/site-gate/token";

export const runtime = "nodejs";

const perClient = createRateLimiter({ limit: 20, windowMs: 60 * 60 * 1000 });
const bodySchema = z.object({ password: z.string().max(200) });

function cookie(token: string) {
  return {
    name: GATE_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GATE_MAX_AGE_SECONDS,
  };
}

export async function GET(request: Request) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${GATE_COOKIE}=`))
    ?.slice(GATE_COOKIE.length + 1);
  return NextResponse.json({ ok: await isValidGateCookie(value) });
}

export async function POST(request: Request) {
  if (!perClient.take(clientKey(request))) {
    return NextResponse.json({ error: "För många försök. Vänta en stund." }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !passwordMatches(parsed.data.password)) {
    return NextResponse.json({ error: "Fel kod" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookie(await gateToken()));
  return response;
}
