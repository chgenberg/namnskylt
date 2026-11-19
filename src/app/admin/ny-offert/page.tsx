import { redirect } from "next/navigation";
import { adminTenant } from "@/features/admin/guard";

interface NewQuotePageProps {
  searchParams: Promise<{ kund?: string }>;
}

/**
 * Ny offert öppnar skyltmotorn direkt (besked av ägaren 2026-11-19: från panelen ledde vägen
 * genom ett kundformulär och varukorgen, medan den snabba offerten bara nåddes via startsidan).
 * Säljaren gör skylten och trycker på Offert, och väljer kunden där. Med `?kund=` är kunden
 * vald i förväg.
 */
export default async function NewQuotePage({ searchParams }: NewQuotePageProps) {
  const tenant = await adminTenant();
  if (!tenant) return null;
  const { kund } = await searchParams;
  redirect(kund && /^[0-9a-f-]{36}$/i.test(kund) ? `/skapa?kund=${kund}&offert=1` : "/skapa?offert=1");
}
