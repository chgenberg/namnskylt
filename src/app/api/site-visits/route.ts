import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { databaseConfigured } from "@/lib/orders/repository";
import { cleanPath, deviceOf, isBotAgent, referrerHost, sourceOf, stockholmDay, visitorOf } from "@/lib/site-stats/model";
import { recordSiteVisit } from "@/lib/site-stats/repository";

export const runtime = "nodejs";

const HOUR_MS = 60 * 60 * 1000;
const perClient = createRateLimiter({ limit: 300, windowMs: HOUR_MS });
const site = createRateLimiter({ limit: 50_000, windowMs: HOUR_MS });

const visitSchema = z.strictObject({
  path: z.string().max(300),
  search: z.string().max(400).default(""),
  referrer: z.string().max(400).default(""),
});

/** Sajtens egna värdnamn: en hänvisning därifrån är ingen källa. */
const OWN_HOSTS = ["namnskylt.com", "localhost", "127.0.0.1"];

const done = () => new NextResponse(null, { status: 204 });

/**
 * En sidvisning på namnskylt.com, utan kakor (beslut av ägaren 2026-11-25). Svaret är alltid 204. Den som
 * är inloggad i panelen räknas inte, så att ägarens egna besök inte blandas in. IP-adressen sparas aldrig:
 * den blir en kod som byts varje dygn (`visitorOf`).
 */
export async function POST(request: Request) {
  try {
    const userAgent = request.headers.get("user-agent");
    if (isBotAgent(userAgent) || !databaseConfigured()) return done();
    if (/(?:^|;\s*)ns_admin=/.test(request.headers.get("cookie") ?? "")) return done();
    const secret = process.env.SITE_STATS_SECRET?.trim() || process.env.RESELLER_PASSWORD?.trim();
    if (!secret) return done();
    const parsed = visitSchema.safeParse(JSON.parse(await request.text()));
    if (!parsed.success) return done();
    const path = cleanPath(parsed.data.path);
    if (!path) return done();
    if (!perClient.take(clientKey(request)) || !site.take("site")) return done();
    const day = stockholmDay();
    await recordSiteVisit({
      day,
      visitor: visitorOf(clientKey(request), userAgent ?? "", day, secret),
      path,
      referrer: referrerHost(parsed.data.referrer, OWN_HOSTS),
      source: sourceOf(parsed.data.search),
      device: deviceOf(userAgent ?? ""),
    });
  } catch (error) {
    if (!(error instanceof SyntaxError)) console.error("Besöket sparades inte", error);
  }
  return done();
}
