import { NextResponse } from "next/server";
import { requireDb } from "@/lib/db/client";
import { siteOrigin } from "@/lib/http/origin";
import { recordLandingDecision } from "@/lib/outreach/landing";
import { loadLanding } from "@/lib/outreach/landing-data";
import { recordDemoOpened } from "@/lib/outreach/repository";
import { currentTenant } from "@/lib/reseller-auth/session";
import { isOwner } from "@/lib/tenants/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Öppna butiken": räknar öppningen och skickar vidare till designern med leadets skylt förifylld. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = new URL(request.url);
  const origin = await siteOrigin();
  const data = await loadLanding(token);
  if (!data) return NextResponse.redirect(new URL(`/for/${encodeURIComponent(token)}`, origin), 303);

  const tenant = await currentTenant();
  if (recordLandingDecision(request.headers.get("user-agent"), tenant !== null && isOwner(tenant))) {
    await recordDemoOpened(requireDb(), data.lead.id);
  }
  const asset = data.tiles.find((t) => t.id === url.searchParams.get("f")) ?? data.hero;
  const target = new URL(`/butik/${data.shop.slug}/skapa`, origin);
  target.searchParams.set("f", asset.id);
  return NextResponse.redirect(target, 303);
}
