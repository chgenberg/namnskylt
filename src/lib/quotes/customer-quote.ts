import "server-only";
import { type BadgeDocument } from "@/engine";
import { orgNumberSchema } from "@/lib/company/org-number";
import { formatSek } from "@/lib/format";
import { badgeCountLabel } from "@/lib/notices/model";
import { notify } from "@/lib/notices/notify";
import type { DeliveryAddress } from "@/lib/orders/delivery";
import { ERASED_CUSTOMER_ERROR, isErasedCustomer } from "@/lib/orders/erase-model";
import type { Pricing } from "@/lib/orders/pricing";
import { unassignedCustomerId, upsertCustomer } from "@/lib/orders/repository";
import { isUnassignedCustomer } from "@/lib/orders/unassigned-customer";
import type { ShippingMethod } from "@/engine";
import { acceptQuote, type AcceptResult } from "./accept";
import { parseQuoteRequester, type QuoteRequester, type QuoteShot, type StoredQuote } from "./model";
import { assignQuoteCustomer, createQuote } from "./repository";

export interface CustomerQuoteInput {
  /** Säljaren offerten sparas hos: namnskylt.com, eller butikens ägare. */
  tenant: string;
  /** Det kunden skrev om sig själv, om något. Inget av det krävs för att ladda ner offerten. */
  requester?: Partial<QuoteRequester> | null;
  badges: BadgeDocument[];
  badgeShot?: string | null;
  project?: string | null;
  customerPo?: string | null;
  /** Butikens priser. Utelämnad = listpris. */
  pricing?: Pricing | null;
  shots?: (QuoteShot | null)[] | null;
}

/** Namnet beskedet nämner den som laddade ner offerten vid, när den inte skrev något om sig själv. */
export const ANONYMOUS_REQUESTER = "En besökare";

/**
 * Sparar en offert som kunden har gjort själv i skyltmotorn (besked av ägaren 2026-11-20), och säger
 * till den som äger panelen. **Kunden behöver inte fylla i något**: offerten är till för att visa
 * kollegorna hur skyltarna blir, med bilder och pris (ägarens besked samma dag). Den sparas därför
 * utan kund i kundregistret, på säljarens platshållare, och väntar på svar. Det kunden ändå skrev
 * om sig själv står på offerten, obekräftat (`quotes.requester`).
 *
 * Kunden läggs upp i registret först när offerten godkänns (`acceptCustomerQuote`), som i kassan.
 * Beskedet syns i panelen, och hos namnskylt.com går det också som mejl till adminens adresser.
 */
export async function saveCustomerQuote(input: CustomerQuoteInput): Promise<{ quoteNo: string; token: string }> {
  const typed = parseQuoteRequester(input.requester);
  // Ett organisationsnummer som går att läsa skrivs som 556123-4567. Annat står som det skrevs.
  const orgNumber = typed ? orgNumberSchema.safeParse(typed.orgNumber) : null;
  const requester = typed ? { ...typed, orgNumber: orgNumber?.success ? orgNumber.data : typed.orgNumber } : null;
  const { id, quoteNo, token, totalSek } = await createQuote({
    tenant: input.tenant,
    customerId: await unassignedCustomerId(input.tenant),
    badges: input.badges,
    demo: false,
    badgeShot: input.badgeShot ?? null,
    project: input.project ?? null,
    customerPo: input.customerPo ?? null,
    delivery: { to: "customer", address: null },
    pricing: input.pricing ?? null,
    shots: input.shots ?? null,
    byCustomer: true,
    requester,
  });
  const count = input.badges.reduce((total, badge) => total + Math.max(1, Math.floor(badge.quantity)), 0);
  await notify({
    tenant: input.tenant,
    kind: "quote-created",
    who: requester?.company || requester?.name || ANONYMOUS_REQUESTER,
    detail: `${badgeCountLabel(count)} · ${formatSek(totalSek)} exkl. moms`,
    quoteId: id,
  });
  return { quoteNo, token };
}

/** Uppgifterna kunden fyller i när den godkänner en offert som saknar kund i registret: kassans. */
export interface QuoteClaim {
  company: string;
  orgNumber: string;
  name: string;
  email: string;
}

/**
 * Kunden godkänner en offert som den laddade ner själv och som ännu saknar kund i registret. Kunden
 * läggs upp med uppgifterna den fyller i nu, samma som i kassan, offerten får sin kund, och sedan
 * godkänns den som vilken offert som helst. En offert som redan har en kund godkänns direkt.
 */
export async function acceptCustomerQuote(
  quote: Pick<StoredQuote, "resellerId" | "quoteNo" | "noCustomer" | "byCustomer">,
  claim: QuoteClaim | null,
  address: DeliveryAddress | null,
  method: ShippingMethod | null,
  customerPo: string | null,
): Promise<AcceptResult> {
  if (quote.noCustomer) {
    // Bara en offert som kunden själv har laddat ner får sin kund den här vägen. Ett utkast väljer säljaren kund till.
    if (!quote.byCustomer) return { ok: false, error: "Offerten är inte klar än" };
    if (!claim) return { ok: false, error: "Fyll i era uppgifter för att godkänna offerten" };
    const company = claim.company.trim();
    const name = claim.name.trim();
    const email = claim.email.trim().toLowerCase();
    const orgNumber = orgNumberSchema.safeParse(claim.orgNumber);
    if (company.length < 2) return { ok: false, error: "Ange företagets namn" };
    if (!orgNumber.success) return { ok: false, error: "Organisationsnumret ska ha tio siffror" };
    if (!name) return { ok: false, error: "Skriv ditt namn" };
    // En borttagen kunds rad får aldrig skrivas över, och inte heller platshållaren för utkast utan kund.
    if (isErasedCustomer({ email })) return { ok: false, error: ERASED_CUSTOMER_ERROR };
    if (isUnassignedCustomer({ email })) return { ok: false, error: "E-postadressen går inte att använda" };
    const customer = await upsertCustomer(quote.resellerId, { name, email, company, orgNumber: orgNumber.data });
    const assigned = await assignQuoteCustomer(quote.resellerId, quote.quoteNo, customer);
    // Någon annan hann före, till exempel säljaren i panelen: då gäller den kunden.
    if (!assigned) return { ok: false, error: "Offerten har ändrats. Ladda om sidan och försök igen." };
  }
  return acceptQuote(quote.resellerId, quote.quoteNo, false, address, method, customerPo);
}
