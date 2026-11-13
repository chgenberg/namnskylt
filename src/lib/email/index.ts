import { DEFAULT_OUTBOX_DIR, MockEmailSender } from "./mock-sender";
import { ResendEmailSender, type FetchLike } from "./resend-sender";
import type { EmailSender, SendEmailResult } from "./types";

export type { EmailMessage, EmailSender, SendEmailResult } from "./types";

type Env = Record<string, string | undefined>;

export type EmailMode = "mock" | "live";

/** Utan nyckel, eller med nödstoppet på, lämnar inget mejl servern. */
export function emailMode(env: Env = process.env): EmailMode {
  const key = env.RESEND_API_KEY?.trim();
  if (!key || env.OUTREACH_DISABLED === "true") return "mock";
  return "live";
}

/** Byggs på nytt varje gång så att en ändrad miljö slår igenom direkt. */
export function getEmailSender(env: Env = process.env, fetchImpl?: FetchLike): EmailSender {
  if (emailMode(env) === "mock") return new MockEmailSender(env.OUTREACH_OUTBOX_DIR || DEFAULT_OUTBOX_DIR);
  return new ResendEmailSender(env.RESEND_API_KEY?.trim() ?? "", fetchImpl);
}

/** Den enda vägen till status `sent`: lyckat, riktigt och med Resends id. */
export function isRealEmailSend(result: SendEmailResult): boolean {
  return result.success && !result.mocked && typeof result.id === "string" && result.id.length > 0;
}
