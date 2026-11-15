import type { Metadata } from "next";
import { PaymentResult, type PaymentView } from "@/features/payment/payment-result";
import { completeCheckout } from "@/lib/payments/checkout";
import { estimatedShipDate } from "@/lib/supplier/client";

export const metadata: Metadata = { title: "Betalning", robots: { index: false, follow: false } };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Sidan Stripe skickar kunden till efter betalningen. Stripes eget svar avgör om ordern läggs, inte adressen. */
async function viewFor(sessionId: string | undefined): Promise<PaymentView> {
  if (!sessionId) return { status: "unknown" };
  try {
    const outcome = await completeCheckout(sessionId);
    if (outcome.status === "paid") {
      return { status: "paid", orderNumber: outcome.orderNumber, shipDate: estimatedShipDate(), orderPath: outcome.orderPath };
    }
    return outcome.status === "unpaid" ? { status: "pending" } : { status: "unknown" };
  } catch (error) {
    console.error("Betald kassa kunde inte bli en order", error);
    return { status: "failed" };
  }
}

export default async function PaidPage({ searchParams }: { searchParams: Promise<{ session_id?: string | string[] }> }) {
  return (
    <main>
      <PaymentResult view={await viewFor(first((await searchParams).session_id))} />
    </main>
  );
}
