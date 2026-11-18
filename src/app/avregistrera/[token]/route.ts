import { db } from "@/lib/db/client";
import { esc } from "@/lib/email/layout";
import { linkSecrets } from "@/lib/outreach/link-token";
import { getLead, getMessage, suppress } from "@/lib/outreach/repository";
import { handleUnsubscribe, isUnsubscribeTokenValid, unsubscribeRequestKind } from "@/lib/outreach/unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" };

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · namnskylt.com</title><style>body{margin:0;font-family:system-ui,-apple-system,Arial,sans-serif;background:#f3f1ec;color:#0a0a0b}main{max-width:460px;margin:12vh auto;padding:32px;background:#fff;border-radius:18px}h1{font-family:Georgia,serif;font-weight:normal;font-size:28px;margin:0 0 12px}p{line-height:1.55;color:#5b616b}button{font:inherit;font-weight:600;background:#0a0a0b;color:#fff;border:0;border-radius:999px;padding:14px 28px;cursor:pointer;margin-top:8px}a{color:#0a0a0b}</style></head><body><main><h1>${esc(title)}</h1>${body}</main></body></html>`;
  return new Response(html, { status, headers: HEADERS });
}

const INVALID = page(
  "Länken gäller inte",
  `<p>Avregistreringslänken är ogiltig eller har gått ut. Svara på mejlet du fick, eller skriv till oss, så tar vi bort dig direkt.</p><p><a href="/integritet">Så hanterar vi uppgifter</a></p>`,
  404,
);

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  if (!isUnsubscribeTokenValid(token, linkSecrets(), new Date())) return INVALID;
  return page(
    "Avregistrera",
    `<p>Vill du inte få fler mejl om namnskyltsbutiken? Ett klick räcker.</p><form method="post"><input type="hidden" name="confirm" value="ja"><button type="submit">Avregistrera</button></form>`,
  );
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const kind = unsubscribeRequestKind(await request.text().catch(() => ""));
  if (!kind) return new Response("Ogiltig förfrågan", { status: 400, headers: { "cache-control": "no-store" } });
  const sql = db();
  if (!sql) return new Response("Tjänsten är inte tillgänglig", { status: 503 });

  const outcome = await handleUnsubscribe(token, kind, {
    secrets: linkSecrets(),
    now: new Date(),
    emailForMessage: async (messageId) => {
      const message = await getMessage(sql, messageId);
      return message ? ((await getLead(sql, message.leadId))?.email ?? null) : null;
    },
    suppress: ({ email, source, messageId }) => suppress(sql, { email, reason: "unsubscribe", source, messageId }),
  });

  if (kind === "one_click") {
    return new Response(outcome.ok ? "OK" : "Ogiltig länk", { status: outcome.ok ? 200 : 404 });
  }
  if (!outcome.ok) return INVALID;
  return page("Du är avregistrerad", `<p>Vi skickar inga fler mejl om det här till dig. Ångrar du dig räcker det att svara på mejlet du fick.</p>`);
}
