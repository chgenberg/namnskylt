/**
 * Varje återförsäljare är en egen hyresgäst: egna kunder, ordrar, offerter och
 * inställningar. namnskylt.com är ägaren — all data från före inloggningarna är dess.
 */
export const OWNER_TENANT = "namnskylt";

export const TENANT_ID = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** Ägarens inställningar ligger kvar under de gamla nycklarna; andras får ett suffix. */
export function settingsKey(tenant: string, base: string): string {
  return tenant === OWNER_TENANT ? base : `${base}:${tenant}`;
}

export function isOwner(tenant: string): boolean {
  return tenant === OWNER_TENANT;
}
