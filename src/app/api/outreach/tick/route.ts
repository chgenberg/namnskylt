import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { runOutreachTickNow } from "@/lib/outreach/run-tick";

export const runtime = "nodejs";

const MIN_SECRET_LENGTH = 32;
const failures = createRateLimiter({ limit: 10, windowMs: 15 * 60_000 });

function bearerMatches(header: string | null, secret: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Extern cron var femte minut. Samma funktion som knappen i admin. */
export async function POST(request: Request) {
  const secret = process.env.OUTREACH_TICK_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    return NextResponse.json({ error: "Ticken är inte aktiverad" }, { status: 503 });
  }
  const key = clientKey(request);
  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    if (!failures.take(key)) return NextResponse.json({ error: "För många försök" }, { status: 429 });
    return NextResponse.json({ error: "Fel hemlighet" }, { status: 401 });
  }
  const result = await runOutreachTickNow("cron");
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
