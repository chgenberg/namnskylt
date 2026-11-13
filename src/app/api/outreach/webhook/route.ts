import { NextResponse } from "next/server";
import * as store from "@/lib/outreach/repository";
import {
  applyResendEvent,
  MAX_WEBHOOK_BODY_BYTES,
  resendEventSchema,
  verifySvix,
  type WebhookStore,
} from "@/lib/outreach/webhook";

export const runtime = "nodejs";

function webhookStore(): WebhookStore {
  const sql = store.outreachDb();
  return {
    messageByResendId: (id) => store.messageByResendId(sql, id),
    leadEmail: async (leadId) => (await store.getLead(sql, leadId))?.email ?? null,
    insertEvent: (input) => store.insertEvent(sql, input),
    setMessageStatus: (id, from, to) => store.setMessageStatus(sql, id, from, to),
    suppress: async (input) => {
      await store.suppress(sql, { ...input, source: "webhook" });
    },
    pauseAll: async (reason) => {
      await store.pauseActiveCampaigns(sql, reason);
      await store.setControl(sql, { paused: true }, "auto");
    },
  };
}

/** Resends leveranshändelser. Signaturen är enda behörigheten; utan hemlighet är routen stängd. */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhooken är inte aktiverad" }, { status: 503 });

  const body = await request.text();
  if (body.length > MAX_WEBHOOK_BODY_BYTES) return NextResponse.json({ error: "För stor" }, { status: 413 });
  const headers = {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  };
  if (!verifySvix(body, headers, secret, Math.floor(Date.now() / 1000)) || !headers.id) {
    return NextResponse.json({ error: "Ogiltig signatur" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }
  const parsed = resendEventSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Ogiltig händelse" }, { status: 400 });

  const outcome = await applyResendEvent(webhookStore(), headers.id, parsed.data, new Date());
  return NextResponse.json({ ok: true, outcome });
}
