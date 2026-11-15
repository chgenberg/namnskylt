import type { Metadata } from "next";
import { PaymentResult } from "@/features/payment/payment-result";
import { unpaidCheckoutBadges } from "@/lib/payments/checkout";
import { encodeShareCode } from "@/lib/share/share-link";

export const metadata: Metadata = { title: "Betalningen avbröts", robots: { index: false, follow: false } };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Länken tillbaka till skylten kunden höll på med: kassan har den kvar tills den betalas eller städas bort. */
async function resumeHref(checkoutId: string | undefined): Promise<string> {
  const [badge] = checkoutId ? await unpaidCheckoutBadges(checkoutId) : [];
  if (!badge) return "/skapa";
  const share = await encodeShareCode(badge).catch(() => null);
  return share?.code ? `/skapa?d=${encodeURIComponent(share.code)}` : "/skapa";
}

export default async function CancelledPage({ searchParams }: { searchParams: Promise<{ kassa?: string | string[] }> }) {
  return (
    <main>
      <PaymentResult view={{ status: "cancelled", resumeHref: await resumeHref(first((await searchParams).kassa)) }} />
    </main>
  );
}
