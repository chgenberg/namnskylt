import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, isValidGateCookie } from "@/lib/site-gate/token";

/** Sidorna låses i layouten; här stängs API:erna så att ingen når AI eller order förbi rutan. */
export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/gate") return NextResponse.next();
  if (await isValidGateCookie(request.cookies.get(GATE_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.json({ error: "Sajten är låst" }, { status: 401 });
}

export const config = {
  matcher: ["/api/:path*"],
};
