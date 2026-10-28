import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { loadNodeFontEngine } from "@/lib/fonts/load-node";
import { darkPlate, isLightLogo } from "@/lib/images/logo-tone";
import { databaseConfigured, getCompanyProfile } from "@/lib/orders/repository";
import { htmlToPdf } from "@/lib/pdf/html-to-pdf";
import { quoteHtml } from "@/lib/quotes/document";
import { getQuoteByToken } from "@/lib/quotes/repository";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Varje PDF startar en webbläsare — taket skyddar servern, inte offerten. */
const perClient = createRateLimiter({ limit: 30, windowMs: 60 * 60 * 1000 });

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!databaseConfigured()) return new Response("Hittades inte", { status: 404 });
  const quote = await getQuoteByToken((await params).token);
  if (!quote || quote.status === "cancelled") return new Response("Hittades inte", { status: 404 });
  if (!perClient.take(clientKey(request))) return new Response("För många nedladdningar. Försök igen om en stund.", { status: 429 });

  try {
    const [fonts, company] = await Promise.all([loadNodeFontEngine(), getCompanyProfile(quote.resellerId)]);
    const plate = (await isLightLogo(company.logo)) ? darkPlate(company.primaryColor) : null;
    const pdf = await htmlToPdf(quoteHtml(quote, fonts, company, plate));
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="Offert-${quote.quoteNo}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Offert-PDF kunde inte skapas", error);
    return new Response("PDF:en kunde inte skapas", { status: 500 });
  }
}
