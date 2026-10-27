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

const PATHNAME_HEADER = "x-pathname";

/**
 * Sidorna låses i layouten (som behöver sökvägen för att släppa igenom
 * korrekturlänkar); API:erna stängs här så att ingen når AI eller order förbi rutan.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) {
    const headers = new Headers(request.headers);
    headers.set(PATHNAME_HEADER, pathname);
    const response = NextResponse.next({ request: { headers } });
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
  if (pathname === "/api/gate" || pathname === "/api/supplier/webhook") return NextResponse.next();
  if (await isValidGateCookie(request.cookies.get(GATE_COOKIE)?.value)) return NextResponse.next();
  if (await isValidShopVisitorCookie(request.cookies.get(SHOP_VISITOR_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.json({ error: "Sajten är låst" }, { status: 401 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|woff2?|ttf|hdr|exr)$).*)"],
};
