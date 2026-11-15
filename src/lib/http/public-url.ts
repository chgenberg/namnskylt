type Env = Record<string, string | undefined>;

const DEFAULT_ORIGIN = "https://www.namnskylt.com";

/**
 * Sajtens publika adress, som länkar i mejl och betalningens returadresser
 * byggs på. Den läses ur miljön och aldrig ur förfrågans värdnamn, som en
 * angripare kan styra. Variabeln heter `NOTICE_PUBLIC_URL` av historiska skäl.
 */
export function publicOrigin(env: Env = process.env): string {
  const origin = (env.NOTICE_PUBLIC_URL?.trim() || DEFAULT_ORIGIN).replace(/\/+$/, "");
  return /^https?:\/\//.test(origin) ? origin : DEFAULT_ORIGIN;
}
