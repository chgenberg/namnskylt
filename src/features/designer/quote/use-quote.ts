"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { isBlankBadge, lineUnitPrices, orderDesigns, resellerOrder, type BadgeDocument, type FontEngine, type PriceTable } from "@/engine";
import { useOrderShipping } from "@/hooks/use-order-shipping";
import { formattedOrgNumber, orgNumberSchema } from "@/lib/company/org-number";
import type { SellerProfile } from "@/lib/company/seller";
import type { CustomerAccountView } from "@/lib/customer-auth/model";
import { priceWithPricing, type Pricing } from "@/lib/orders/pricing";
import { marginOf } from "@/lib/orders/purchase";
import { quoteDocument, type QuoteMargin } from "@/lib/quotes/document";
import { draftQuote, type DraftCustomer } from "@/lib/quotes/draft";
import { defaultQuoteTitle } from "@/lib/quotes/view";
import {
  addDays,
  isValidUntil,
  QUOTE_CLOSING_MAX,
  QUOTE_ELEMENTS,
  QUOTE_SHOT_DESIGNS,
  QUOTE_VALID_DAYS,
  swedishDay,
  type QuoteElement,
  type QuoteOptions,
  type QuoteShot,
} from "@/lib/quotes/model";
import { shopOrderPricing } from "@/lib/shops/price-list";
import type { ResellerOrderContext, ShopContext } from "../reseller";
import { customerOf, firstTarget, recipientOf, type CustomerTarget } from "../sections/reseller-customer";
import type { VideoClip } from "../three/recorder";
import { videoFileName } from "../video-file";
import type { ShotJob } from "./quote-shots";

/** En 3D-film som laddas ner med offerten: filnamnet och adressen till klippet i webbläsarens minne. */
interface QuoteFilm {
  name: string;
  url: string;
}

/** En sparad offert: numret och var PDF:en hämtas. Filmerna kommer för sig, när de är inspelade. */
interface SavedQuote {
  quoteNo: string;
  pdfPath: string;
  /** Offerten sparades som utkast, utan kund: kunden väljs i panelen. */
  noCustomer: boolean;
  /** Sidan där kunden godkänner en offert som kunden har gjort själv. */
  quotePath?: string;
}

/** Uppgifterna en slutkund fyller i för sin egen offert: samma som i kassan. */
export interface QuoteContact {
  orgNumber: string;
  company: string;
  name: string;
  email: string;
}

const EMPTY_CONTACT: QuoteContact = { orgNumber: "", company: "", name: "", email: "" };

/** Kundens uppgifter ur kontot, när kunden är inloggad. Det som redan är skrivet står kvar där kontot saknar något. */
function contactOf(account: CustomerAccountView | null | undefined, current: QuoteContact = EMPTY_CONTACT): QuoteContact {
  if (!account) return current;
  const { profile } = account;
  return {
    orgNumber: profile.orgNumber || current.orgNumber,
    company: profile.company || current.company,
    name: profile.name || current.name,
    email: account.email,
  };
}

/** Säljaren som offertens dokument ritas med. */
type QuoteSeller = { company: SellerProfile; plate: string | null };

export type QuoteSaveState = { status: "idle" } | { status: "saving" } | { status: "error"; message: string } | { status: "saved"; quote: SavedQuote };

/**
 * Det ikonraden slår av och på: dokumentets delar, de två texterna som går att lägga till,
 * och 3D-filmerna. Hälsningen och den avslutande texten sparas som text, inte som val, och
 * filmerna hör inte till dokumentet: de laddas ner bredvid det.
 */
export type QuoteToggle = QuoteElement | "message" | "closing" | "film";

/** Från början visas allt, med plats för en hälsning. Den avslutande texten läggs till vid behov. */
const FIRST_ELEMENTS: Record<QuoteToggle, boolean> = {
  logo: true,
  message: true,
  pictures: true,
  angles: true,
  badges: true,
  vat: true,
  closing: false,
  promises: true,
  accept: true,
  terms: true,
  seller: true,
  film: true,
};

/** Högsta marginalen som går att sätta i offertvyn. Vid 100 % vore kundens pris oändligt. */
const MAX_MARGIN_PERCENT = 90;

/** Fälten i panelen som dokumentet leder till när säljaren klickar på kunden eller giltighetsdagen. */
export const QUOTE_FIELD_IDS = { customer: "quote-customer", validUntil: "quote-valid-until" } as const;

interface UseQuoteInput {
  reseller: ResellerOrderContext | undefined;
  /**
   * En slutkund gör offerten själv, utan att vara inloggad i panelen (besked av ägaren 2026-11-20):
   * samma dokument, till kundens pris, som laddas ner som PDF. Gäller bara när `reseller` saknas.
   */
  self?: boolean;
  /** Butiken skyltmotorn står i. Kundens offert får då butikens priser och butikens säljare. */
  shop?: ShopContext;
  /** Kunden som är inloggad: uppgifterna fylls i ur kontot. */
  account?: CustomerAccountView | null;
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
  if (target.kind === "none") return null;
  if (target.kind === "new") {
    return target.company.trim() || target.name.trim()
      ? { company: target.company, name: target.name, email: target.email, phone: target.phone, orgNumber: formattedOrgNumber(target.orgNumber) ?? target.orgNumber }
      : null;
  }
  const chosen = (reseller.customers ?? []).find((customer) => customer.id === target.id);
  if (!chosen) return null;
  // Listans andra rad är "namn · e-post", eller bara e-posten.
  const name = chosen.detail.includes(" · ") ? (chosen.detail.split(" · ")[0] ?? "") : "";
  return { ...empty, company: chosen.label, name, email: chosen.email };
}

/** Nyckeln en designs bilder sparas under: skylten som den ser ut, utan antalet. */
const shotKey = (doc: BadgeDocument) => JSON.stringify({ ...doc, quantity: 1 });

/**
 * Offerten som görs med knappen Offert i skyltmotorn (beslut av ägaren 2026-11-19): säljaren
 * ser dokumentet, ändrar texterna direkt i det, lägger till och tar bort delar med ikonraden,
 * väljer kund och sparar. Då laddas PDF:en ner, och offerten väntar i panelen, där säljaren
 * godkänner eller nekar åt kunden. Inget mejlas härifrån.
 */
export function useQuote({ reseller, self: selfQuote = false, shop, account, badges, priceList, fonts, active, badgeShot, onSaved }: UseQuoteInput) {
  /** Kunden gör offerten själv. Den som är inloggad i panelen gör den alltid åt en kund. */
  const self = selfQuote && !reseller;
  const [contact, setContact] = useState<QuoteContact>(() => contactOf(account));
  // Loggar kunden in i varukorgen medan sidan är öppen fylls uppgifterna i ur kontot.
  useEffect(() => {
    if (account) setContact((current) => contactOf(account, current));
  }, [account]);
  /**
   * Säljaren för kundens egen offert: namnskylt.com eller butikens ägare. Den hämtas först när
   * offerten öppnas, så att loggan inte följer med varje besök i skyltmotorn.
   */
  const [selfSeller, setSelfSeller] = useState<QuoteSeller | null>(null);
  const [sellerFailed, setSellerFailed] = useState(false);
  const shopSlug = shop?.slug;
  useEffect(() => {
    if (!self || !active || selfSeller) return;
    const controller = new AbortController();
    setSellerFailed(false);
    fetch(`/api/quotes/seller${shopSlug ? `?shop=${encodeURIComponent(shopSlug)}` : ""}`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<QuoteSeller>) : null))
      .then((found) => {
        if (controller.signal.aborted) return;
        if (found?.company) setSelfSeller(found);
        else setSellerFailed(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSellerFailed(true);
      });
    return () => controller.abort();
  }, [self, active, selfSeller, shopSlug]);
  const [target, setTarget] = useState<CustomerTarget>(() => firstTarget(reseller?.customers ?? []));
  const [project, setProject] = useState(reseller?.project ?? "");
  /** Kundens eget inköpsnummer, när säljaren redan har det. Kunden kan annars fylla i det när offerten godkänns. */
  const [customerPo, setCustomerPo] = useState("");
  const [message, setMessage] = useState("");
  const [closing, setClosing] = useState("");
  const [validUntil, setValidUntil] = useState(() => addDays(swedishDay(new Date()), QUOTE_VALID_DAYS));
  const [elements, setElements] = useState(FIRST_ELEMENTS);
  const [save, setSave] = useState<QuoteSaveState>({ status: "idle" });
  const shippingSek = useOrderShipping(badges, reseller?.purchaseList, active && badges.length > 0);
  const seller = reseller?.quoteSeller ?? (self ? (selfSeller ?? undefined) : undefined);

  // Bilderna ur 3D-vyn, per design. De tas en gång och finns kvar om vyn stängs och öppnas igen.
  const [shots, setShots] = useState<Record<string, QuoteShot | null>>({});
  const live = useMemo(() => orderDesigns(badges).slice(0, QUOTE_SHOT_DESIGNS).map(({ doc }) => ({ key: shotKey(doc), doc })), [badges]);
  /**
   * Offertens designer som de var när offerten sparades. Varukorgen töms då, men filmerna ska spelas
   * in klart: Spara väntar inte på dem (beslut av ägaren 2026-11-19), de laddas ner när de är klara.
   */
  const [frozen, setFrozen] = useState<typeof live | null>(null);
  const designs = frozen ?? live;
  /** 3D-filmerna, en per design: ett varv runt skylten, som laddas ner med offerten (besked av ägaren 2026-11-19). */
  const [films, setFilms] = useState<Record<string, VideoClip | null>>({});
  const filming = elements.film;
  // Bilderna tas först, för de syns i dokumentet. Filmerna spelas in efteråt, en i taget.
  const jobs = useMemo<ShotJob[]>(() => {
    if (!active) return [];
    const stills = designs.filter((design) => !(design.key in shots)).map((design) => ({ ...design, kind: "shot" as const }));
    const turns = filming ? designs.filter((design) => !(design.key in films)).map((design) => ({ ...design, kind: "film" as const })) : [];
    return [...stills, ...turns];
  }, [active, designs, shots, films, filming]);
  const onShot = useCallback((key: string, shot: QuoteShot | null) => setShots((taken) => ({ ...taken, [key]: shot })), []);
  const onFilm = useCallback((key: string, film: VideoClip | null) => setFilms((taken) => ({ ...taken, [key]: film })), []);
  const quoteShots = useMemo(() => designs.map((design) => shots[design.key] ?? null), [designs, shots]);

  const options = useMemo<QuoteOptions>(() => {
    const chosen: QuoteOptions = {};
    for (const element of QUOTE_ELEMENTS) if (!elements[element]) chosen[element] = false;
    if (elements.closing && closing.trim()) chosen.closing = closing.trim();
    return chosen;
  }, [elements, closing]);
  const greeting = elements.message ? message : "";

  /**
   * Säljarens marginal (besked av ägaren 2026-11-19: "er marginal", som går att ändra som i Merchin
   * och bara syns för säljaren). `null` = listpris. Annars sätts kundens pris per skylt så att
   * marginalen blir den valda, räknat på säljarens inköp: pris = inköp / (1 − marginal).
   * Bara en återförsäljare har inköpspriser här; admin ser aldrig rutan.
   */
  const [marginPercent, setMarginPercent] = useState<number | null>(null);
  const purchaseList = reseller?.purchaseList;
  const purchase = useMemo(
    () => (purchaseList && badges.length > 0 ? { units: lineUnitPrices(badges, purchaseList), goodsSek: resellerOrder(badges, purchaseList).goodsSek } : null),
    [purchaseList, badges],
  );
  const shopPrices = shop?.priceList;
  const pricing = useMemo<Pricing | null>(() => {
    // Kundens egen offert i en butik får butikens priser, som när kunden beställer där.
    if (self) return badges.length > 0 ? shopOrderPricing(badges, shopPrices, priceList) : null;
    return marginPercent === null || !purchase
      ? null
      : { unitOverrides: purchase.units.map((unit) => Math.max(1, Math.round(unit / (1 - marginPercent / 100)))), discountPercent: 0, extras: [] };
  }, [self, badges, shopPrices, priceList, marginPercent, purchase]);

  const customer = useMemo<DraftCustomer | null>(() => {
    if (self) {
      // Kunden står på offerten som den fyller i sina uppgifter.
      return contact.company.trim() || contact.name.trim()
        ? { company: contact.company, name: contact.name, email: contact.email, phone: "", orgNumber: formattedOrgNumber(contact.orgNumber) ?? contact.orgNumber }
        : null;
    }
    return reseller ? previewCustomer(reseller, target) : null;
  }, [self, contact, reseller, target]);
  /** Valet Utkast: offerten sparas utan kund. Gäller inte när kunden är vald i förväg från panelen. */
  const noCustomer = !self && !reseller?.customerId && target.kind === "none";
  const draft = useMemo(
    () =>
      active && seller && badges.length > 0
        ? draftQuote({ badges, priceList, shippingSek, customer, customerPo, noCustomer: noCustomer || (self && !customer), project, message: greeting, validUntil, options, badgeShot, shots: quoteShots, pricing, byCustomer: self, now: new Date() })
        : null,
    [active, seller, badges, priceList, shippingSek, customer, customerPo, noCustomer, project, greeting, validUntil, options, badgeShot, quoteShots, pricing, self],
  );
  // Marginalen räknas på varorna, utan frakt, som överallt annars.
  const margin = useMemo<QuoteMargin | undefined>(() => {
    if (!draft || !purchase) return undefined;
    const saleSek = priceWithPricing(draft.badges, draft.pricing, draft.priceList, 0).goodsSek;
    const { sek, percent } = marginOf(saleSek, purchase.goodsSek);
    return { purchaseSek: purchase.goodsSek, saleSek, marginSek: sek, percent, custom: draft.pricing !== null };
  }, [draft, purchase]);
  const slots = useMemo(() => ({ message: elements.message, closing: elements.closing }), [elements.message, elements.closing]);
  const drawn = useMemo(
    () =>
      draft && seller
        ? // Kundens egen offert är säljarens dokument: kunden ser det, men ändrar inga texter i det.
          quoteDocument(draft, fonts, seller.company, seller.plate, self ? {} : { editable: true, slots, margin })
        : null,
    [draft, fonts, seller, slots, margin, self],
  );
  // Dokumentet står kvar efter att offerten har sparats och varukorgen tömts.
  const [kept, setKept] = useState<{ css: string; body: string } | null>(null);
  useEffect(() => {
    if (drawn) setKept(drawn);
  }, [drawn]);
  const markup = useDeferredValue(kept);

  const customers = reseller?.customers ?? [];
  /**
   * En återförsäljares kund behöver bara ett företagsnamn på offerten (beslut av ägaren 2026-11-19):
   * offerten mejlas inte härifrån. Hos namnskylt.com fakturerar verkstaden kunden, och där krävs allt.
   */
  const minimal = Boolean(reseller) && !(reseller?.needsInvoiceDetails ?? false);
  const recipient = reseller?.customerId
    ? { label: reseller.customerName, email: "", ...(reseller.customerDemo && { demo: true }) }
    : recipientOf(target, customers, minimal);
  const blank = badges.length === 0 || badges.some((badge) => isBlankBadge(badge));
  /** Bilderna tas just nu. Offerten sparas när de är klara, så att PDF:en får dem. */
  const capturing = elements.pictures && jobs.some((job) => job.kind === "shot");
  /** Så många filmer återstår att spela in. Spara väntar inte på dem. */
  const filmsLeft = jobs.filter((job) => job.kind === "film").length;
  // Filmerna som hör till den sparade offerten, med offertens nummer i namnet. De fylls på när de blir klara.
  const urls = useRef(new Map<string, string>());
  const savedFilms = useMemo<QuoteFilm[]>(() => {
    if (save.status !== "saved" || !filming) return [];
    const number = save.quote.quoteNo.toLowerCase();
    return designs.flatMap((design, index) => {
      const clip = films[design.key];
      if (!clip) return [];
      const url = urls.current.get(design.key) ?? URL.createObjectURL(clip.blob);
      urls.current.set(design.key, url);
      return [{ name: videoFileName(design.doc, clip.extension, index === 0 ? number : `${number}-${index + 1}`), url }];
    });
  }, [save, filming, designs, films]);

  const toggle = useCallback((key: QuoteToggle) => setElements((shown) => ({ ...shown, [key]: !shown[key] })), []);

  /** En text som säljaren har skrivit om direkt i dokumentet. */
  const edit = useCallback(
    (field: string, raw: string) => {
      const text = raw.replace(/\r/g, "").trim();
      if (field === "margin-reset") setMarginPercent(null);
      if (field === "margin") {
        // Ett tomt eller oläsligt fält ändrar ingenting.
        const percent = Number(text.replace(",", "."));
        if (text !== "" && Number.isFinite(percent)) setMarginPercent(Math.min(MAX_MARGIN_PERCENT, Math.max(0, Math.round(percent))));
      }
      if (field === "message") setMessage(text.slice(0, 2000));
      if (field === "closing") setClosing(text.slice(0, QUOTE_CLOSING_MAX));
      if (field === "project") {
        // Rubriken som står där utan projekt är inget projektnamn: orörd sparas den inte.
        const fallback = draft ? defaultQuoteTitle(draft) : "";
        setProject(text === fallback ? "" : text.replace(/\s+/g, " ").slice(0, 120));
      }
    },
    [draft],
  );

  /** Kunden och giltighetsdagen ändras i panelen: ett klick i dokumentet leder dit. */
  const jump = useCallback((field: string) => {
    const id = QUOTE_FIELD_IDS[field as keyof typeof QUOTE_FIELD_IDS];
    const element = id ? document.getElementById(id) : null;
    if (!element) return;
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    const input = element instanceof HTMLInputElement ? element : element.querySelector<HTMLElement>("input, button");
    input?.focus({ preventScroll: true });
    // Datumväljaren öppnas direkt, där webbläsaren har en.
    if (input instanceof HTMLInputElement && input.type === "date") {
      try {
        input.showPicker();
      } catch {
        // Fältet har fokus, och dagen går att skriva.
      }
    }
  }, []);

  /** Kunden sparar sin egen offert: den sparas hos säljaren och laddas ner. Varukorgen står kvar. */
  const submitSelf = async () => {
    if (save.status === "saving" || capturing) return;
    if (blank) return setSave({ status: "error", message: "Skylten är tom. Skriv ett namn eller lägg in en logga först." });
    if (!orgNumberSchema.safeParse(contact.orgNumber).success) return setSave({ status: "error", message: "Skriv organisationsnumret, tio siffror." });
    if (contact.company.trim().length < 2) return setSave({ status: "error", message: "Skriv företagets namn." });
    if (!contact.name.trim()) return setSave({ status: "error", message: "Skriv ditt namn." });
    if (!/^\S+@\S+\.\S+$/.test(contact.email.trim())) return setSave({ status: "error", message: "Skriv din e-postadress." });
    setSave({ status: "saving" });
    try {
      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer: { name: contact.name.trim(), email: contact.email.trim(), company: contact.company.trim(), orgNumber: contact.orgNumber.trim() },
          badges,
          badgeShot: badgeShot ?? undefined,
          project: project.trim() || undefined,
          customerPo: customerPo.trim() || undefined,
          ...(quoteShots.some(Boolean) && { shots: quoteShots }),
          ...(shopSlug && { shop: shopSlug }),
        }),
      });
      const body = (await response.json().catch(() => null)) as { quoteNo?: string; pdfPath?: string; quotePath?: string; error?: string } | null;
      if (!response.ok || !body?.quoteNo || !body.pdfPath) throw new Error(body?.error ?? "Offerten kunde inte sparas");
      // Designerna hålls kvar, så att filmen spelas in klart också om kunden ändrar skylten under tiden.
      setFrozen(designs);
      setSave({ status: "saved", quote: { quoteNo: body.quoteNo, pdfPath: body.pdfPath, noCustomer: false, quotePath: body.quotePath } });
    } catch (error) {
      setSave({ status: "error", message: error instanceof Error ? error.message : "Offerten kunde inte sparas" });
    }
  };

  const submit = async () => {
    if (self) return submitSelf();
    if (!reseller || save.status === "saving" || capturing) return;
    if (blank) return setSave({ status: "error", message: "Skylten är tom. Skriv ett namn eller lägg in en logga först." });
    const chosen = reseller.customerId ? ({ ok: true, body: { customerId: reseller.customerId } } as const) : customerOf(target, customers, reseller.needsInvoiceDetails ?? false, minimal);
    // Ingen kund vald i listan: då går det också att spara som utkast.
    if (!chosen.ok) return setSave({ status: "error", message: target.kind === "existing" ? "Välj en kund, fyll i en ny, eller välj Utkast för att spara utan kund." : chosen.error });
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
          customerPo: customerPo.trim() || undefined,
          message: greeting.trim() || undefined,
          validUntil,
          options,
          ...(pricing && { pricing }),
          ...(elements.pictures && quoteShots.some(Boolean) && { shots: quoteShots }),
          // Säljaren skickar PDF:en själv: inget mejlas härifrån.
          send: false,
        }),
      });
      const body = (await response.json().catch(() => null)) as { quoteNo?: string; pdfPath?: string; error?: string } | null;
      if (!response.ok || !body?.quoteNo || !body.pdfPath) throw new Error(body?.error ?? "Offerten kunde inte sparas");
      // Designerna hålls kvar, så att filmerna som inte är klara än spelas in fast varukorgen töms.
      setFrozen(designs);
      setSave({ status: "saved", quote: { quoteNo: body.quoteNo, pdfPath: body.pdfPath, noCustomer: "noCustomer" in chosen.body } });
      onSaved();
    } catch (error) {
      setSave({ status: "error", message: error instanceof Error ? error.message : "Offerten kunde inte sparas" });
    }
  };

  /** En ny offert efter en sparad: formuläret börjar om, med samma kund vald. */
  const reset = () => {
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current.clear();
    setFrozen(null);
    setFilms({});
    setMarginPercent(null);
    setProject(reseller?.project ?? "");
    setCustomerPo("");
    setMessage("");
    setClosing("");
    setElements(FIRST_ELEMENTS);
    setKept(null);
    setSave({ status: "idle" });
  };

  return {
    /** Dokumentet som visas. `null` innan det finns något att rita. */
    markup,
    draft,
    target,
    setTarget,
    project,
    setProject,
    customerPo,
    setCustomerPo,
    validUntil,
    setValidUntil,
    elements,
    toggle,
    edit,
    jump,
    /** Designerna som väntar på sina bilder ur 3D-vyn. */
    jobs,
    onShot,
    onFilm,
    capturing,
    /** Filmerna som hör till den sparade offerten och är klara, och hur många som ännu spelas in. */
    savedFilms,
    filmsLeft: filming ? filmsLeft : 0,
    recipient,
    noCustomer,
    minimal,
    blank,
    save,
    submit,
    reset,
    /** Kunden gör offerten själv: uppgifterna kunden fyller i, och om säljarens uppgifter inte gick att hämta. */
    self,
    contact,
    setContact,
    loading: self && active && !seller && !sellerFailed,
    sellerFailed: self && sellerFailed,
  };
}

export type QuoteState = ReturnType<typeof useQuote>;
