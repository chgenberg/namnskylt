import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { FetchLike } from "@/lib/email/resend-sender";
import { adminNoticeEmailSettings } from "./email";
import type { PanelNotice } from "./model";
import { emailAdminNotice } from "./notify";

/** Inget mejl lämnar datorn: Resend är utbytt mot en låtsasmottagare. */
interface Sent {
  authorization: string | null;
  idempotencyKey: string | null;
  body: { from: string; to: string[]; subject: string; text: string };
}

const settings = adminNoticeEmailSettings({
  ADMIN_NOTICE_RESEND_API_KEY: "re_admin",
  ADMIN_NOTICE_FROM_EMAIL: "namnskylt.com <besked@exempel.se>",
  ADMIN_NOTICE_TO: "ett@exempel.se,tva@exempel.se",
});
const application: PanelNotice = { id: "11111111-1111-4111-8111-111111111111", kind: "application", who: "Exempel Profil AB", detail: null, quoteNo: null, orderNo: null, createdAt: "2026-11-20T10:00:00Z" };

describe("adminens besked mejlas till adminens adresser", () => {
  test("varje mottagare får sitt eget mejl om ansökan, med länken till panelen", async () => {
    assert.ok(settings);
    const sent: Sent[] = [];
    const resend: FetchLike = async (_url, init) => {
      const headers = new Headers(init.headers);
      sent.push({ authorization: headers.get("authorization"), idempotencyKey: headers.get("idempotency-key"), body: JSON.parse(String(init.body)) as Sent["body"] });
      return Response.json({ id: `prov-${sent.length}` });
    };
    assert.equal(await emailAdminNotice(application, settings, resend), true);
    assert.deepEqual(sent.map((mail) => mail.body.to), [["ett@exempel.se"], ["tva@exempel.se"]]);
    // Adminens egen nyckel, och en nyckel per mottagare hos Resend: annars hade det andra mejlet räknats som en upprepning.
    assert.ok(sent.every((mail) => mail.authorization === "Bearer re_admin"));
    assert.equal(new Set(sent.map((mail) => mail.idempotencyKey)).size, 2);
    for (const mail of sent) {
      assert.equal(mail.body.from, "namnskylt.com <besked@exempel.se>");
      assert.match(mail.body.subject, /Exempel Profil AB/);
      assert.match(mail.body.text, /https:\/\/www\.namnskylt\.com\/admin\/aterforsaljare/);
    }
  });

  test("går det ena mejlet inte iväg räknas beskedet ändå som mejlat, och svarar ingen gör det inte det", async () => {
    assert.ok(settings);
    let calls = 0;
    const flaky: FetchLike = async () => (++calls === 1 ? Response.json({ message: "nej" }, { status: 500 }) : Response.json({ id: "prov" }));
    assert.equal(await emailAdminNotice(application, settings, flaky), true);
    const down: FetchLike = async () => Response.json({ message: "nej" }, { status: 500 });
    assert.equal(await emailAdminNotice(application, settings, down), false);
  });
});
