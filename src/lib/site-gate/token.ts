import { PASS_MAX_AGE_SECONDS, signedPass } from "@/lib/auth/signed-pass";

const pass = signedPass({ envVar: "SITE_GATE_PASSWORD", purpose: "namnskylt-gate", cookie: "ns_gate" });

export const GATE_COOKIE = pass.cookie;
export const GATE_MAX_AGE_SECONDS = PASS_MAX_AGE_SECONDS;

/** Repot är publikt — koden får bara finnas i miljön. Utan variabel är sajten öppen. */
export function gateEnabled(): boolean {
  return pass.configured();
}

export function passwordMatches(input: string): boolean {
  return pass.matches(input);
}

export function gateToken(): Promise<string> {
  return pass.token();
}

/**
 * Besökare i en demobutik har inte sajtkoden. Den här kakan delas ut när
 * butiken öppnas och gäller bara under /api — sidorna kräver fortfarande koden.
 */
const shopPass = signedPass({ envVar: "SITE_GATE_PASSWORD", purpose: "namnskylt-shop-visitor", cookie: "ns_shop" });

export const SHOP_VISITOR_COOKIE = shopPass.cookie;

export function shopVisitorToken(): Promise<string> {
  return shopPass.token();
}

export function isValidShopVisitorCookie(value: string | undefined): Promise<boolean> {
  return shopPass.verify(value);
}

/** `true` när kakan är giltig, eller när spärren inte är påslagen. */
export async function isValidGateCookie(value: string | undefined): Promise<boolean> {
  return !pass.configured() || pass.verify(value);
}
