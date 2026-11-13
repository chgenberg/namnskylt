export interface EmailMessage {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  /** Samma nyckel två gånger inom 24 h ger ett mejl hos Resend, inte två. */
  idempotencyKey: string;
}

export interface SendEmailResult {
  success: boolean;
  /** Resends id; i mock ett lokalt id som aldrig får sparas som `resend_id`. */
  id: string | null;
  mocked: boolean;
  /** HTTP-status från Resend, `null` för mock och nätverksfel. */
  status: number | null;
  error: string | null;
  /** Felet går över av sig självt (429, 5xx, tidsgräns) — försök igen senare. */
  retryable: boolean;
}

export interface EmailSender {
  readonly kind: "mock" | "resend";
  send(message: EmailMessage): Promise<SendEmailResult>;
}
