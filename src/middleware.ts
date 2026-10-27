import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, isValidGateCookie } from "@/lib/site-gate/token";

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
    return NextResponse.next({ request: { headers } });
  }
  if (pathname === "/api/gate") return NextResponse.next();
  if (await isValidGateCookie(request.cookies.get(GATE_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.json({ error: "Sajten är låst" }, { status: 401 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|woff2?|ttf|hdr|exr)$).*)"],
};
