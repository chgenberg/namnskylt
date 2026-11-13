import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { MessageStatus, SuppressionReason } from "./model";
import type { DeliveryEventType } from "./warmup";

/** Resend signerar med Svix: `whsec_<base64>`, rubrikerna `svix-id`, `svix-timestamp`, `svix-signature`. */
const SVIX_TOLERANCE_SECONDS = 300;
export const MAX_WEBHOOK_BODY_BYTES = 64_000;

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

function secretBytes(secret: string): Buffer | null {
  const encoded = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const bytes = Buffer.from(encoded, "base64");
  return bytes.length >= 16 ? bytes : null;
}

export function svixSignature(secret: string, id: string, timestamp: string, body: string): string {
  const key = secretBytes(secret);
  if (!key) throw new Error("Webhookhemligheten är ogiltig");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

export function verifySvix(body: string, headers: SvixHeaders, secret: string, nowSeconds: number): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > SVIX_TOLERANCE_SECONDS) return false;
  if (!secretBytes(secret)) return false;
  const expected = Buffer.from(svixSignature(secret, id, timestamp, body));
  // Flera signaturer under nyckelbyte: `v1,abc v1,def`.
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",", 2);
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export const resendEventSchema = z.object({
  type: z.string().max(60),
  created_at: z.string().max(40),
  data: z
    .object({
      email_id: z.string().max(100).optional(),
      to: z.array(z.string().max(320)).max(50).optional(),
      bounce: z.object({ type: z.string().max(40).optional() }).loose().optional(),
    })
    .loose(),
});
export type ResendEvent = z.infer<typeof resendEventSchema>;

export interface EventEffect {
  /** Typen som sparas i `outreach_events` och läses av pausreglerna. */
  type: DeliveryEventType | "sent" | "other";
  status: { from: MessageStatus[]; to: MessageStatus } | null;
  suppress: SuppressionReason | null;
  pauseNow: boolean;
}

/** Vad en händelse från Resend gör med vårt steg. Bara en permanent studs spärrar adressen. */
export function eventEffect(event: ResendEvent): EventEffect {
  switch (event.type) {
    case "email.sent":
      return { type: "sent", status: null, suppress: null, pauseNow: false };
    case "email.delivered":
      return { type: "delivered", status: { from: ["sent"], to: "delivered" }, suppress: null, pauseNow: false };
    case "email.delivery_delayed":
      return { type: "delivery_delayed", status: null, suppress: null, pauseNow: false };
    case "email.bounced":
      return event.data.bounce?.type === "Permanent"
        ? { type: "bounced_hard", status: { from: ["sent", "delivered"], to: "bounced" }, suppress: "bounce", pauseNow: false }
        : { type: "bounced_soft", status: null, suppress: null, pauseNow: false };
    case "email.complained":
      return {
        type: "complained",
        status: { from: ["sent", "delivered", "bounced"], to: "complained" },
        suppress: "complaint",
        pauseNow: true,
      };
    default:
      return { type: "other", status: null, suppress: null, pauseNow: false };
  }
}

export interface WebhookStore {
  messageByResendId(resendId: string): Promise<{ id: string; leadId: string } | null>;
  leadEmail(leadId: string): Promise<string | null>;
  insertEvent(input: {
    providerEventId: string;
    messageId: string | null;
    resendId: string | null;
    type: string;
    payload: unknown;
    occurredAt: Date;
  }): Promise<boolean>;
  setMessageStatus(id: string, from: readonly MessageStatus[], to: MessageStatus): Promise<boolean>;
  suppress(input: { email: string; reason: SuppressionReason; messageId: string }): Promise<void>;
  pauseAll(reason: string): Promise<void>;
}

export type WebhookOutcome = "applied" | "duplicate" | "unknown_message";

function occurredAt(event: ResendEvent, fallback: Date): Date {
  const at = new Date(event.created_at);
  return Number.isNaN(at.getTime()) ? fallback : at;
}

/** En händelse en gång: samma `svix-id` två gånger gör ingenting andra gången. */
export async function applyResendEvent(
  store: WebhookStore,
  providerEventId: string,
  event: ResendEvent,
  now: Date,
): Promise<WebhookOutcome> {
  const resendId = event.data.email_id ?? null;
  const message = resendId ? await store.messageByResendId(resendId) : null;
  const effect = eventEffect(event);
  const inserted = await store.insertEvent({
    providerEventId,
    messageId: message?.id ?? null,
    resendId,
    type: effect.type === "other" ? event.type : effect.type,
    payload: event,
    occurredAt: occurredAt(event, now),
  });
  if (!inserted) return "duplicate";
  if (!message) return "unknown_message";

  if (effect.status) await store.setMessageStatus(message.id, effect.status.from, effect.status.to);
  if (effect.suppress) {
    const email = await store.leadEmail(message.leadId);
    if (email) await store.suppress({ email, reason: effect.suppress, messageId: message.id });
  }
  if (effect.pauseNow) await store.pauseAll("Ett klagomål på skräppost");
  return "applied";
}
