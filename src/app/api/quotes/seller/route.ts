import { NextResponse } from "next/server";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { databaseConfigured } from "@/lib/orders/repository";
import { quoteSellerView } from "@/lib/quotes/seller-view";
import { getShopOwner } from "@/lib/shops/editor-repository";
import { SHOP_SLUG } from "@/lib/shops/model";
import { getShop } from "@/lib/shops/repository";
import { OWNER_TENANT } from "@/lib/tenants/model";

export const runtime = "nodejs";

const perClient = createRateLimiter({ limit: 120, windowMs: 60 * 60 * 1000 });

/**
 * Säljaren som en slutkunds offert ritas med i skyltmotorn: namnskylt.com, eller butikens ägare.
 * Det är samma uppgifter som står på den färdiga offerten, så de är inte hemliga. Sidan hämtar dem
 * först när kunden öppnar offerten, så att loggan inte följer med varje besök i skyltmotorn.
 */
export async function GET(request: Request) {
  if (!databaseConfigured()) return NextResponse.json({ error: "Offerten går inte att visa just nu." }, { status: 503 });
  if (!perClient.take(clientKey(request))) return NextResponse.json({ error: "För många försök. Försök igen om en stund." }, { status: 429 });
  const slug = new URL(request.url).searchParams.get("shop");
  if (slug !== null && !SHOP_SLUG.test(slug)) return NextResponse.json({ error: "Butiken finns inte" }, { status: 404 });
  const shop = slug ? await getShop(slug) : null;
  if (slug && !shop) return NextResponse.json({ error: "Butiken finns inte" }, { status: 404 });
  const { company, plate } = await quoteSellerView((shop ? await getShopOwner(shop.slug) : null) ?? OWNER_TENANT);
  // Fakturabrevlådan står aldrig på en offert och lämnar inte servern.
  return NextResponse.json({ company: { ...company, invoiceEmail: "" }, plate }, { headers: { "cache-control": "private, no-store" } });
}
