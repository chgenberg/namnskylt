"use client";

import { useEffect, useMemo, useState } from "react";
import { isBlankBadge, type BadgeDocument, type FontEngine, type PriceTable } from "@/engine";
import { useOrderShipping } from "@/hooks/use-order-shipping";
import { formattedOrgNumber } from "@/lib/company/org-number";
import { quoteHtml } from "@/lib/quotes/document";
import { draftQuote, type DraftCustomer } from "@/lib/quotes/draft";
import { addDays, isValidUntil, QUOTE_VALID_DAYS, swedishDay } from "@/lib/quotes/model";
import type { ResellerOrderContext } from "../reseller";
import { customerOf, firstTarget, recipientOf, type CustomerTarget } from "../sections/reseller-customer";

/** Så länge väntar förhandsvisningen efter senaste ändringen, så att dokumentet inte ritas om för varje tecken. */
const PREVIEW_DELAY_MS = 350;

/** En sparad offert: numret och var PDF:en hämtas. */
interface SavedQuote {
  quoteNo: string;
  pdfPath: string;
}

export type QuoteSaveState = { status: "idle" } | { status: "saving" } | { status: "error"; message: string } | { status: "saved"; quote: SavedQuote };

interface UseQuoteInput {
  reseller: ResellerOrderContext | undefined;
  /** Skyltarna offerten gäller: varukorgen och skylten i editorn. */
  badges: readonly BadgeDocument[];
  priceList: PriceTable;
  fonts: FontEngine;
  /** Offertvyn är öppen. Stängd ritas inget dokument och ingen frakt hämtas. */
  active: boolean;
  /** Stillbilden av skylten, tagen när vyn öppnades. Bara för en offert med en enda design. */
  badgeShot: string | null;
  /** Offerten är sparad: varukorgen ska tömmas. */
  onSaved: () => void;
}

/** Kunden som den står i förhandsvisningen. Den sparade offerten läser kundens riktiga uppgifter på servern. */
function previewCustomer(reseller: ResellerOrderContext, target: CustomerTarget): DraftCustomer | null {
  const empty = { company: "", name: "", email: "", phone: "", orgNumber: "" };
  if (reseller.customerId) return { ...empty, company: reseller.customerName };
  if (target.kind === "new") {
    return target.company.trim() || target.name.trim() ? { company: target.company, name: target.name, email: target.email, phone: target.phone, orgNumber: formattedOrgNumber(target.orgNumber) ?? target.orgNumber } : null;
  }
  const chosen = (reseller.customers ?? []).find((customer) => customer.id === target.id);
  if (!chosen) return null;
  // Listans andra rad är "namn · e-post", eller bara e-posten.
  const name = chosen.detail.includes(" · ") ? (chosen.detail.split(" · ")[0] ?? "") : "";
  return { ...empty, company: chosen.label, name, email: chosen.email };
}

/**
 * Offerten som görs med knappen Offert i skyltmotorn (beslut av ägaren 2026-11-19): säljaren
 * ser dokumentet, väljer kund och fyller i projekt, giltighet och hälsning, och sparar. Då
 * laddas PDF:en ner, och offerten väntar i panelen, där säljaren godkänner eller nekar åt
 * kunden. Inget mejlas härifrån.
 */
export function useQuote({ reseller, badges, priceList, fonts, active, badgeShot, onSaved }: UseQuoteInput) {
  const [target, setTarget] = useState<CustomerTarget>(() => firstTarget(reseller?.customers ?? []));
  const [project, setProject] = useState(reseller?.project ?? "");
  const [message, setMessage] = useState("");
  const [validUntil, setValidUntil] = useState(() => addDays(swedishDay(new Date()), QUOTE_VALID_DAYS));
  const [logo, setLogo] = useState(true);
  const [save, setSave] = useState<QuoteSaveState>({ status: "idle" });
  const shippingSek = useOrderShipping(badges, reseller?.purchaseList, active && badges.length > 0);
  const seller = reseller?.quoteSeller;

  const customer = useMemo(() => (reseller ? previewCustomer(reseller, target) : null), [reseller, target]);
  const draft = useMemo(
    () =>
      active && seller && badges.length > 0
        ? draftQuote({ badges, priceList, shippingSek, customer, project, message, validUntil, options: logo ? {} : { logo: false }, badgeShot, now: new Date() })
        : null,
    [active, seller, badges, priceList, shippingSek, customer, project, message, validUntil, logo, badgeShot],
  );
  const html = useMemo(() => (draft && seller ? quoteHtml(draft, fonts, seller.company, seller.plate) : null), [draft, fonts, seller]);
  // Dokumentet som visas ligger ett ögonblick efter det som skrivs.
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (html === null) return;
    const timer = window.setTimeout(() => setShown(html), shown === null ? 0 : PREVIEW_DELAY_MS);
    return () => window.clearTimeout(timer);
    // `shown` läses bara för att den första bilden ska komma direkt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

  const customers = reseller?.customers ?? [];
  const recipient = reseller?.customerId
    ? { label: reseller.customerName, email: "", ...(reseller.customerDemo && { demo: true }) }
    : recipientOf(target, customers);
  const blank = badges.length === 0 || badges.some((badge) => isBlankBadge(badge));

  const submit = async () => {
    if (!reseller || save.status === "saving") return;
    if (blank) return setSave({ status: "error", message: "Skylten är tom. Skriv ett namn eller lägg in en logga först." });
    const chosen = reseller.customerId ? ({ ok: true, body: { customerId: reseller.customerId } } as const) : customerOf(target, customers, reseller.needsInvoiceDetails ?? false);
    if (!chosen.ok) return setSave({ status: "error", message: chosen.error });
    if (!isValidUntil(validUntil, swedishDay(new Date()))) {
      return setSave({ status: "error", message: "Välj en dag som offerten gäller till, från i dag och högst ett år fram." });
    }
    setSave({ status: "saving" });
    try {
      const response = await fetch("/api/admin/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...chosen.body,
          badges,
          badgeShot: badgeShot ?? undefined,
          project: project.trim() || undefined,
          message: message.trim() || undefined,
          validUntil,
          options: logo ? {} : { logo: false },
          // Säljaren skickar PDF:en själv: inget mejlas härifrån.
          send: false,
        }),
      });
      const body = (await response.json().catch(() => null)) as { quoteNo?: string; pdfPath?: string; error?: string } | null;
      if (!response.ok || !body?.quoteNo || !body.pdfPath) throw new Error(body?.error ?? "Offerten kunde inte sparas");
      setSave({ status: "saved", quote: { quoteNo: body.quoteNo, pdfPath: body.pdfPath } });
      onSaved();
    } catch (error) {
      setSave({ status: "error", message: error instanceof Error ? error.message : "Offerten kunde inte sparas" });
    }
  };

  /** En ny offert efter en sparad: formuläret börjar om, med samma kund vald. */
  const reset = () => {
    setProject(reseller?.project ?? "");
    setMessage("");
    setShown(null);
    setSave({ status: "idle" });
  };

  return {
    /** Dokumentet som visas. `null` innan det finns något att rita. */
    html: shown,
    draft,
    target,
    setTarget,
    project,
    setProject,
    message,
    setMessage,
    validUntil,
    setValidUntil,
    logo,
    setLogo,
    recipient,
    blank,
    save,
    submit,
    reset,
  };
}

export type QuoteState = ReturnType<typeof useQuote>;
