import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { withInlineLogoImages } from "@/lib/logo-images/repository";
import { packingSlipHtml } from "@/lib/orders/packing-slip";
import { databaseConfigured, getOrderByPackingCode } from "@/lib/orders/repository";
import { customerOrderNumber } from "@/lib/orders/model";
import { htmlToPdf } from "@/lib/pdf/html-to-pdf";
import { quoteSellerView } from "@/lib/quotes/seller-view";

export const runtime = "nodejs";
export const maxDuration = 30;

const HOUR_MS = 60 * 60 * 1000;
/** Koden är kort, så den som gissar stoppas tidigt: taket gäller varje försök, också ett som inte hittar något. */
const perClient = createRateLimiter({ limit: 120, windowMs: HOUR_MS });

/**
 * Följesedeln för en order som PDF, som verkstaden öppnar via den korta länken på sitt
 * orderpapper, skriver ut och lägger i paketet. Koden i adressen är behörigheten. Sidan är en
 * PDF och inte en webbsida, så att utskriften aldrig bär webbläsarens sidhuvud med adressen:
 * en återförsäljares följesedel ska inte nämna namnskylt.com.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!databaseConfigured()) return new Response("Hittades inte", { status: 404 });
  if (!perClient.take(clientKey(request))) return new Response("För många försök. Försök igen om en stund.", { status: 429 });
  const order = await getOrderByPackingCode((await params).code.toLowerCase());
  if (!order || order.status === "cancelled") return new Response("Hittades inte", { status: 404 });

  try {
    const { company, plate } = await quoteSellerView(order.resellerId);
    const pdf = await htmlToPdf(packingSlipHtml({ ...order, badges: await withInlineLogoImages(order.badges) }, company, plate));
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="Foljesedel-${customerOrderNumber(order).number}.pdf"`,
        "cache-control": "private, no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    console.error("Följesedeln kunde inte skapas", error);
    return new Response("Följesedeln kunde inte skapas", { status: 500 });
  }
}
