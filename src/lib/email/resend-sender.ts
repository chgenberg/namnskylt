import type { EmailMessage, EmailSender, SendEmailResult } from "./types";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 15_000;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export class ResendEmailSender implements EmailSender {
  readonly kind = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async send(message: EmailMessage): Promise<SendEmailResult> {
    let response: Response;
    try {
      response = await this.fetchImpl(RESEND_EMAILS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.idempotencyKey,
        },
        body: JSON.stringify({
          from: message.from,
          to: [message.to],
          reply_to: message.replyTo,
          subject: message.subject,
          html: message.html,
          text: message.text,
          headers: message.headers,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { success: false, id: null, mocked: false, status: null, error: reason, retryable: true };
    }

    const body = (await response.json().catch(() => null)) as { id?: unknown; message?: unknown } | null;
    if (!response.ok) {
      const reason = typeof body?.message === "string" ? body.message : `HTTP ${response.status}`;
      return {
        success: false,
        id: null,
        mocked: false,
        status: response.status,
        error: reason,
        retryable: isRetryableStatus(response.status),
      };
    }
    const id = typeof body?.id === "string" ? body.id : null;
    return {
      success: id !== null,
      id,
      mocked: false,
      status: response.status,
      error: id ? null : "Resend svarade utan id",
      retryable: false,
    };
  }
}
