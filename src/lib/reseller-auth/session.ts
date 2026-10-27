import "server-only";
import { cookies } from "next/headers";
import { PASS_MAX_AGE_SECONDS, signedPass } from "@/lib/auth/signed-pass";

/** Återförsäljarens inlogg. Utan `RESELLER_PASSWORD` går panelen inte att logga in på. */
export const resellerPass = signedPass({
  envVar: "RESELLER_PASSWORD",
  purpose: "namnskylt-reseller",
  cookie: "ns_admin",
});

export const RESELLER_MAX_AGE_SECONDS = PASS_MAX_AGE_SECONDS;

export async function isResellerSignedIn(): Promise<boolean> {
  return resellerPass.verify((await cookies()).get(resellerPass.cookie)?.value);
}

/** Varje server action kontrollerar inloggningen själv — en action är en öppen POST-endpoint. */
export async function requireReseller(): Promise<void> {
  if (!(await isResellerSignedIn())) throw new Error("Inte inloggad");
}
