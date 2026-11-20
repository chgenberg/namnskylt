"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent } from "react";
import { DeliveryFields } from "@/components/delivery-fields";
import { ShippingMethodPicker } from "@/components/shipping-method-picker";
import { usePriceList } from "@/components/price-list-provider";
import { ProgressBanner } from "@/components/ui/progress-banner";
import { Segmented } from "@/components/ui/segmented";
import {
  badgeDocumentSchema,
  getMarkingMethod,
  getMaterial,
  isBlankBadge,
  mountingLabel,
  isPartnerMade,
  markingOf,
  priceOrder,
  resellerOrder,
  toOre,
  VAT_RATE,
  withStartInSign,
  type BadgeDocument,
  type PriceTable,
  type ShippingMethod,
  type ShownPricePart,
} from "@/engine";
import { companyLookupNote, useCompanyLookup } from "@/hooks/use-company-lookup";
import { useOrderShipping } from "@/hooks/use-order-shipping";
import { filled, withCompanyAddress, type CompanyHit } from "@/lib/company/lookup-model";
import { accountPaths, type CustomerAccountView } from "@/lib/customer-auth/model";
import { formatSek } from "@/lib/format";
import {
  DELIVERY_TO_LABEL,
  draftFromAddress,
  EMPTY_DELIVERY_DRAFT,
  needsPhone,
  shippingAddressFromDraft,
  type DeliveryDraft,
  type DeliveryOptions,
  type DeliveryTo,
} from "@/lib/orders/delivery";
import { CUSTOMER_PO_MAX } from "@/lib/orders/customer-po";
import { marginOf } from "@/lib/orders/purchase";
import type { CheckoutStep } from "@/lib/designer-stats/model";
import type { CustomerType } from "@/lib/payments/model";
import { designSums, shopPrice, shopPriceParts } from "@/lib/shops/price-list";
import type { ResellerOrderContext, ShopContext } from "../reseller";
import type { DesignerAction } from "../state";
import { contactFor, NewAccountField, type NewAccountChoice } from "./checkout-account";
import { customerOf, firstTarget, recipientOf, ResellerCustomer, type CustomerTarget } from "./reseller-customer";
import styles from "./sections.module.css";

/** Snabbval för antal; det sista är första antalet på nästa trappsteg i prismodellen. */
const QUICK_QUANTITIES = [1, 10, 50] as const;
const ORDER_EXPECTED_MS = 3_000;
const ORDER_STEPS = [
  [0, "Kontrollerar skyltarna…"],
  [35, "Skapar produktionsfilerna…"],
  [70, "Skickar till Skylt & Gravyrteknik…"],
] as const;
const SHOP_STEPS = [
  [0, "Kontrollerar skyltarna…"],
  [35, "Skapar produktionsfilerna…"],
  [70, "Skickar ordern…"],
] as const;
const PARTNER_STEPS = [
  [0, "Kontrollerar skyltarna…"],
  [50, "Skickar förfrågan…"],
] as const;

type OrderState =
  | { status: "idle" }
  | { status: "form"; message?: string }
  | { status: "sending" }
  | {
      status: "done";
      /** Numret kunden ser: verkstadens när de har tagit emot en order de själva säljer, annars vårt. */
      orderNumber: string;
      /** Vårt eget nummer, när kunden ser verkstadens. */
      reference: string | null;
      shipDate: string;
      orderPath: string | null;
      atWorkshop: boolean;
      account: AccountNote;
    }
  | { status: "requested"; requestNumber: string }
  | { status: "error"; message: string };

/**
 * Vad kvittot säger om kundens konto: det skapades med ordern, ordern ligger på kontot kunden var
 * inloggad på, eller e-postadressen hade redan ett konto. `null` = ordern lades utan konto.
 */
type AccountNote = "created" | "signed-in" | "exists" | null;

const sek = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

/** Så länge tar det för beställningsformuläret att veckla ut sig. */
const FORM_OPEN_MS = 380;

const DELIVERY_TO_OPTIONS = (["customer", "reseller"] as const).map((id) => ({ id, label: DELIVERY_TO_LABEL[id] }));
/** Leveranssätten i kassan, samma som i verkstadens egen kassa. */
const ALL_METHODS = ["standard", "express", "pickup"] as const satisfies readonly ShippingMethod[];
/** I en återförsäljares butik visas inte upphämtningen: den pekar ut verkstadens adress för butikens kund. */
const SHOP_METHODS = ["standard", "express"] as const satisfies readonly ShippingMethod[];
/** Med kort betalas allt i förväg. Expressfraktens pris sätts i efterhand och går därför inte att välja. */
const CARD_METHODS = ["standard", "pickup"] as const satisfies readonly ShippingMethod[];
const CUSTOMER_TYPE_OPTIONS = [
  { id: "company", label: "Företag" },
  { id: "private", label: "Privatperson" },
] as const satisfies readonly { id: CustomerType; label: string }[];

/** Radernas namn i specifikationen per skylt. Startkostnaden ligger på skylten och har ingen egen rad. */
function partLabel(part: ShownPricePart, doc: BadgeDocument): string {
  switch (part) {
    case "sign":
      return `Skylt, ${getMaterial(doc.materialId).name.toLowerCase()}`;
    case "mounting":
      return `Fäste, ${mountingLabel(doc).toLowerCase()}`;
    case "extraEngraving":
      return "Logga";
    case "customShape":
      return "Egen form";
    case "marking":
      return `Märkning, ${getMarkingMethod(markingOf(doc)).name.toLowerCase()}`;
  }
}

interface OrderSectionProps {
  /**
   * `price` är delen vid priset i skyltmotorn: antal, pris och knappen som lägger skylten i
   * varukorgen. `checkout` är kassan i varukorgen, som öppnas med symbolen längst upp till höger:
   * där blir det som ligger i varukorgen en order eller en offert (besked av ägaren 2026-11-17).
   */
  mode: "price" | "checkout";
  /** Kassan syns, alltså varukorgen är öppen. Frakten frågas först då. Bara i `checkout`. */
  active?: boolean;
  doc: BadgeDocument;
  /**
   * I `price`: allt som är designat, skyltarna i varukorgen och skylten i editorn, så att priset
   * gäller hela orderns antal. I `checkout`: det som ligger i varukorgen, alltså det som beställs.
   */
  badges: readonly BadgeDocument[];
  /** Antal olika designer i ordern. Med fler än en gäller antalet och specifikationen skylten i editorn. */
  designs?: number;
  /**
   * Så många av `badges`, räknat från slutet, som hör till skylten i editorn (den och dess namn
   * under "Fler namn"). Resten ligger i varukorgen. Vid priset visas bara skylten i editorn.
   */
  own?: number;
  dispatch: Dispatch<DesignerAction>;
  reseller?: ResellerOrderContext;
  shop?: ShopContext;
  /** Stillbild av 3D-skylten till offerten och ordern; `null` när 3D-vyn inte visas. */
  captureShot?: () => string | null;
  /** Privatpersoner kan betala med kort. Bara på namnskylt.com, och bara när kortbetalningen är påslagen. */
  cardPayments?: boolean;
  /** Säger till när kassan öppnas, när ordern skickas och när den är mottagen. */
  onStep?: (step: CheckoutStep) => void;
  /** Besökets id i statistiken. Det följer med till kortbetalningen, så att den betalda ordern räknas till samma besök. */
  visitId?: () => string | null;
  /** Varukorgen. Order och offert görs alltid från den. */
  cart: DesignerCart;
  /** Kundkonton finns här: kassan erbjuder då ett konto åt den som inte är inloggad. */
  accounts?: boolean;
  /** Kunden som är inloggad. Kassan fylls i med kontots uppgifter, och ordern läggs på kontot. */
  account?: CustomerAccountView | null;
  /**
   * Kontot ändrades av en order: det skapades i kassan, eller fick de uppgifter som just fylldes i.
   * `null` när servern svarar att inloggningen inte gäller längre.
   */
  onAccount?: (account: CustomerAccountView | null) => void;
  /** En av kontots tidigare ordrar som den här beställs igen från. */
  repeatOf?: string | null;
}

/**
 * Varukorgen i skyltmotorn. Skylten i editorn läggs i varukorgen med ett
 * klick, och det är varukorgen som blir en order eller en offert. Så ryms
 * flera olika designer i samma order eller offert.
 */
interface DesignerCart {
  /** Antal designer som ligger i varukorgen. */
  designs: number;
  /** Skylten i editorn är ny och orörd: allt som är designat ligger i varukorgen. */
  pending: boolean;
  /** Varukorgen rymmer fler skyltar. */
  canAdd: boolean;
  onAdd: () => void;
  /** Kastar skylten i editorn och går tillbaka till varukorgen som den är. */
  onDiscard: () => void;
  /** Öppnar varukorgen, där kassan ligger. */
  onOpen: () => void;
  /**
   * Öppnar offerten på skyltens plats, med kunden som är vald i varukorgen (beslut av ägaren
   * 2026-11-19: varukorgens knapp öppnar den nya offerten i stället för att mejla en direkt).
   * Vid priset anropas den utan kund: kunden väljs då i offerten. Saknas den finns ingen offertknapp.
   */
  onQuote?: (target?: CustomerTarget) => void;
}

const designCount = (count: number) => (count === 1 ? "1 design" : `${count} designer`);

export function OrderSection({
  mode,
  active = true,
  doc,
  badges,
  designs = 1,
  own = 0,
  dispatch,
  reseller,
  shop,
  captureShot,
  cardPayments = false,
  onStep,
  visitId,
  cart,
  accounts = false,
  account = null,
  onAccount,
  repeatOf = null,
}: OrderSectionProps) {
  const checkout = mode === "checkout";
  // En kund som beställer själv möts av formuläret direkt i varukorgen. Återförsäljaren väljer först order eller offert.
  const [order, setOrder] = useState<OrderState>(() => (mode === "checkout" && !reseller ? { status: "form" } : { status: "idle" }));
  /** Det återförsäljaren håller på att skapa, medan det skickas. */
  // Allt som är designat ligger i varukorgen: skylten i editorn är ny och orörd.
  const inCart = cart.pending && cart.designs > 0;
  // Ett företag faktureras. En privatperson betalar med kort, där det går.
  const [customerType, setCustomerType] = useState<CustomerType>("company");
  const privateCustomer = cardPayments && !shop && customerType === "private";
  // Återförsäljaren väljer mottagare och har båda adresserna förifyllda; en kund som beställer själv fyller i sin.
  const [deliverTo, setDeliverTo] = useState<DeliveryTo>("customer");
  const [chosenMethod, setMethod] = useState<ShippingMethod>("standard");
  const methods: readonly ShippingMethod[] = shop ? SHOP_METHODS : privateCustomer ? CARD_METHODS : ALL_METHODS;
  // Ett leveranssätt som inte finns för den som beställer faller tillbaka på standardfrakten.
  const method = methods.includes(chosenMethod) ? chosenMethod : "standard";
  // En inloggad kund får adressen från sin senaste order.
  const [addresses, setAddresses] = useState<DeliveryOptions>(
    () => reseller?.delivery ?? { customer: draftFromAddress(account?.profile.delivery), reseller: EMPTY_DELIVERY_DRAFT },
  );
  // Säljaren som har gått rakt till skyltmotorn väljer kund i varukorgen: en av de gamla, eller en ny.
  // Från panelen är kunden redan vald.
  const picksCustomer = reseller?.customerId === null;
  const [target, setTarget] = useState<CustomerTarget>(() => firstTarget(reseller?.customers ?? []));
  const [customerError, setCustomerError] = useState<string | null>(null);
  /** Beställarens eget inköpsnummer (besked av ägaren 2026-11-20). Det står på fakturan. */
  const [customerPo, setCustomerPo] = useState("");
  /** Det registret fyllde i senast. Byts numret ersätts det som registret fyllde i, aldrig det som är skrivet för hand. */
  const autofilled = useRef<CompanyHit | null>(null);
  // Företagets namn och adress fylls i ur registret när organisationsnumret är skrivet (besked av
  // ägaren 2026-11-18): hos kunden som beställer själv, och när säljaren lägger upp en ny kund.
  const company = useCompanyLookup((hit) => {
    const before = autofilled.current;
    autofilled.current = hit;
    if (picksCustomer) setTarget((current) => (current.kind === "new" ? { ...current, company: filled(current.company, hit.name, before?.name) } : current));
    else setContact((current) => ({ ...current, company: filled(current.company, hit.name, before?.name) }));
    setAddresses((all) => ({ ...all, customer: withCompanyAddress(all.customer, hit, before) }));
  });
  const companyNote = companyLookupNote(company.status);
  /** Kunden som valdes senast. Ett långsamt svar om en tidigare vald kunds adress ska inte skriva över den. */
  const pickedId = useRef("");
  const pickCustomer = (next: CustomerTarget) => {
    const id = next.kind === "existing" ? next.id : "";
    const switched = next.kind !== target.kind || id !== pickedId.current;
    setTarget(next);
    setCustomerError(null);
    // En ny kunds organisationsnummer slås upp medan det skrivs. En vald kund har redan sina uppgifter.
    company.lookup(next.kind === "new" ? next.orgNumber : "");
    if (!switched) return;
    pickedId.current = id;
    // En annan kund har en annan adress. Den gamla kundens får inte följa med.
    setAddresses((all) => ({ ...all, customer: EMPTY_DELIVERY_DRAFT }));
    if (!id) return;
    // Adressen från kundens senaste order fylls i. Går den inte att hämta skrivs den för hand.
    void fetch(`/api/admin/customers/${encodeURIComponent(id)}/delivery`)
      .then((response) => (response.ok ? (response.json() as Promise<{ delivery?: DeliveryDraft }>) : null))
      .then((body) => {
        const delivery = body?.delivery;
        if (!delivery || pickedId.current !== id) return;
        // Har säljaren redan börjat skriva adressen gäller det som är skrivet.
        setAddresses((all) => (Object.values(all.customer).every((value) => value.trim() === "") ? { ...all, customer: delivery } : all));
      })
      .catch(() => undefined);
  };
  /** En ny kund är oftast också mottagaren: namnet behöver inte skrivas två gånger. */
  const openDelivery = () => {
    if (picksCustomer && target.kind === "new" && !addresses.customer.name.trim()) {
      const company = target.company.trim();
      const name = target.name.trim();
      setAddresses((all) => ({
        ...all,
        customer: { ...all.customer, name: company || name, contactName: company ? name : "", phone: all.customer.phone || target.phone.trim() },
      }));
    }
    setOrder({ status: "form" });
  };
  /** Kunden som ordern eller offerten går till, som den står vid knapparna. */
  const recipient = !reseller
    ? null
    : picksCustomer
      ? recipientOf(target, reseller.customers ?? [])
      : { label: reseller.customerName, email: "", ...(reseller.customerDemo && { demo: true }) };
  const sectionRef = useRef<HTMLElement>(null);
  /** Prisdelen är en tät rad. Antalets snabbval och prisets delar fälls ut på begäran. */
  const [details, setDetails] = useState(false);
  /** Säljaren kom hit för att göra en offert: då är Skapa offert knappen vid priset, och varukorgen ett sidospår. */
  const quoteFirst = !checkout && reseller?.mode === "quote" && Boolean(cart.onQuote);
  // Formulären hör till kassan. Efter ett fel står kundens formulär kvar med det som fyllts i, så att det går att skicka igen.
  const formOpen =
    checkout && badges.length > 0 && (order.status === "form" || order.status === "sending" || (!reseller && order.status === "error"));
  // Återförsäljarens leveranssteg öppnas först när hen väljer att lägga en order, långt ner i
  // varukorgen. Rullningen väntar tills formuläret har vecklat ut sig: börjar den medan panelen
  // ändrar höjd avbryts den. Kundens formulär ligger redan under varukorgens innehåll och ska
  // inte dra bort blicken från det som ligger i varukorgen.
  const scrollToForm = formOpen && Boolean(reseller);
  useEffect(() => {
    if (!scrollToForm) return;
    const timer = window.setTimeout(() => {
      sectionRef.current?.querySelector("[data-order-form]")?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, FORM_OPEN_MS);
    return () => window.clearTimeout(timer);
  }, [scrollToForm]);
  const formError = order.status === "form" && order.message ? order.message : null;
  const address = addresses[deliverTo];
  const setAddress = (draft: DeliveryDraft) => setAddresses((all) => ({ ...all, [deliverTo]: draft }));
  const priceList = usePriceList();
  // Priset bredvid antalet är skyltarna, utan frakt. Frakten hör till kassan och visas först där
  // (besked via ägaren 2026-11-15). Butiken visar sina egna priser; servern sparar ordern med samma tal.
  const listPrice = priceOrder(badges, priceList, 0);
  const price = shop?.priceList ? { ...listPrice, ...shopPrice(badges, shop.priceList, priceList, 0) } : listPrice;
  // Frakten är samma för kunden och återförsäljaren. Återförsäljaren räknar den ur sin inköpslista,
  // en kund får den av servern när kassan öppnas.
  // Admin har ingen inköpslista och frågar servern som en kund, när leveransen ska fyllas i.
  const standardShipping = useOrderShipping(badges, reseller?.purchaseList, Boolean(reseller?.purchaseList) || (formOpen && active));
  // Det kunden har fyllt i om sig själv. Det ligger här och inte i fälten, så att det står kvar
  // när formuläret försvinner en stund, till exempel när varukorgens enda skylt öppnas för ändring.
  // En inloggad kund får sina uppgifter ifyllda.
  const [contact, setContact] = useState(() => contactFor(account));
  /** Den som inte är inloggad kan skapa ett konto med ordern. */
  const [newAccount, setNewAccount] = useState<NewAccountChoice>({ wanted: false, password: "" });
  // Kunden loggade in i varukorgen medan kassan var öppen: kontots uppgifter fylls i då.
  const filledFor = useRef(account?.email ?? null);
  useEffect(() => {
    const email = account?.email ?? null;
    if (filledFor.current === email) return;
    filledFor.current = email;
    if (!account) return;
    setContact((current) => contactFor(account, current));
    const saved = account.profile.delivery;
    if (saved) setAddresses((all) => ({ ...all, customer: draftFromAddress(saved) }));
  }, [account]);
  // Upphämtning har ingen frakt. Expressfrakten sätter verkstaden i efterhand, så den är inte med i summan.
  const shipping = method === "standard" ? standardShipping : 0;
  const checkoutSek = price.totalSek + (shipping ?? 0);
  const checkoutInclVatSek = checkoutSek + Math.round(checkoutSek * VAT_RATE);
  // Specifikationen gäller skylten i editorn, på trappsteget för hela orderns antal.
  const parts = withStartInSign(shopPriceParts(doc, price.quantity, shop?.priceList, priceList));
  // Mängdrabatten: vad samma skylt hade kostat ensam i ordern, mot vad den kostar med orderns antal.
  // Varje skylt till sänker priset per skylt, och det ska synas (besked via ägaren 2026-11-16).
  const partsSek = (items: readonly { sek: number }[]) => items.reduce((total, item) => total + item.sek, 0);
  const aloneSek = partsSek(shopPriceParts(doc, 1, shop?.priceList, priceList));
  const discountSek = price.quantity > 1 ? aloneSek - partsSek(parts) : 0;
  const discountPercent = aloneSek > 0 ? Math.round((discountSek / aloneSek) * 100) : 0;
  const mixed = designs > 1;
  const names = badges.length;
  /**
   * Skylten i editorn för sig (beslut av ägaren 2026-11-18, som valde 10 skyltar och såg
   * "2 designer · 117 st · 15 261 kr" för att varukorgen räknades med): ligger andra designer
   * i varukorgen visas bara den här skyltens antal och summa. Priset per skylt är fortfarande
   * orderns, så mängdrabatten och startkostnaden räknas på allt tillsammans.
   */
  const alone =
    !checkout && !inCart && cart.designs > 0 && own > 0 && own < badges.length
      ? (designSums([badges.slice(0, -own), badges.slice(-own)], shop?.priceList, priceList)[1] ?? null)
      : null;
  const inCartQuantity = alone ? price.quantity - alone.quantity : 0;
  const nextTier = priceList.tiers[price.tierIndex + 1];
  const quickQuantities = [...QUICK_QUANTITIES, (priceList.tiers[1] ?? 100) + 1];
  // Med en startkostnad i priset blir varje skylt billigare för varje skylt som läggs till, inte bara vid nästa trappsteg.
  const priceNote =
    price.minimumTopUpSek > 0
      ? `Minsta ordervärde ${sek.format(priceList.minOrderSek)}`
      : price.startShareSek > 0
        ? "Lägre pris per skylt ju fler du beställer"
        : nextTier !== undefined
          ? `Lägre pris från ${nextTier + 1} st`
          : "Lägsta styckpris";
  /** Skylten i editorn har varken text eller logga. Då går den inte att beställa. */
  const blank = isBlankBadge(doc);
  // Varukorgens skyltar ändras sällan, men kassan ritas om för varje tangenttryckning i editorn.
  const valid = useMemo(() => badges.every((badge) => badgeDocumentSchema.safeParse(badge).success), [badges]);
  // I kassan gäller det varukorgens skyltar, vid priset skylten i editorn.
  const partnerMade = (checkout ? badges : [doc]).some((badge) => isPartnerMade(badge.materialId));
  // Ett konto skapas tillsammans med en order som faktureras. Kortbetalningen lämnar sidan innan ordern finns.
  const offersAccount = accounts && !account && !privateCustomer;

  /** Återförsäljaren: ordern eller offerten läggs på kunden och panelen öppnar den. */
  /** Säljaren lägger ordern åt kunden. Offerter görs i offertvyn, som varukorgens knapp Offert öppnar. */
  async function submitForCustomer(context: ResellerOrderContext) {
    // Kunden är vald i förväg från panelen, eller väljs i varukorgen.
    const chosen = context.customerId
      ? { ok: true as const, body: { customerId: context.customerId } }
      : customerOf(target, context.customers ?? [], context.needsInvoiceDetails ?? false);
    setCustomerError(chosen.ok ? null : chosen.error);
    if (!chosen.ok) return;
    const delivery = shippingAddressFromDraft(address, method);
    if (!delivery.ok) {
      setOrder({ status: "form", message: delivery.error });
      return;
    }
    setOrder({ status: "sending" });
    try {
      const response = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...chosen.body,
          badges,
          badgeShot: captureShot?.() ?? undefined,
          project: context.project,
          ...(customerPo.trim() && { customerPo: customerPo.trim() }),
          delivery: { to: deliverTo, address: delivery.address, method },
          // En tidigare order som öppnades för ändring: den nya ordern pekar tillbaka på den.
          ...(context.copy && { copyOf: context.copy.orderNo }),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Något gick fel");
      onStep?.("ordered");
      window.location.href = `/admin/ordrar/${encodeURIComponent(body.orderNumber)}`;
    } catch (error) {
      setOrder({ status: "error", message: error instanceof Error ? error.message : "Något gick fel" });
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const delivery = shippingAddressFromDraft(address, method);
    if (!delivery.ok) {
      setOrder({ status: "form", message: delivery.error });
      return;
    }
    setOrder({ status: "sending" });
    onStep?.("submitted");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerType: privateCustomer ? "private" : "company",
          customer: {
            name: form.get("name"),
            email: form.get("email"),
            ...(!privateCustomer && { company: form.get("company"), orgNumber: form.get("orgNumber") }),
          },
          badges,
          badgeShot: captureShot?.() ?? undefined,
          shop: shop?.slug,
          delivery: delivery.address,
          shippingMethod: method,
          // Bara ett företag faktureras, och har ett inköpsnummer att se igen på fakturan.
          ...(!privateCustomer && customerPo.trim() && { customerPo: customerPo.trim() }),
          acceptedTerms: form.get("acceptedTerms") === "on",
          ...(privateCustomer && { visit: visitId?.() ?? undefined }),
          ...(offersAccount && newAccount.wanted && { account: { password: newAccount.password } }),
          // Kassan visar kunden som inloggad. Gäller inloggningen inte längre säger servern till före ordern.
          ...(account && { expectsAccount: true }),
          ...(account && repeatOf && { repeatOf }),
        }),
      });
      const body = await response.json();
      // Inloggningen har gått ut eller avslutats i en annan flik. Varukorgen visar det, och det ifyllda står kvar.
      if (!response.ok && body.signedOut) onAccount?.(null);
      if (!response.ok) throw new Error(body.error ?? "Något gick fel");
      // En privatperson betalar med kort hos Stripe. Ordern läggs när betalningen är klar.
      if (body.status === "payment" && typeof body.url === "string") {
        window.location.href = body.url;
        return;
      }
      // Kontot bär nu det som just fylldes i, eller skapades med ordern.
      if (body.account) onAccount?.(body.account as CustomerAccountView);
      onStep?.("ordered");
      if (body.status === "request") {
        setOrder({ status: "requested", requestNumber: body.orderNumber });
        return;
      }
      setOrder({
        status: "done",
        orderNumber: typeof body.supplierOrderNumber === "string" && body.supplierOrderNumber ? body.supplierOrderNumber : body.orderNumber,
        reference: typeof body.supplierOrderNumber === "string" && body.supplierOrderNumber ? body.orderNumber : null,
        shipDate: body.estimatedShipDate,
        orderPath: typeof body.customerToken === "string" ? `/order/${body.customerToken}` : null,
        // Bara en order som verkstaden har tagit emot får deras bekräftelse.
        atWorkshop: body.status === "received",
        account: body.accountStatus === "created" || body.accountStatus === "exists" ? body.accountStatus : body.account ? "signed-in" : null,
      });
    } catch (error) {
      setOrder({ status: "error", message: error instanceof Error ? error.message : "Något gick fel" });
    }
  }

  return (
    <section
      ref={sectionRef}
      className={checkout ? styles.checkout : styles.order}
      aria-label={checkout ? "Kassa" : "Antal och pris"}
      data-details={details ? "open" : undefined}
      data-quote-first={quoteFirst || undefined}
    >
      {!checkout && (
      <>
      <div className={styles.summary}>
        {/* Antalet gäller skylten i editorn. I varukorgen ändras en design med "Ändra". */}
        {!inCart && (
          <div className={styles.quantityRow}>
            <div className={`field ${styles.stepper}`}>
              <button type="button" aria-label="Minska antal" onClick={() => dispatch({ type: "quantity", quantity: doc.quantity - 1 })}>
                −
              </button>
              <input
                type="number"
                inputMode="numeric"
                aria-label={names > 1 || mixed ? "Antal per namn" : "Antal"}
                min={1}
                value={doc.quantity}
                onChange={(e) => dispatch({ type: "quantity", quantity: Number(e.target.value) })}
              />
              <button type="button" aria-label="Öka antal" onClick={() => dispatch({ type: "quantity", quantity: doc.quantity + 1 })}>
                +
              </button>
            </div>
          </div>
        )}
        <div className={styles.priceBlock}>
          <p className={styles.priceLabel}>
            {alone
              ? `${own > 1 ? `${own} namn × ${doc.quantity} = ` : ""}${alone.quantity} st · ${sek.format(Math.round(alone.sek / alone.quantity))} / st`
              : `${
                  inCart
                    ? `${price.quantity} st · ${mixed ? "i snitt " : ""}`
                    : mixed
                      ? `${designs} designer · ${price.quantity} st · i snitt `
                      : names > 1
                        ? `${names} namn × ${doc.quantity} = ${price.quantity} st · `
                        : ""
                }${sek.format(price.unitSek)} / st`}
          </p>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p
              key={alone ? alone.sek : price.totalSek}
              className={styles.priceTotal}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {sek.format(alone ? alone.sek : price.totalSek)}
            </motion.p>
          </AnimatePresence>
        </div>
        {!inCart && (
          // Snabbvalen för antal ligger under Prisdetaljer, bredvid prisets delar: de visar hur priset sjunker.
          <div className={`${styles.chips} ${styles.quick}`}>
            {quickQuantities.map((q) => (
              <button
                key={q}
                type="button"
                className="chip"
                aria-pressed={doc.quantity === q}
                onClick={() => dispatch({ type: "quantity", quantity: q })}
              >
                {q} st
              </button>
            ))}
          </div>
        )}
        {!inCart && (
          <div className={styles.spec}>
            <p className={styles.specTitle}>Pris per skylt</p>
            <dl>
              {parts.map(({ part, sek: partSek }) => (
                <div key={part}>
                  <dt>{partLabel(part, doc)}</dt>
                  <dd>{sek.format(partSek)}</dd>
                </div>
              ))}
            </dl>
            {discountSek > 0 && discountPercent > 0 && (
              // En rad, så att sammanfattningen inte tar plats från valen ovanför (besked via ägaren 2026-11-16).
              <p
                className={styles.specDiscount}
                title={`${sek.format(discountSek)} lägre per skylt än vid 1 st (${sek.format(aloneSek)})`}
              >
                <span>Mängdrabatt</span>
                <span className={styles.specDiscountValue}>
                  −{sek.format(discountSek)} ({discountPercent} %)
                </span>
              </p>
            )}
          </div>
        )}
      </div>

      <div className={styles.priceRow}>
        {/* En rad: att priset sjunker med antalet säger mängdrabatten redan, när den visas. */}
        <p className={styles.priceNote}>
          exkl. moms och frakt
          {(discountSek <= 0 || price.minimumTopUpSek > 0) && ` · ${priceNote}`}
        </p>
      </div>

      {reseller?.purchaseList && (
        <PurchaseSummary badges={badges} mode={reseller.mode} purchaseList={reseller.purchaseList} saleSek={price.totalSek} whole={Boolean(alone)} />
      )}

      {inCart ? (
        <>
          {/* Allt som är designat ligger i varukorgen. Därifrån skickas ordern eller offerten. */}
          <p className={styles.specTitle}>
            I varukorgen · {designCount(cart.designs)} · {price.quantity} st
          </p>
          {quoteFirst ? (
            <>
              <button type="button" className="btn btn--primary btn--block" data-quote-button onClick={() => cart.onQuote?.()}>
                Skapa offert
              </button>
              <button type="button" className={styles.cartLink} onClick={cart.onOpen}>
                Öppna varukorgen
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--primary btn--block" onClick={cart.onOpen}>
              Öppna varukorgen
            </button>
          )}
          <p className={styles.cartNote}>Skriv ett nytt namn i editorn för att lägga till en design till.</p>
        </>
      ) : (
        <>
          {quoteFirst ? (
            <>
              {/*
                Säljaren kom hit för att göra en offert (panelens Skapa offert): då är offerten nästa steg, rakt
                från skylten. Varukorgen behövs bara för den som vill ha flera olika skyltar i samma offert.
              */}
              <button type="button" className="btn btn--primary btn--block" data-quote-button disabled={!valid} onClick={() => cart.onQuote?.()}>
                Skapa offert
              </button>
              <button type="button" className={styles.cartLink} disabled={!valid || !cart.canAdd} onClick={cart.onAdd}>
                Lägg i varukorgen
              </button>
            </>
          ) : (
            // Skylten i editorn ligger inte i varukorgen än. Order och offert görs därifrån.
            <button type="button" className="btn btn--primary btn--block" disabled={!valid || !cart.canAdd} onClick={cart.onAdd}>
              Lägg i varukorgen
            </button>
          )}
          {!cart.canAdd && <p className={styles.cartNote}>Varukorgen är full. Lägg resten i en ny order.</p>}
          {/* En skylt ska ha text eller logga. Är den helt tom är knappen avstängd, och skälet sägs här. */}
          {blank && (
            <p className={styles.cartNote} data-missing-text>
              {quoteFirst
                ? "Skylten är tom. Skriv ett namn eller lägg in en logga, så går offerten att skapa."
                : "Skylten är tom. Skriv ett namn eller lägg in en logga, så går den att lägga i varukorgen."}
            </p>
          )}
          {cart.designs > 0 && (
            <p className={styles.cartNote}>
              {designCount(cart.designs)}
              {alone ? ` (${inCartQuantity} st) ligger redan i varukorgen och räknas med i mängdrabatten.` : " ligger redan i varukorgen."}{" "}
              <button type="button" className={styles.textButton} onClick={cart.onDiscard}>
                Fortsätt utan den här skylten
              </button>
            </p>
          )}
        </>
      )}
      {/* Prisdelen är en tät rad: antalets snabbval och prisets delar fälls ut här. */}
      {!inCart && (
        <button type="button" className={styles.detailsToggle} aria-expanded={details} onClick={() => setDetails((open) => !open)}>
          {details ? "Dölj prisdetaljer" : "Prisdetaljer"}
        </button>
      )}
      </>
      )}

      {checkout && reseller?.purchaseList && badges.length > 0 && (
        <PurchaseSummary badges={badges} mode={reseller.mode} purchaseList={reseller.purchaseList} saleSek={price.totalSek} />
      )}

      {reseller && checkout && badges.length > 0 && (
        <>
          {picksCustomer && (
            <ResellerCustomer
              customers={reseller.customers ?? []}
              value={target}
              onChange={pickCustomer}
              needsInvoiceDetails={reseller.needsInvoiceDetails ?? false}
              disabled={order.status === "sending"}
              note={companyNote}
            />
          )}
          {customerError && (
            <p className={styles.issue} data-severity="error" role="alert">
              {customerError}
            </p>
          )}
          {formOpen && (
            <div className={styles.delivery} data-order-form>
              <div className={styles.deliveryHead}>
                <p className={styles.specTitle}>Leverans</p>
                <Segmented label="Skyltarna skickas" value={deliverTo} options={DELIVERY_TO_OPTIONS} onChange={setDeliverTo} />
              </div>
              <DeliveryFields value={address} onChange={setAddress} disabled={order.status === "sending"} phoneRequired={needsPhone(method)} />
              <p className={styles.specTitle}>Leveranssätt</p>
              <ShippingMethodPicker value={method} onChange={setMethod} methods={methods} standardSek={standardShipping} disabled={order.status === "sending"} />
              {/* Hos en återförsäljare är det återförsäljarens eget nummer: verkstaden fakturerar återförsäljaren. */}
              <label className="field">
                <span className="visually-hidden">Inköpsnummer</span>
                <input
                  type="text"
                  maxLength={CUSTOMER_PO_MAX}
                  autoComplete="off"
                  placeholder={reseller?.needsInvoiceDetails ? "Kundens inköpsnummer (valfritt)" : "Ert inköpsnummer (valfritt)"}
                  value={customerPo}
                  disabled={order.status === "sending"}
                  onChange={(event) => setCustomerPo(event.target.value)}
                  data-customer-po
                />
              </label>
              <OrderTotals label="Kundens pris" quantity={price.quantity} goodsSek={price.totalSek} shippingSek={shipping} method={method} vat={false} />
            </div>
          )}
          {formError && (
            <p className={styles.issue} data-severity="error" role="alert">
              {formError}
            </p>
          )}
          {/* Sättet återförsäljaren kom in på (ny order eller ny offert) avgör vilken knapp som är framhävd. */}
          <div className={styles.cartCheckout} data-primary={reseller.mode}>
            {/* Offerten visas på skyltens plats, där den ändras och sparas som PDF. Inget mejlas härifrån. */}
            {cart.onQuote && (
              <button
                type="button"
                className={`btn ${reseller.mode === "quote" ? "btn--primary" : ""}`}
                data-kind="quote"
                disabled={!valid || order.status === "sending"}
                onClick={() => cart.onQuote?.(target)}
              >
                Offert
              </button>
            )}
            <button
              type="button"
              className={`btn ${reseller.mode === "order" ? "btn--primary" : ""}`}
              data-kind="order"
              disabled={!valid || order.status === "sending"}
              onClick={() =>
                // Ordern behöver en leveransadress: första klicket visar den, andra lägger ordern.
                order.status === "form" ? void submitForCustomer(reseller) : openDelivery()
              }
            >
              {order.status === "sending"
                ? "Lägger ordern…"
                : order.status === "form"
                  ? `Lägg ordern · ${sek.format(checkoutSek)} exkl. moms${method === "express" ? " + frakt" : ""}`
                  : "Lägg order"}
            </button>
          </div>
          {/* Vem ordern läggs åt står alltid vid knapparna. Offerten visas först, och kunden går att byta där. */}
          <p className={styles.cartNote} data-recipient>
            {recipient ? (
              <>
                Till <strong>{recipient.label}</strong>
                {recipient.email && `, ${recipient.email}`}.{" "}
              </>
            ) : (
              "Ingen kund är vald än. "
            )}
            {!recipient?.demo && cart.onQuote && "Offert visar offerten, som du sparar som PDF och skickar själv."}
          </p>
          {/* En demokund: säljaren ska veta före klicket att inget mejlas och inget skickas till verkstaden. */}
          {recipient?.demo && (
            <p className={styles.demoNote} role="status" data-demo-customer>
              Det här är en demokund. Det som görs åt den blir demo: en order skickas inte till tillverkningen. Välj en
              annan kund, eller Ny kund, för en riktig order.
            </p>
          )}
        </>
      )}

      <AnimatePresence initial={false}>
        {!reseller && formOpen && (
          <motion.form
            key="form"
            className={styles.orderForm}
            data-order-form
            onSubmit={submit}
            // Kassan räknas som öppnad i statistiken när kunden börjar fylla i den. Varukorgen öppnas
            // av sig själv när en skylt läggs dit, så att bara se den är inget steg.
            onFocusCapture={() => onStep?.("checkout")}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <p className={styles.specTitle}>Beställare</p>
            {cardPayments && !shop && (
              <Segmented label="Jag beställer som" value={customerType} options={CUSTOMER_TYPE_OPTIONS} onChange={setCustomerType} />
            )}
            {!privateCustomer && (
              <>
                {/* Organisationsnumret står först: företagets namn och adress fylls i av det. */}
                <label className="field">
                  <span className="visually-hidden">Organisationsnummer</span>
                  <input
                    name="orgNumber"
                    placeholder="Organisationsnummer"
                    required
                    inputMode="numeric"
                    maxLength={20}
                    pattern="\d{6}[\s\-]?\d{4}"
                    title="Tio siffror, till exempel 556123-4567"
                    value={contact.orgNumber}
                    onChange={(event) => {
                      setContact({ ...contact, orgNumber: event.target.value });
                      company.lookup(event.target.value);
                    }}
                  />
                </label>
                {companyNote && (
                  <p className={styles.cartNote} role="status">
                    {companyNote}
                  </p>
                )}
                <label className="field">
                  <span className="visually-hidden">Företagsnamn</span>
                  <input
                    name="company"
                    placeholder="Företagsnamn"
                    required
                    minLength={2}
                    maxLength={120}
                    autoComplete="organization"
                    value={contact.company}
                    onChange={(event) => setContact({ ...contact, company: event.target.value })}
                  />
                </label>
              </>
            )}
            <label className="field">
              <span className="visually-hidden">Namn</span>
              <input
                name="name"
                placeholder="Ditt namn"
                required
                autoComplete="name"
                value={contact.name}
                onChange={(event) => setContact({ ...contact, name: event.target.value })}
                // Den som beställer är oftast också mottagaren. Namnet behöver inte skrivas två gånger.
                onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (name && !address.name.trim()) setAddress({ ...address, name });
                }}
              />
            </label>
            <label className="field">
              <span className="visually-hidden">E-post</span>
              <input
                name="email"
                type="email"
                placeholder="E-post"
                required
                autoComplete="email"
                value={contact.email}
                onChange={(event) => setContact({ ...contact, email: event.target.value })}
              />
            </label>
            {/* Kundens eget inköpsnummer, som står på fakturan. En privatperson betalar med kort och har inget. */}
            {!privateCustomer && (
              <label className="field">
                <span className="visually-hidden">Ert inköpsnummer</span>
                <input
                  name="customerPo"
                  type="text"
                  maxLength={CUSTOMER_PO_MAX}
                  autoComplete="off"
                  placeholder="Ert inköpsnummer (valfritt)"
                  value={customerPo}
                  onChange={(event) => setCustomerPo(event.target.value)}
                  data-customer-po
                />
              </label>
            )}
            {offersAccount && <NewAccountField value={newAccount} onChange={setNewAccount} disabled={order.status === "sending"} />}
            <div className={styles.delivery}>
              <p className={styles.specTitle}>Leveransadress</p>
              <DeliveryFields value={address} onChange={setAddress} disabled={order.status === "sending"} phoneRequired={needsPhone(method)} />
            </div>
            <div className={styles.delivery}>
              <p className={styles.specTitle}>Leveranssätt</p>
              <ShippingMethodPicker value={method} onChange={setMethod} methods={methods} standardSek={standardShipping} disabled={order.status === "sending"} />
            </div>
            <OrderTotals label="Att betala" quantity={price.quantity} goodsSek={price.totalSek} shippingSek={shipping} method={method} vat />
            <p className={styles.payNote}>
              {privateCustomer
                ? "Du betalar med kort i nästa steg. Ordern läggs när betalningen är klar."
                : shop && !shop.direct
                  ? "Betalas mot faktura. Vi säljer till företag och verksamheter, så beställningen kräver ett organisationsnummer."
                  : "Betalas mot faktura från Skylt & Gravyrteknik, som tillverkar och levererar skyltarna. Beställningen kräver ett organisationsnummer."}
            </p>
            <label className={styles.consent}>
              <input
                type="checkbox"
                name="acceptedTerms"
                required
                checked={contact.terms}
                onChange={(event) => setContact({ ...contact, terms: event.target.checked })}
              />
              <span>
                Jag godkänner{" "}
                <a href={shop ? `/butik/${shop.slug}/villkor` : "/villkor"} target="_blank" rel="noreferrer">
                  köpvillkoren
                </a>
              </span>
            </label>
            {formError && (
              <p className={styles.issue} data-severity="error" role="alert">
                {formError}
              </p>
            )}
            <button type="submit" className="btn btn--ink btn--block" disabled={order.status === "sending"}>
              {order.status === "sending"
                ? "Skickar…"
                : shipping === null || method === "express"
                  ? "Skicka order"
                  : `${privateCustomer ? "Gå till betalning" : "Skicka order"} · ${sek.format(checkoutInclVatSek)} inkl. moms`}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {checkout && (
      <>
      <ProgressBanner
        active={order.status === "sending" && !reseller}
        failed={order.status === "error"}
        title={partnerMade ? "Skickar förfrågan" : "Skickar ordern"}
        expectedMs={ORDER_EXPECTED_MS}
        steps={partnerMade ? PARTNER_STEPS : shop ? SHOP_STEPS : ORDER_STEPS}
        doneLabel={partnerMade ? "Förfrågan är skickad" : "Ordern är skickad"}
      />

      {order.status === "done" && (
        <motion.div className={styles.receipt} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} role="status">
          <strong>Order {order.orderNumber} mottagen.</strong> Beräknat skickdatum {order.shipDate}.
          {order.reference && ` Referens ${order.reference}.`}
          {/* En återförsäljares butik bekräftar själv. Annars sköter verkstaden ordern mot kunden. */}
          {shop && !shop.direct
            ? ` ${shop.name} hör av sig med orderbekräftelse.`
            : order.atWorkshop && !reseller && !privateCustomer && !partnerMade && " Orderbekräftelsen kommer från Skylt & Gravyrteknik."}
          {order.account === "created" && " Ditt konto är skapat, och du är inloggad."}
          {order.account === "exists" && " Det fanns redan ett konto med e-postadressen, så inget nytt skapades."}
          {order.orderPath && (
            <>
              {" "}
              <a href={order.orderPath}>Följ din order</a>
            </>
          )}
          {(order.account === "created" || order.account === "signed-in") && (
            <>
              {" · "}
              <a href={accountPaths(shop?.slug ?? null).home}>Mitt konto</a>
            </>
          )}
        </motion.div>
      )}
      {order.status === "requested" && (
        <motion.div className={styles.receipt} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} role="status">
          <strong>Förfrågan {order.requestNumber} mottagen.</strong> Vi återkommer via e-post med slutpris och
          leveranstid.
        </motion.div>
      )}
      {order.status === "error" && (
        <p className={styles.issue} data-severity="error" role="alert">
          {order.message}
        </p>
      )}
      </>
      )}
    </section>
  );
}

interface OrderTotalsProps {
  /** Rubriken över raderna. */
  label: string;
  quantity: number;
  /** Skyltarna, med påslaget upp till minsta ordervärde. */
  goodsSek: number;
  /** Orderns frakt; `null` när den inte är känd än. */
  shippingSek: number | null;
  method: ShippingMethod;
  /** Kunden som beställer själv ser momsen och summan med moms. */
  vat: boolean;
}

/** Kassans summering: skyltarna för sig, frakten för sig och summan. Frakten visas först här, aldrig i priset per skylt. */
function OrderTotals({ label, quantity, goodsSek, shippingSek, method, vat }: OrderTotalsProps) {
  // Expressfrakten sätter verkstaden i efterhand: summan här är utan den.
  const known = shippingSek !== null && method !== "express";
  const totalSek = goodsSek + (shippingSek ?? 0);
  const vatSek = Math.round(totalSek * VAT_RATE);
  return (
    <div className={styles.totals}>
      <p className={styles.specTitle}>{label}</p>
      <dl>
        <div>
          <dt>Skyltar, {quantity} st</dt>
          <dd>{sek.format(goodsSek)}</dd>
        </div>
        <div>
          <dt>{method === "pickup" ? "Frakt, hämtas i Högsbo" : method === "express" ? "Frakt, PostNord Express" : "Frakt"}</dt>
          <dd>{known ? sek.format(shippingSek ?? 0) : "tillkommer"}</dd>
        </div>
        {vat && (
          <div>
            <dt>Moms</dt>
            <dd>{sek.format(vatSek)}</dd>
          </div>
        )}
        <div data-total>
          <dt>{vat ? "Summa inkl. moms" : "Summa exkl. moms"}</dt>
          <dd>
            {sek.format(vat ? totalSek + vatSek : totalSek)}
            {!known && " + frakt"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

interface PurchaseSummaryProps {
  badges: readonly BadgeDocument[];
  /** Återförsäljarens inköpspriser. Finns bara för en inloggad återförsäljare. */
  purchaseList: PriceTable;
  mode: ResellerOrderContext["mode"];
  saleSek: number;
  /** Siffrorna gäller hela ordern, medan priset ovanför gäller skylten i editorn. */
  whole?: boolean;
}

/**
 * Bara för en inloggad återförsäljare: vad skyltarna kostar i inköp enligt prismodellen och vad som blir kvar vid
 * listpris. Alla andra, också admin, ser bara slutkundens pris (besked av ägaren 2026-11-18).
 * Alla tre beloppen är utan frakt. Frakten är samma för återförsäljaren och kunden och ändrar inte marginalen.
 */
function PurchaseSummary({ badges, purchaseList, mode, saleSek, whole = false }: PurchaseSummaryProps) {
  const purchase = resellerOrder(badges, purchaseList);
  const margin = marginOf(saleSek, purchase.goodsSek);
  const quantity = badges.reduce((sum, badge) => sum + badge.quantity, 0);
  return (
    <dl className={styles.purchase} aria-label="Ditt inköp och marginal">
      <div>
        <dt>{whole ? "Ditt inköp, hela ordern" : "Ditt inköp"}</dt>
        <dd>
          {formatSek(purchase.goodsSek)}
          {quantity > 1 && <span> · {formatSek(toOre(purchase.goodsSek / quantity))}/st</span>}
        </dd>
      </div>
      <div>
        <dt>{whole ? "Kundpris, hela ordern" : "Kundpris"}</dt>
        <dd>{sek.format(saleSek)}</dd>
      </div>
      <div data-tone={margin.sek < 0 ? "bad" : "good"}>
        <dt>Marginal</dt>
        <dd>
          {formatSek(margin.sek)}
          {margin.percent !== null && <span> · {margin.percent} %</span>}
        </dd>
      </div>
      {(purchase.shippingSek > 0 || mode === "quote") && (
        // Kort hållet för att rymmas på en rad. Frakten är samma för återförsäljaren och kunden.
        <p title={purchase.shippingSek > 0 ? "Frakten är samma för dig och kunden." : undefined}>
          {purchase.shippingSek > 0 && `Frakt ${formatSek(purchase.shippingSek)} tillkommer. `}
          {mode === "quote" && "Kundpriset kan ändras på offerten."}
        </p>
      )}
    </dl>
  );
}
