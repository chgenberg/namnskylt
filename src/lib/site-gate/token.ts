export const GATE_COOKIE = "ns_gate";
export const GATE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Repot är publikt — koden får bara finnas i miljön. Utan variabel är sajten öppen. */
function gatePassword(): string | null {
  return process.env.SITE_GATE_PASSWORD?.trim() || null;
}

export function gateEnabled(): boolean {
  return gatePassword() !== null;
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function expectedToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("namnskylt-gate")));
}

export function passwordMatches(input: string): boolean {
  const password = gatePassword();
  return password !== null && equal(input, password);
}

export async function gateToken(): Promise<string> {
  const password = gatePassword();
  if (!password) throw new Error("SITE_GATE_PASSWORD saknas");
  return expectedToken(password);
}

/** `true` när kakan är giltig, eller när spärren inte är påslagen. */
export async function isValidGateCookie(value: string | undefined): Promise<boolean> {
  const password = gatePassword();
  if (!password) return true;
  if (!value) return false;
  return equal(value, await expectedToken(password));
}
