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

/** `true` när kakan är giltig, eller när spärren inte är påslagen. */
export async function isValidGateCookie(value: string | undefined): Promise<boolean> {
  return !pass.configured() || pass.verify(value);
}
