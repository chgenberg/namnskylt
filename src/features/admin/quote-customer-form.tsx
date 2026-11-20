"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CustomerChoice } from "@/features/designer/reseller";
import { customerOf, firstTarget, ResellerCustomer, type CustomerTarget } from "@/features/designer/sections/reseller-customer";
import { assignQuoteCustomerAction } from "./quote-actions";
import styles from "./admin.module.css";

interface QuoteCustomerFormProps {
  quoteNo: string;
  customers: readonly CustomerChoice[];
  /** Hos namnskylt.com fakturerar verkstaden kunden: då krävs företag, organisationsnummer, kontaktperson och e-post. */
  needsInvoiceDetails: boolean;
}

/**
 * Väljer kund till ett utkast som sparades utan kund i skyltmotorn (besked via ägaren 2026-11-20).
 * Samma val som i offertvyn: en av säljarens kunder, eller en ny. Först när kunden är vald går
 * offerten att skicka och godkänna.
 */
export function QuoteCustomerForm({ quoteNo, customers, needsInvoiceDetails }: QuoteCustomerFormProps) {
  const router = useRouter();
  const [target, setTarget] = useState<CustomerTarget>(() => firstTarget(customers));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // En återförsäljares kund behöver bara ett företagsnamn, som när offerten sparas med kund i skyltmotorn.
  const minimal = !needsInvoiceDetails;

  const save = () => {
    const chosen = customerOf(target, customers, needsInvoiceDetails, minimal);
    if (!chosen.ok) return setError(chosen.error);
    const { body } = chosen;
    if ("noCustomer" in body) return;
    setError(null);
    startTransition(async () => {
      const result = await assignQuoteCustomerAction(quoteNo, body);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  };

  return (
    <div className={styles.form} data-quote-customer-form>
      <ResellerCustomer customers={customers} value={target} onChange={setTarget} needsInvoiceDetails={needsInvoiceDetails} minimal={minimal} disabled={pending} />
      <div className={styles.actionBar}>
        <button type="button" className="btn btn--primary" disabled={pending} onClick={save}>
          {pending ? "Sparar…" : "Spara kund"}
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
