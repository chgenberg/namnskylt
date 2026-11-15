import { createHmac, timingSafeEqual } from "node:crypto";

type Env = Record<string, string | undefined>;
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface StripeSettings {
  secretKey: string;
  webhookSecret: string;
  /** Stripes API. Bara tester och lokala kontroller pekar någon annanstans. */
  apiUrl: string;
}

const DEFAULT_API_URL = "https://api.stripe.com";

/**
 * Strömbrytaren för kortbetalning. Båda nycklarna krävs: utan hemligheten för
 * webhooken går en betalning inte att bekräfta på ett säkert sätt. Annars
 * `null`, och privatpersoner kan inte beställa.
 */
export function stripeSettings(env: Env = process.env): StripeSettings | null {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secretKey || !webhookSecret) return null;
  const apiUrl = (env.STRIPE_API_URL?.trim() || DEFAULT_API_URL).replace(/\/+$/, "");
  if (!/^https?:\/\//.test(apiUrl)) return null;
  return { secretKey, webhookSecret, apiUrl };
}

export function paymentsConfigured(env: Env = process.env): boolean {
  return stripeSettings(env) !== null;
}

/** Stripes id på en betalsession. Kontrolleras innan det används i en adress. */
export const SESSION_ID_PATTERN = /^cs_[A-Za-z0-9_]{8,250}$/;

export interface CheckoutLine {
  name: string;
  /** Radens belopp med moms, i ören. */
  amountOre: number;
}

export interface NewSession {
  /** Vår rad i `checkouts`, som sessionen pekar tillbaka på. */
  reference: string;
  email: string;
  lines: readonly CheckoutLine[];
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
}

/** Formuläret som skapar en betalsession hos Stripe. Stripe tar emot fält i formulärkodning, inte JSON. */
export function sessionForm(input: NewSession): URLSearchParams {
  const form = new URLSearchParams({
    mode: "payment",
    locale: "sv",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.reference,
    customer_email: input.email,
    expires_at: String(Math.floor(input.expiresAt.getTime() / 1000)),
    "metadata[checkout]": input.reference,
  });
  input.lines.forEach((line, i) => {
    form.set(`line_items[${i}][quantity]`, "1");
    form.set(`line_items[${i}][price_data][currency]`, "sek");
    form.set(`line_items[${i}][price_data][unit_amount]`, String(line.amountOre));
    form.set(`line_items[${i}][price_data][product_data][name]`, line.name);
  });
  return form;
}

export interface StripeSession {
  id: string;
  /** Sidan hos Stripe där kunden betalar; finns bara på en ny session. */
  url: string | null;
  paid: boolean;
  amountOre: number | null;
  currency: string | null;
  /** Vår rad i `checkouts`. */
  reference: string | null;
  /** Betalningens id hos Stripe. */
  paymentRef: string | null;
}

const text = (value: unknown) => (typeof value === "string" && value ? value : null);

/** Stripes session som vi läser den. `null` när svaret inte är en session. */
export function parseSession(value: unknown): StripeSession | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id);
  if (!id || !SESSION_ID_PATTERN.test(id)) return null;
  const intent = raw.payment_intent;
  return {
    id,
    url: text(raw.url),
    paid: raw.payment_status === "paid",
    amountOre: typeof raw.amount_total === "number" ? raw.amount_total : null,
    currency: text(raw.currency)?.toLowerCase() ?? null,
    reference: text(raw.client_reference_id),
    paymentRef: text(intent) ?? (intent && typeof intent === "object" ? text((intent as Record<string, unknown>).id) : null),
  };
}

async function call(settings: StripeSettings, path: string, init: RequestInit, fetchImpl: FetchLike): Promise<StripeSession> {
  const response = await fetchImpl(`${settings.apiUrl}${path}`, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${settings.secretKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
    throw new Error(`Stripe svarade ${response.status}${typeof message === "string" ? `: ${message.slice(0, 200)}` : ""}`);
  }
  const session = parseSession(body);
  if (!session) throw new Error("Stripe svarade utan en betalsession");
  return session;
}

/** Skapar betalsessionen. Samma `reference` två gånger ger samma session, inte två. */
export function createSession(settings: StripeSettings, input: NewSession, fetchImpl: FetchLike = fetch): Promise<StripeSession> {
  return call(
    settings,
    "/v1/checkout/sessions",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "idempotency-key": `checkout-${input.reference}` },
      body: sessionForm(input).toString(),
    },
    fetchImpl,
  );
}

/** Läser sessionen hos Stripe. Det är Stripes svar som avgör om ordern är betald, aldrig adressen kunden kom tillbaka på. */
export function getSession(settings: StripeSettings, id: string, fetchImpl: FetchLike = fetch): Promise<StripeSession> {
  if (!SESSION_ID_PATTERN.test(id)) return Promise.reject(new Error("Ogiltigt sessions-id"));
  return call(settings, `/v1/checkout/sessions/${id}`, { method: "GET" }, fetchImpl);
}

/** Så gammal får en signatur vara. Skyddar mot att ett uppsnappat anrop spelas upp igen. */
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Kontrollerar Stripes signatur på en webhook: `t=<sekunder>,v1=<HMAC-SHA256
 * av "t.kropp">`. Kroppen måste vara exakt de bytes som kom, inte tolkad JSON.
 */
export function verifyWebhook(payload: string, header: string | null, secret: string, nowMs: number = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((part) => part.trim().split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value ?? "");
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowMs - Number(timestamp) * 1000) > SIGNATURE_TOLERANCE_MS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest();
  return signatures.some((signature) => {
    if (!/^[0-9a-f]{64}$/.test(signature)) return false;
    return timingSafeEqual(Buffer.from(signature, "hex"), expected);
  });
}

/** Händelserna som betyder att en session kan vara betald. */
const PAID_EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);

/** Sessionens id ur en händelse som gäller en betalning; `null` för alla andra händelser. */
export function paidSessionId(event: unknown): string | null {
  if (!event || typeof event !== "object") return null;
  const raw = event as { type?: unknown; data?: { object?: unknown } };
  if (typeof raw.type !== "string" || !PAID_EVENTS.has(raw.type)) return null;
  return parseSession(raw.data?.object)?.id ?? null;
}
