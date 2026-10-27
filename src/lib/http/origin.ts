import "server-only";
import { headers } from "next/headers";

/** Sajtens adress som besökaren ser den — bakom Railways proxy står den i `x-forwarded-*`. */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto.split(",")[0]?.trim() ?? "https"}://${host.split(",")[0]?.trim() ?? host}`;
}
