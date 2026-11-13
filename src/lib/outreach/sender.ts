type Env = Record<string, string | undefined>;

const DEFAULT_SITE_URL = "https://namnskylt.com";

/** Adressen länkarna i mejlet pekar på. Bara https, utom lokalt. */
export function publicSiteUrl(env: Env = process.env): string {
  const value = env.OUTREACH_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (value && (/^https:\/\//.test(value) || /^http:\/\/localhost(:\d+)?$/.test(value))) return value;
  return DEFAULT_SITE_URL;
}
