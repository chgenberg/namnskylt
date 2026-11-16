"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type Dispatch, type FormEvent } from "react";
import { DeliveryFields } from "@/components/delivery-fields";
import { ShippingMethodPicker } from "@/components/shipping-method-picker";
import { usePriceList } from "@/components/price-list-provider";
import { ProgressBanner } from "@/components/ui/progress-banner";
import { Segmented } from "@/components/ui/segmented";
import {
  badgeDocumentSchema,
  getMarkingMethod,
  getMaterial,
  getMounting,
  isPartnerMade,
  markingOf,
  priceOrder,
  resellerOrder,
  toOre,
  VAT_RATE,
  withStartInSign,
  type BadgeDocument,
  type ShippingMethod,
  type ShownPricePart,
} from "@/engine";
import { useOrderShipping } from "@/hooks/use-order-shipping";
import { formatSek } from "@/lib/format";
import {
  addressFromDraft,
  DELIVERY_TO_LABEL,
  EMPTY_DELIVERY_DRAFT,
  type DeliveryDraft,
  type DeliveryOptions,
  type DeliveryTo,
} from "@/lib/orders/delivery";
import { marginOf } from "@/lib/orders/purchase";
import type { CheckoutStep } from "@/lib/designer-stats/model";
import type { CustomerType } from "@/lib/payments/model";
import { shopPrice, shopPriceParts } from "@/lib/shops/price-list";
import type { ResellerOrderContext, ShopContext } from "../reseller";
import type { DesignerAction } from "../state";
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
  | { status: "done"; orderNumber: string; shipDate: string; orderPath: string | null }
  | { status: "requested"; requestNumber: string }
  | { status: "error"; message: string };

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
      return `Fäste, ${getMounting(doc.mounting).name.toLowerCase()}`;
    case "extraEngraving":
      return "Logga";
    case "customShape":
      return "Egen form";
    case "marking":
      return `Märkning, ${getMarkingMethod(markingOf(doc)).name.toLowerCase()}`;
  }
}

interface OrderSectionProps {
  doc: BadgeDocument;
  /** Allt som beställs: skyltarna med designen i editorn och de designer som redan ligger i ordern. */
  badges: readonly BadgeDocument[];
  /** Antal olika designer i ordern. Med fler än en gäller antalet och specifikationen skylten i editorn. */
  designs?: number;
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
  /** Återförsäljarens varukorg. Order och offert görs alltid från den. */
  cart?: ResellerCart;
}

/**
 * Varukorgen när en återförsäljare designar åt en kund. Skylten i editorn
 * läggs i varukorgen med ett klick, och först när den ligger där går det att
 * lägga en order eller skapa en offert. Så ryms flera olika designer i samma
 * order eller offert.
 */
export interface ResellerCart {
  /** Antal designer som ligger i varukorgen. */
  designs: number;
  /** Skylten i editorn är ny och orörd: allt som är designat ligger i varukorgen. */
  pending: boolean;
  /** Varukorgen rymmer fler skyltar. */
  canAdd: boolean;
  onAdd: () => void;
  /** Kastar skylten i editorn och går tillbaka till varukorgen som den är. */
  onDiscard: () => void;
}

const designCount = (count: number) => (count === 1 ? "1 design" : `${count} designer`);

export function OrderSection({
  doc,
  badges,
  designs = 1,
  dispatch,
  reseller,
  shop,
  captureShot,
  cardPayments = false,
  onStep,
  visitId,
  cart,
}: OrderSectionProps) {
  const [order, setOrder] = useState<OrderState>({ status: "idle" });
  /** Det återförsäljaren håller på att skapa, medan det skickas. */
  const [sendingKind, setSendingKind] = useState<"order" | "quote">("order");
  // Återförsäljaren går vidare från varukorgen: allt som är designat ligger där, och skylten i editorn är ny och orörd.
  const checkout = Boolean(reseller && cart?.pending && cart.designs > 0);
  // Ett företag faktureras. En privatperson betalar med kort, där det går.
  const [customerType, setCustomerType] = useState<CustomerType>("company");
  const privateCustomer = cardPayments && !shop && customerType === "private";
  // Återförsäljaren väljer mottagare och har båda adresserna förifyllda; en kund som beställer själv fyller i sin.
  const [deliverTo, setDeliverTo] = useState<DeliveryTo>("customer");
  const [chosenMethod, setMethod] = useState<ShippingMethod>("standard");
  const methods: readonly ShippingMethod[] = shop ? SHOP_METHODS : privateCustomer ? CARD_METHODS : ALL_METHODS;
  // Ett leveranssätt som inte finns för den som beställer faller tillbaka på standardfrakten.
  const method = methods.includes(chosenMethod) ? chosenMethod : "standard";
  const [addresses, setAddresses] = useState<DeliveryOptions>(
    () => reseller?.delivery ?? { customer: EMPTY_DELIVERY_DRAFT, reseller: EMPTY_DELIVERY_DRAFT },
  );
  const sectionRef = useRef<HTMLElement>(null);
  // Återförsäljarens leveranssteg hör till varukorgen: börjar hen på en ny skylt stängs det.
  const formOpen = (order.status === "form" || order.status === "sending") && (!reseller || checkout);
  // Formuläret öppnas under priset. På mobil och låga skärmar ligger det då sist i panelen, långt
  // utanför det som syns. Rullningen väntar tills formuläret har vecklat ut sig: börjar den medan
  // sidan ändrar höjd avbryts den, och den som beställer blir kvar högst upp utan formulär.
  useEffect(() => {
    if (!formOpen) return;
    const timer = window.setTimeout(() => {
      sectionRef.current?.querySelector("[data-order-form]")?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, FORM_OPEN_MS);
    return () => window.clearTimeout(timer);
  }, [formOpen]);
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
  const standardShipping = useOrderShipping(badges, reseller?.purchaseList, Boolean(reseller) || formOpen);
  // Upphämtning har ingen frakt. Expressfrakten sätter verkstaden i efterhand, så den är inte med i summan.
  const shipping = method === "standard" ? standardShipping : 0;
  const checkoutSek = price.totalSek + (shipping ?? 0);
  const checkoutInclVatSek = checkoutSek + Math.round(checkoutSek * VAT_RATE);
  // Specifikationen gäller skylten i editorn, på trappsteget för hela orderns antal.
  const parts = withStartInSign(shopPriceParts(doc, price.quantity, shop?.priceList, priceList));
  const mixed = designs > 1;
  const names = badges.length;
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
  const valid = badges.every((badge) => badgeDocumentSchema.safeParse(badge).success);
  const partnerMade = isPartnerMade(doc.materialId);

  /** Återförsäljaren: ordern eller offerten läggs på kunden och panelen öppnar den. */
  async function submitForCustomer(context: ResellerOrderContext, kind: "order" | "quote") {
    const quote = kind === "quote";
    setSendingKind(kind);
    // En offert får sin leverans på offerten. En order behöver adressen nu.
    const delivery = quote ? null : addressFromDraft(address);
    if (delivery && !delivery.ok) {
      setOrder({ status: "form", message: delivery.error });
      return;
    }
    setOrder({ status: "sending" });
    try {
      const response = await fetch(quote ? "/api/admin/quotes" : "/api/admin/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerId: context.customerId,
          badges,
          badgeShot: captureShot?.() ?? undefined,
          project: context.project,
          ...(delivery && { delivery: { to: deliverTo, address: delivery.address, method } }),
          // En tidigare order som öppnades för ändring: den nya ordern pekar tillbaka på den.
          ...(!quote && context.copy && { copyOf: context.copy.orderNo }),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Något gick fel");
      onStep?.("ordered");
      window.location.href = quote
        ? `/admin/offerter/${encodeURIComponent(body.quoteNo)}`
        : `/admin/ordrar/${encodeURIComponent(body.orderNumber)}`;
    } catch (error) {
      setOrder({ status: "error", message: error instanceof Error ? error.message : "Något gick fel" });
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const delivery = addressFromDraft(address);
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
          acceptedTerms: form.get("acceptedTerms") === "on",
          ...(privateCustomer && { visit: visitId?.() ?? undefined }),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Något gick fel");
      // En privatperson betalar med kort hos Stripe. Ordern läggs när betalningen är klar.
      if (body.status === "payment" && typeof body.url === "string") {
        window.location.href = body.url;
        return;
      }
      onStep?.("ordered");
      if (body.status === "request") {
        setOrder({ status: "requested", requestNumber: body.orderNumber });
        return;
      }
      setOrder({
        status: "done",
        orderNumber: body.orderNumber,
        shipDate: body.estimatedShipDate,
        orderPath: typeof body.customerToken === "string" ? `/order/${body.customerToken}` : null,
      });
    } catch (error) {
      setOrder({ status: "error", message: error instanceof Error ? error.message : "Något gick fel" });
    }
  }

  return (
    <section ref={sectionRef} className={styles.order} aria-label="Antal och pris" data-open={formOpen || undefined}>
      <div className={styles.summary}>
        {/* Antalet gäller skylten i editorn. I varukorgen ändras en design med "Ändra". */}
        {!checkout && (
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
            <div className={styles.chips}>
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
          </div>
        )}
        <div className={styles.priceBlock}>
          <p className={styles.priceLabel}>
            {checkout
              ? `${price.quantity} st · ${mixed ? "i snitt " : ""}`
              : mixed
                ? `${designs} designer · ${price.quantity} st · i snitt `
                : names > 1 && `${names} namn × ${doc.quantity} = ${price.quantity} st · `}
            {sek.format(price.unitSek)} / st
          </p>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p
              key={price.totalSek}
              className={styles.priceTotal}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {sek.format(price.totalSek)}
            </motion.p>
          </AnimatePresence>
        </div>
        {!checkout && (
          <div className={styles.spec}>
            <p className={styles.specTitle}>{mixed ? "Pris för skylten ovan" : "Pris per skylt"}</p>
            <dl>
              {parts.map(({ part, sek: partSek }) => (
                <div key={part}>
                  <dt>{partLabel(part, doc)}</dt>
                  <dd>{sek.format(partSek)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      <div className={styles.priceRow}>
        <div>
          <p className={styles.priceNote}>exkl. moms och frakt</p>
          <p className={styles.priceNote}>{priceNote}</p>
        </div>
        {!reseller && (order.status === "idle" || order.status === "error") ? (
          <button
            type="button"
            className="btn btn--primary btn--lg"
            disabled={!valid}
            onClick={() => {
              setOrder({ status: "form" });
              onStep?.("checkout");
            }}
          >
            Beställ
          </button>
        ) : null}
      </div>

      {reseller && <PurchaseSummary badges={badges} reseller={reseller} saleSek={price.totalSek} />}

      {reseller && cart && !checkout && (
        <>
          {/* Skylten i editorn ligger inte i varukorgen än. Order och offert görs därifrån. */}
          <button type="button" className="btn btn--primary btn--lg btn--block" disabled={!valid || !cart.canAdd} onClick={cart.onAdd}>
            Lägg i varukorgen
          </button>
          {cart.designs > 0 ? (
            <p className={styles.cartNote}>
              {designCount(cart.designs)} ligger redan i varukorgen.{" "}
              <button type="button" className={styles.textButton} onClick={cart.onDiscard}>
                Fortsätt utan den här skylten
              </button>
            </p>
          ) : (
            <p className={styles.cartNote}>Från varukorgen lägger du en order eller skapar en offert, med en eller flera designer.</p>
          )}
        </>
      )}

      {reseller && checkout && (
        <>
          <p className={styles.specTitle}>
            Varukorgen · {designCount(cart?.designs ?? 0)} · {price.quantity} st
          </p>
          {formOpen && (
            <div className={styles.delivery} data-order-form>
              <div className={styles.deliveryHead}>
                <p className={styles.specTitle}>Leverans</p>
                <Segmented label="Skyltarna skickas" value={deliverTo} options={DELIVERY_TO_OPTIONS} onChange={setDeliverTo} />
              </div>
              <DeliveryFields value={address} onChange={setAddress} disabled={order.status === "sending"} />
              <p className={styles.specTitle}>Leveranssätt</p>
              <ShippingMethodPicker value={method} onChange={setMethod} methods={methods} standardSek={standardShipping} disabled={order.status === "sending"} />
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
            <button
              type="button"
              className={`btn btn--lg ${reseller.mode === "quote" ? "btn--primary" : ""}`}
              data-kind="quote"
              disabled={!valid || order.status === "sending"}
              onClick={() => void submitForCustomer(reseller, "quote")}
            >
              {order.status === "sending" && sendingKind === "quote" ? "Skapar offerten…" : "Skapa offert"}
            </button>
            <button
              type="button"
              className={`btn btn--lg ${reseller.mode === "order" ? "btn--primary" : ""}`}
              data-kind="order"
              disabled={!valid || order.status === "sending"}
              onClick={() =>
                // Ordern behöver en leveransadress: första klicket visar den, andra lägger ordern.
                order.status === "form" ? void submitForCustomer(reseller, "order") : setOrder({ status: "form" })
              }
            >
              {order.status === "sending" && sendingKind === "order"
                ? "Lägger ordern…"
                : order.status === "form"
                  ? `Lägg ordern · ${sek.format(checkoutSek)} exkl. moms${method === "express" ? " + frakt" : ""}`
                  : "Lägg order"}
            </button>
          </div>
          <p className={styles.cartNote}>Till {reseller.customerName}. Skriv ett nytt namn i editorn för att lägga till en design till.</p>
        </>
      )}

      <AnimatePresence initial={false}>
        {!reseller && formOpen && (
          <motion.form
            key="form"
            className={styles.orderForm}
            data-order-form
            onSubmit={submit}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            {cardPayments && !shop && (
              <Segmented label="Jag beställer som" value={customerType} options={CUSTOMER_TYPE_OPTIONS} onChange={setCustomerType} />
            )}
            {!privateCustomer && (
              <>
                <label className="field">
                  <span className="visually-hidden">Företagsnamn</span>
                  <input name="company" placeholder="Företagsnamn" required minLength={2} maxLength={120} autoComplete="organization" />
                </label>
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
                // Den som beställer är oftast också mottagaren. Namnet behöver inte skrivas två gånger.
                onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (name && !address.name.trim()) setAddress({ ...address, name });
                }}
              />
            </label>
            <label className="field">
              <span className="visually-hidden">E-post</span>
              <input name="email" type="email" placeholder="E-post" required autoComplete="email" />
            </label>
            <div className={styles.delivery}>
              <p className={styles.specTitle}>Leveransadress</p>
              <DeliveryFields value={address} onChange={setAddress} disabled={order.status === "sending"} />
            </div>
            <div className={styles.delivery}>
              <p className={styles.specTitle}>Leveranssätt</p>
              <ShippingMethodPicker value={method} onChange={setMethod} methods={methods} standardSek={standardShipping} disabled={order.status === "sending"} />
            </div>
            <OrderTotals label="Att betala" quantity={price.quantity} goodsSek={price.totalSek} shippingSek={shipping} method={method} vat />
            <p className={styles.payNote}>
              {privateCustomer
                ? "Du betalar med kort i nästa steg. Ordern läggs när betalningen är klar."
                : "Betalas mot faktura. Vi säljer till företag och verksamheter, så beställningen kräver ett organisationsnummer."}
            </p>
            <label className={styles.consent}>
              <input type="checkbox" name="acceptedTerms" required />
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
          {shop && ` ${shop.name} hör av sig med orderbekräftelse.`}
          {order.orderPath && (
            <>
              {" "}
              <a href={order.orderPath}>Följ din order</a>
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
  reseller: ResellerOrderContext;
  saleSek: number;
}

/**
 * Bara för återförsäljaren: vad skyltarna kostar i inköp enligt prismodellen och vad som blir kvar vid listpris.
 * Alla tre beloppen är utan frakt. Frakten är samma för återförsäljaren och kunden och ändrar inte marginalen.
 */
function PurchaseSummary({ badges, reseller, saleSek }: PurchaseSummaryProps) {
  const purchase = resellerOrder(badges, reseller.purchaseList);
  const margin = marginOf(saleSek, purchase.goodsSek);
  const quantity = badges.reduce((sum, badge) => sum + badge.quantity, 0);
  return (
    <dl className={styles.purchase} aria-label="Ditt inköp och marginal">
      <div>
        <dt>Ditt inköp</dt>
        <dd>
          {formatSek(purchase.goodsSek)}
          {quantity > 1 && <span> · {formatSek(toOre(purchase.goodsSek / quantity))} / st</span>}
        </dd>
      </div>
      <div>
        <dt>Kundpris</dt>
        <dd>{sek.format(saleSek)}</dd>
      </div>
      <div data-tone={margin.sek < 0 ? "bad" : "good"}>
        <dt>Marginal</dt>
        <dd>
          {formatSek(margin.sek)}
          {margin.percent !== null && <span> · {margin.percent} %</span>}
        </dd>
      </div>
      {purchase.shippingSek > 0 && <p>Frakt {formatSek(purchase.shippingSek)} tillkommer, samma för dig och kunden.</p>}
      {reseller.mode === "quote" && <p>Kundpriset kan du ändra på offerten innan den skickas.</p>}
    </dl>
  );
}
