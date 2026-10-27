/**
 * Ett lösenord i miljön och en signerad kaka som bevis. Kakan är en HMAC av
 * syftet med lösenordet som nyckel — byts lösenordet slutar alla kakor gälla.
 */

export interface SignedPass {
  cookie: string;
  /** Koden finns i miljön. */
  configured: () => boolean;
  matches: (input: string) => boolean;
  token: () => Promise<string>;
  verify: (value: string | undefined) => Promise<boolean>;
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

async function sign(password: string, purpose: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(purpose)));
}

export function signedPass({ envVar, purpose, cookie }: { envVar: string; purpose: string; cookie: string }): SignedPass {
  const password = () => process.env[envVar]?.trim() || null;
  return {
    cookie,
    configured: () => password() !== null,
    matches: (input) => {
      const expected = password();
      return expected !== null && equal(input, expected);
    },
    token: async () => {
      const expected = password();
      if (!expected) throw new Error(`${envVar} saknas`);
      return sign(expected, purpose);
    },
    verify: async (value) => {
      const expected = password();
      if (!expected || !value) return false;
      return equal(value, await sign(expected, purpose));
    },
  };
}

export const PASS_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
