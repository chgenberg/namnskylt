import { NextResponse } from "next/server";
import { SIGNATURE_HEADER, supplierOrderStateSchema, verifyWebhookSignature } from "@/lib/supplier/status";
import { applySupplierState } from "@/lib/supplier/sync";

const MAX_BODY_BYTES = 16_000;

/**
 * Leverantören meddelar statusändringar här. Signaturen är enda behörigheten,
 * så utan nyckel i miljön är webhooken stängd.
 */
export async function POST(request: Request) {
  const secret = process.env.SUPPLIER_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhooken är inte aktiverad" }, { status: 503 });

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return NextResponse.json({ error: "För stor" }, { status: 413 });
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!verifyWebhookSignature(body, request.headers.get(SIGNATURE_HEADER), secret, nowSeconds)) {
    return NextResponse.json({ error: "Ogiltig signatur" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }
  const parsed = supplierOrderStateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Ogiltig status" }, { status: 400 });

  const result = await applySupplierState(parsed.data);
  // 404 får leverantören att sluta försöka — ordern finns inte hos oss.
  if (!result.found) return NextResponse.json({ error: "Okänd order" }, { status: 404 });
  return NextResponse.json({ ok: true, changed: result.changed });
}
