import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { PASS_MAX_AGE_SECONDS, signedPass } from "@/lib/auth/signed-pass";
import { OWNER_TENANT, TENANT_ID } from "@/lib/tenants/model";
import { accountExists } from "./accounts";

/** Ägarens inlogg (namnskylt.com). Utan `RESELLER_PASSWORD` går panelen inte att logga in på. */
export const resellerPass = signedPass({
  envVar: "RESELLER_PASSWORD",
  purpose: "namnskylt-reseller",
  cookie: "ns_admin",
});

export const RESELLER_MAX_AGE_SECONDS = PASS_MAX_AGE_SECONDS;

const PURPOSE = "namnskylt-reseller-session";

function signature(tenant: string): string | null {
  const key = process.env.RESELLER_PASSWORD?.trim();
  return key ? createHmac("sha256", key).update(`${PURPOSE}:${tenant}`).digest("hex") : null;
}

/** Kakan är `<återförsäljare>.<signatur>`; byts RESELLER_PASSWORD slutar alla gälla. */
export function sessionToken(tenant: string): string {
  const sig = signature(tenant);
  if (!sig) throw new Error("RESELLER_PASSWORD saknas");
  return `${tenant}.${sig}`;
}

/** Återförsäljaren kakan gäller, eller `null`. Gamla ägarkakor (bara signatur) gäller fortfarande. */
export async function tenantFromCookie(value: string | undefined): Promise<string | null> {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot < 0) return (await resellerPass.verify(value)) ? OWNER_TENANT : null;
  const tenant = value.slice(0, dot);
  const expected = TENANT_ID.test(tenant) ? signature(tenant) : null;
  const given = Buffer.from(value.slice(dot + 1), "hex");
  if (!expected || given.length !== expected.length / 2 || !timingSafeEqual(given, Buffer.from(expected, "hex"))) {
    return null;
  }
  // Ett borttaget konto ska inte kunna fortsätta med en gammal kaka.
  return tenant === OWNER_TENANT || (await accountExists(tenant)) ? tenant : null;
}

export async function currentTenant(): Promise<string | null> {
  return tenantFromCookie((await cookies()).get(resellerPass.cookie)?.value);
}

export async function isResellerSignedIn(): Promise<boolean> {
  return (await currentTenant()) !== null;
}

/** Varje server action kontrollerar inloggningen själv — en action är en öppen POST-endpoint. */
export async function requireReseller(): Promise<string> {
  const tenant = await currentTenant();
  if (!tenant) throw new Error("Inte inloggad");
  return tenant;
}
