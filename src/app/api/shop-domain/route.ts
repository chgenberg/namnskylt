import { NextResponse } from "next/server";
import { databaseConfigured } from "@/lib/orders/repository";
import { isValidDomain, normalizeHost } from "@/lib/shops/host";
import { shopSlugForDomain } from "@/lib/shops/repository";

export const runtime = "nodejs";

/** Butiken bakom en egen domän — för middleware, som inte når databasen. Butikerna är ändå publika. */
export async function GET(request: Request) {
  const host = normalizeHost(new URL(request.url).searchParams.get("host"));
  if (!databaseConfigured() || !isValidDomain(host)) return NextResponse.json({ slug: null });
  return NextResponse.json({ slug: await shopSlugForDomain(host).catch(() => null) }, { headers: { "cache-control": "no-store" } });
}
