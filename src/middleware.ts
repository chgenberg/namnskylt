import { NextResponse, type NextRequest } from "next/server";
import {
  GATE_COOKIE,
  gateEnabled,
  GATE_MAX_AGE_SECONDS,
  isValidGateCookie,
  isValidShopVisitorCookie,
  SHOP_VISITOR_COOKIE,
  shopVisitorToken,
} from "@/lib/site-gate/token";
import { resolveHost, shopRewritePath } from "@/lib/shops/host";

const PATHNAME_HEADER = "x-pathname";
const DOMAIN_CACHE_MS = 60_000;
const DOMAIN_LOOKUP_TIMEOUT_MS = 1_500;
/** Servern själv — middleware frågar den om egna domäner. Porten är den startskriptet ger `next start`. */
const SELF_ORIGIN = `http://127.0.0.1:${process.env.INTERNAL_PORT ?? "3100"}`;
/** Vår egen sajt; allt annat är en butiks underadress eller egna domän. */
const MAIN_HOSTS = (process.env.SITE_HOSTS ?? "namnskylt.com,www.namnskylt.com,localhost")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

const domainCache = new Map<string, { slug: string | null; until: number }>();

async function slugForDomain(host: string): Promise<string | null> {
  const cached = domainCache.get(host);
  if (cached && cached.until > Date.now()) return cached.slug;
  const slug = await fetch(`${SELF_ORIGIN}/api/shop-domain?host=${encodeURIComponent(host)}`, {
    signal: AbortSignal.timeout(DOMAIN_LOOKUP_TIMEOUT_MS),
  })
    .then((r) => (r.ok ? (r.json() as Promise<{ slug: string | null }>) : { slug: null }))
    .then((body) => body.slug)
    .catch(() => null);
  domainCache.set(host, { slug, until: Date.now() + DOMAIN_CACHE_MS });
  return slug;
}

/** Butiken som adressen hör till: kontorsprofilen.namnskylt.com eller skylt.kontorsprofilen.se. */
async function shopForHost(request: NextRequest): Promise<string | null> {
  const target = resolveHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host"), MAIN_HOSTS);
  if (target.kind === "subdomain") return target.slug;
  if (target.kind === "custom") return slugForDomain(target.host);
  return null;
}

/**
 * Sidorna låses i layouten (som behöver sökvägen för att släppa igenom
 * korrekturlänkar); API:erna stängs här så att ingen når AI eller order förbi rutan.
 */
export async function middleware(request: NextRequest) {
  const { pathname: requested } = request.nextUrl;
  if (!requested.startsWith("/api/")) {
    const hostShop = await shopForHost(request);
    const rewrite = hostShop ? shopRewritePath(hostShop, requested) : null;
    const pathname = rewrite ?? requested;
    const headers = new Headers(request.headers);
    headers.set(PATHNAME_HEADER, pathname);
    const response = rewrite
      ? NextResponse.rewrite(new URL(rewrite + request.nextUrl.search, request.url), { request: { headers } })
      : NextResponse.next({ request: { headers } });
    if (pathname.startsWith("/butik/") && gateEnabled() && !request.cookies.has(SHOP_VISITOR_COOKIE)) {
      response.cookies.set(SHOP_VISITOR_COOKIE, await shopVisitorToken(), {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/api",
        maxAge: GATE_MAX_AGE_SECONDS,
      });
    }
    return response;
  }
  // Webhooken anropas av leverantörens server, som saknar kakan — den kräver i stället signatur.
  // Statistiken anropas från återförsäljarnas sajter, som saknar kakan.
  // Panelens inloggning har eget lösenord — återförsäljare känner inte sajtkoden.
  if (
    requested === "/api/gate" ||
    requested === "/api/supplier/webhook" ||
    requested === "/api/shop-events" ||
    requested === "/api/shop-domain" ||
    requested === "/api/admin/session"
  ) {
    return NextResponse.next();
  }
  if (await isValidGateCookie(request.cookies.get(GATE_COOKIE)?.value)) return NextResponse.next();
  if (await isValidShopVisitorCookie(request.cookies.get(SHOP_VISITOR_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.json({ error: "Sajten är låst" }, { status: 401 });
}

/*
 * Edge, inte Node: Node-middleware i Next 15.5 förbrukar förfrågans innehåll
 * bakom Railways proxy, så att filuppladdningar når routen tomma.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|woff2?|ttf|hdr|exr)$).*)"],
};
