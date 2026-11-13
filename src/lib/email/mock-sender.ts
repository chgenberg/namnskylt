import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EmailMessage, EmailSender, SendEmailResult } from "./types";

export const DEFAULT_OUTBOX_DIR = "tmp/outreach-outbox";

/** Skriver mejlet till disk i stället för att skicka det. Räknas aldrig som skickat. */
export class MockEmailSender implements EmailSender {
  readonly kind = "mock";

  constructor(private readonly outboxDir: string = DEFAULT_OUTBOX_DIR) {}

  async send(message: EmailMessage): Promise<SendEmailResult> {
    const id = `mock-${randomUUID()}`;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = path.join(this.outboxDir, `${stamp}-${id}`);
    await mkdir(this.outboxDir, { recursive: true });
    const { html, ...meta } = message;
    await writeFile(`${base}.json`, JSON.stringify({ id, mocked: true, ...meta }, null, 2));
    await writeFile(`${base}.html`, html);
    return { success: true, id, mocked: true, status: null, error: null, retryable: false };
  }
}
