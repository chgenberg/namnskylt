/**
 * Besökarens val om kakor (beslut av ägaren 2026-11-25), som hos Skylt & Gravyrteknik: "alla" släpper fram
 * Google Analytics, "nodvandiga" bara det sajten behöver. Valet sparas i en nödvändig kaka i ett år.
 */
export const CONSENT_COOKIE = "ns_samtycke";
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
export type Consent = "alla" | "nodvandiga";

/** Sänds i fönstret när valet ändras, och när någon vill öppna rutan igen. */
export const CONSENT_CHANGED_EVENT = "ns-samtycke";
export const CONSENT_OPEN_EVENT = "ns-samtycke-oppna";

export function parseConsent(cookieHeader: string | null | undefined): Consent | null {
  const match = /(?:^|;\s*)ns_samtycke=(alla|nodvandiga)(?:;|$)/.exec(cookieHeader ?? "");
  return (match?.[1] as Consent | undefined) ?? null;
}

/** Ett mätnings-id i Google Analytics 4, "G-XXXXXXXXXX". Allt annat stänger av Google Analytics. */
export function gaMeasurementIdOf(value: string | null | undefined): string | null {
  const id = value?.trim().toUpperCase() ?? "";
  return /^G-[A-Z0-9]{4,16}$/.test(id) ? id : null;
}

/** Google Analytics och cookierutan gäller bara namnskylt.coms egna sidor, inte panelen eller butikerna. */
export function analyticsAllowedOn(hostname: string, pathname: string): boolean {
  if (!/(^|\.)namnskylt\.com$|^localhost$|^127\.0\.0\.1$/.test(hostname)) return false;
  return !/^\/(admin|butik|inbaddning|verkstad)(\/|$)/.test(pathname);
}
