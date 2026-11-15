import { NextResponse } from "next/server";
import { completeCheckout } from "@/lib/payments/checkout";
import { paidSessionId, stripeSettings, verifyWebhook } from "@/lib/payments/stripe";

/**
 * Stripe säger till när en betalning är klar. Signaturen är behörigheten:
 * vägen är öppen förbi sajtspärren, eftersom Stripes server saknar kakan.
 * Ordern läggs av `completeCheckout`, som frågar Stripe själv om sessionen är
 * betald och ger samma order om händelsen kommer två gånger.
 */
export async function POST(request: Request) {
  const settings = stripeSettings();
  if (!settings) return NextResponse.json({ error: "Kortbetalning är inte aktiverad" }, { status: 503 });
  const payload = await request.text();
  if (!verifyWebhook(payload, request.headers.get("stripe-signature"), settings.webhookSecret)) {
    return NextResponse.json({ error: "Ogiltig signatur" }, { status: 400 });
  }
  let event: unknown = null;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Ogiltig händelse" }, { status: 400 });
  }
  const sessionId = paidSessionId(event);
  // Andra händelser än betalningar tackar vi för, så att Stripe inte skickar dem igen.
  if (!sessionId) return NextResponse.json({ received: true });
  try {
    const outcome = await completeCheckout(sessionId);
    return NextResponse.json({ received: true, status: outcome.status });
  } catch (error) {
    // Ett fel här betyder betald men inte lagd order. Stripe försöker igen när vi svarar 500.
    console.error("Betald kassa kunde inte bli en order", error);
    return NextResponse.json({ error: "Ordern kunde inte läggas" }, { status: 500 });
  }
}
