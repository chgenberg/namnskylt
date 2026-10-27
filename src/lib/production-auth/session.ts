import { signedPass } from "@/lib/auth/signed-pass";

/**
 * Verkstadens inlogg, skilt från återförsäljarens. Utan `PRODUCTION_PASSWORD`
 * är verkstaden stängd — till skillnad från sajtspärren som då står öppen.
 */
export const productionPass = signedPass({
  envVar: "PRODUCTION_PASSWORD",
  purpose: "namnskylt-production",
  cookie: "ns_prod",
});

/** Kakan måste nå både `/verkstad` och `/api/production`; den gäller kortare än sajtspärren. */
export const PRODUCTION_COOKIE_PATH = "/";
export const PRODUCTION_MAX_AGE_SECONDS = 60 * 60 * 12;
