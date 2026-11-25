"use client";

import { CONSENT_CHANGED_EVENT, CONSENT_COOKIE, CONSENT_MAX_AGE_SECONDS, parseConsent, type Consent } from "@/lib/consent/model";

export function readConsent(): Consent | null {
  return typeof document === "undefined" ? null : parseConsent(document.cookie);
}

export function saveConsent(consent: Consent): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${consent}; Max-Age=${CONSENT_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
}
