import "server-only";
import { GATE_COOKIE, GATE_MAX_AGE_SECONDS, gateEnabled, gateToken } from "@/lib/site-gate/token";
import { RESELLER_MAX_AGE_SECONDS, resellerPass, sessionToken } from "./session";

export interface CookieToSet {
  name: string;
  value: string;
  options: { httpOnly: true; sameSite: "lax"; secure: boolean; path: "/"; maxAge: number };
}

const options = (maxAge: number): CookieToSet["options"] => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

/**
 * Inloggad återförsäljare: panelens kaka och sajtkodens — en återförsäljare
 * ska kunna öppna skyltmotorn för en offert utan att känna till sajtkoden.
 */
export async function signInCookies(tenant: string): Promise<CookieToSet[]> {
  const cookies: CookieToSet[] = [
    { name: resellerPass.cookie, value: sessionToken(tenant), options: options(RESELLER_MAX_AGE_SECONDS) },
  ];
  if (gateEnabled()) cookies.push({ name: GATE_COOKIE, value: await gateToken(), options: options(GATE_MAX_AGE_SECONDS) });
  return cookies;
}
