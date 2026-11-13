import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { emailMode, getEmailSender, isRealEmailSend } from "./index";
import { MockEmailSender } from "./mock-sender";
import { ResendEmailSender } from "./resend-sender";
import type { EmailMessage, SendEmailResult } from "./types";

const message: EmailMessage = {
  from: "Anna <anna@mail.namnskylt.com>",
  to: "kund@firma.se",
  replyTo: "anna@namnskylt.com",
  subject: "Hej",
  html: "<p>Hej</p>",
  text: "Hej",
  headers: {
    "List-Unsubscribe": "<https://namnskylt.com/avregistrera/x>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
  idempotencyKey: "outreach:c:l:1",
};

const ok: SendEmailResult = { success: true, id: "re_1", mocked: false, status: 200, error: null, retryable: false };

describe("isRealEmailSend", () => {
  test("ett riktigt utskick med id räknas", () => assert.equal(isRealEmailSend(ok), true));
  test("mock räknas aldrig", () => assert.equal(isRealEmailSend({ ...ok, mocked: true }), false));
  test("fel räknas inte", () => assert.equal(isRealEmailSend({ ...ok, success: false }), false));
  test("lyckat utan id räknas inte", () => assert.equal(isRealEmailSend({ ...ok, id: null }), false));
  test("tomt id räknas inte", () => assert.equal(isRealEmailSend({ ...ok, id: "" }), false));
});

describe("läget", () => {
  test("utan nyckel är det mock", () => assert.equal(emailMode({}), "mock"));
  test("blank nyckel är mock", () => assert.equal(emailMode({ RESEND_API_KEY: "  " }), "mock"));
  test("med nyckel är det live", () => assert.equal(emailMode({ RESEND_API_KEY: "re_x" }), "live"));
  test("nödstoppet slår ut nyckeln", () =>
    assert.equal(emailMode({ RESEND_API_KEY: "re_x", OUTREACH_DISABLED: "true" }), "mock"));
  test("sändaren följer läget", () => {
    assert.equal(getEmailSender({}).kind, "mock");
    assert.equal(getEmailSender({ RESEND_API_KEY: "re_x" }).kind, "resend");
  });
});

describe("mock-sändaren", () => {
  test("skriver json och html med mocked: true och avregistreringshuvudet", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "outbox-"));
    try {
      const result = await new MockEmailSender(dir).send(message);
      assert.equal(result.mocked, true);
      assert.equal(isRealEmailSend(result), false);
      const files = await readdir(dir);
      assert.equal(files.filter((f) => f.endsWith(".json")).length, 1);
      assert.equal(files.filter((f) => f.endsWith(".html")).length, 1);
      const jsonFile = files.find((f) => f.endsWith(".json")) ?? "";
      const saved = JSON.parse(await readFile(path.join(dir, jsonFile), "utf8")) as Record<string, unknown>;
      assert.equal(saved.mocked, true);
      assert.match(JSON.stringify(saved.headers), /List-Unsubscribe-Post/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("Resend-sändaren", () => {
  function fakeFetch(status: number, body: unknown) {
    const calls: { url: string; init: RequestInit }[] = [];
    const impl = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status });
    };
    return { calls, impl };
  }

  test("skickar kropp, huvuden och idempotensnyckel", async () => {
    const { calls, impl } = fakeFetch(200, { id: "re_123" });
    const result = await new ResendEmailSender("re_key", impl).send(message);
    assert.equal(isRealEmailSend(result), true);
    assert.equal(result.id, "re_123");
    const [call] = calls;
    assert.ok(call);
    assert.equal(call.url, "https://api.resend.com/emails");
    const headers = call.init.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer re_key");
    assert.equal(headers["Idempotency-Key"], "outreach:c:l:1");
    const body = JSON.parse(String(call.init.body)) as Record<string, unknown>;
    assert.deepEqual(body.to, ["kund@firma.se"]);
    assert.equal(body.reply_to, "anna@namnskylt.com");
    assert.equal((body.headers as Record<string, string>)["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  });

  test("429 och 5xx kan försökas igen, övriga 4xx inte", async () => {
    for (const [status, retryable] of [
      [429, true],
      [503, true],
      [422, false],
      [403, false],
    ] as const) {
      const { impl } = fakeFetch(status, { message: "nej" });
      const result = await new ResendEmailSender("k", impl).send(message);
      assert.equal(result.success, false);
      assert.equal(result.retryable, retryable, `status ${status}`);
      assert.equal(result.error, "nej");
    }
  });

  test("nätverksfel kan försökas igen", async () => {
    const result = await new ResendEmailSender("k", async () => {
      throw new Error("ECONNRESET");
    }).send(message);
    assert.equal(result.success, false);
    assert.equal(result.retryable, true);
  });

  test("200 utan id räknas inte som skickat", async () => {
    const { impl } = fakeFetch(200, {});
    assert.equal(isRealEmailSend(await new ResendEmailSender("k", impl).send(message)), false);
  });
});
