import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signerade länkar i utskicket: `v1.{purpose}.{messageId}.{exp}.{sig}`.
 * Purpose skiljer landning från avregistrering, så att en länkskanner som
 * följer landningslänken aldrig kan avregistrera någon. Ingen e-post i länken.
 */

const LINK_PURPOSES = { landing: "l", unsubscribe: "u" } as const;
export type LinkPurpose = keyof typeof LINK_PURPOSES;

const LANDING_TTL_DAYS = 60;
const UNSUBSCRIBE_TTL_DAYS = 730;
const MIN_LINK_SECRET_LENGTH = 32;

const SECONDS_PER_DAY = 86_400;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class LinkSecretError extends Error {}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function ttlDaysFor(purpose: LinkPurpose): number {
  return purpose === "landing" ? LANDING_TTL_DAYS : UNSUBSCRIBE_TTL_DAYS;
}

export function signLinkToken(
  input: { purpose: LinkPurpose; messageId: string; expUnix: number },
  secret: string | undefined,
): string {
  if (!secret || secret.length < MIN_LINK_SECRET_LENGTH) {
    throw new LinkSecretError(`OUTREACH_LINK_SECRET måste vara minst ${MIN_LINK_SECRET_LENGTH} tecken`);
  }
  if (!UUID.test(input.messageId)) throw new Error("messageId måste vara ett uuid");
  const payload = `v1.${LINK_PURPOSES[input.purpose]}.${input.messageId}.${Math.floor(input.expUnix)}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** Utfärdar en länk som gäller purpose-standardtiden från `now`. */
export function issueLinkToken(purpose: LinkPurpose, messageId: string, secret: string | undefined, now: Date): string {
  const expUnix = Math.floor(now.getTime() / 1000) + ttlDaysFor(purpose) * SECONDS_PER_DAY;
  return signLinkToken({ purpose, messageId, expUnix }, secret);
}

export type VerifiedLink = { ok: true; messageId: string; expUnix: number } | { ok: false };

/** Alla fel ger samma svar — mottagaren ska inte kunna se varför en länk inte gäller. */
export function verifyLinkToken(
  token: string,
  expected: LinkPurpose,
  secrets: readonly (string | undefined)[],
  now: Date,
): VerifiedLink {
  const parts = token.split(".");
  if (parts.length !== 5) return { ok: false };
  const [version, purpose, messageId, exp, signature] = parts;
  if (version !== "v1" || purpose !== LINK_PURPOSES[expected] || !messageId || !exp || !signature) return { ok: false };
  if (!UUID.test(messageId) || !/^\d+$/.test(exp)) return { ok: false };

  const payload = `${version}.${purpose}.${messageId}.${exp}`;
  const valid = secrets.some(
    (secret) => !!secret && secret.length >= MIN_LINK_SECRET_LENGTH && safeEqual(sign(payload, secret), signature),
  );
  if (!valid) return { ok: false };

  const expUnix = Number(exp);
  if (expUnix * 1000 <= now.getTime()) return { ok: false };
  return { ok: true, messageId, expUnix };
}

/** Den aktiva hemligheten först, den förra bara för att verifiera vid rotation. */
export function linkSecrets(env: Record<string, string | undefined> = process.env): (string | undefined)[] {
  return [env.OUTREACH_LINK_SECRET, env.OUTREACH_LINK_SECRET_PREVIOUS];
}
