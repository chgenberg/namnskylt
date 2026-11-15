"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type Dispatch, type FormEvent } from "react";
import { DeliveryFields } from "@/components/delivery-fields";
import { usePriceList } from "@/components/price-list-provider";
import { ProgressBanner } from "@/components/ui/progress-banner";
import { Segmented } from "@/components/ui/segmented";
import {
  badgeDocumentSchema,
  getMaterial,
  getMounting,
  isPartnerMade,
  priceOrder,
  resellerOrder,
  toOre,
  type BadgeDocument,
  type PricePart,
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
  | { status: "done"; orderNumber: string; shipDate: string }
  | { status: "requested"; requestNumber: string }
  | { status: "error"; message: string };

const sek = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

/** Så länge tar det för beställningsformuläret att veckla ut sig. */
const FORM_OPEN_MS = 380;

const DELIVERY_TO_OPTIONS = (["customer", "reseller"] as const).map((id) => ({ id, label: DELIVERY_TO_LABEL[id] }));

/** Radernas namn i specifikationen per skylt. */
function partLabel(part: PricePart, doc: BadgeDocument): string {
  switch (part) {
    case "sign":
      return `Skylt, ${getMaterial(doc.materialId).name.toLowerCase()}`;
    case "mounting":
      return `Fäste, ${getMounting(doc.mounting).name.toLowerCase()}`;
    case "extraEngraving":
      return "Logga";
    case "customShape":
      return "Egen form";
    case "start":
      return "Startkostnad";
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
}

export function OrderSection({ doc, badges, designs = 1, dispatch, reseller, shop, captureShot }: OrderSectionProps) {
  const [order, setOrder] = useState<OrderState>({ status: "idle" });
  // Återförsäljaren väljer mottagare och har båda adresserna förifyllda; en kund som beställer själv fyller i sin.
  const [deliverTo, setDeliverTo] = useState<DeliveryTo>("customer");
  const [addresses, setAddresses] = useState<DeliveryOptions>(
    () => reseller?.delivery ?? { customer: EMPTY_DELIVERY_DRAFT, reseller: EMPTY_DELIVERY_DRAFT },
  );
  const sectionRef = useRef<HTMLElement>(null);
  const formOpen = order.status === "form" || order.status === "sending";
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
  // Frakten är samma för kunden och återförsäljaren. Återförsäljaren räknar den ur sin inköpslista, en kund får den av servern.
  const shipping = useOrderShipping(badges, reseller?.purchaseList);
  const listPrice = priceOrder(badges, priceList, shipping ?? 0);
  // Butiken visar sina egna priser; servern sparar ordern med samma tal.
  const price = shop?.priceList ? { ...listPrice, ...shopPrice(badges, shop.priceList, priceList, shipping ?? 0) } : listPrice;
  // Specifikationen gäller skylten i editorn, på trappsteget för hela orderns antal.
  const parts = shopPriceParts(doc, price.quantity, shop?.priceList, priceList);
  const mixed = designs > 1;
  const names = badges.length;
  const nextTier = priceList.tiers[price.tierIndex + 1];
  const quickQuantities = [...QUICK_QUANTITIES, (priceList.tiers[1] ?? 100) + 1];
  const priceNote =
    price.minimumTopUpSek > 0
      ? `Minsta ordervärde ${sek.format(priceList.minOrderSek)}`
      : nextTier !== undefined
        ? `Lägre pris från ${nextTier + 1} st`
        : "Lägsta styckpris";
  const valid = badges.every((badge) => badgeDocumentSchema.safeParse(badge).success);
  const partnerMade = isPartnerMade(doc.materialId);

  /** Återförsäljaren: ordern eller offerten läggs på kunden och panelen öppnar den. */
  async function submitForCustomer(context: ResellerOrderContext) {
    const quote = context.mode === "quote";
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
          ...(delivery && { delivery: { to: deliverTo, address: delivery.address } }),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Något gick fel");
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
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer: { name: form.get("name"), email: form.get("email") },
          badges,
          badgeShot: captureShot?.() ?? undefined,
          shop: shop?.slug,
          delivery: delivery.address,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Något gick fel");
      if (body.status === "request") {
        setOrder({ status: "requested", requestNumber: body.orderNumber });
        return;
      }
      setOrder({
        status: "done",
        orderNumber: body.orderNumber,
        shipDate: body.estimatedShipDate,
      });
    } catch (error) {
      setOrder({ status: "error", message: error instanceof Error ? error.message : "Något gick fel" });
    }
  }

  return (
    <section ref={sectionRef} className={styles.order} aria-label="Antal och pris" data-open={formOpen || undefined}>
      <div className={styles.summary}>
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
        <div className={styles.priceBlock}>
          <p className={styles.priceLabel}>
            {mixed
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
      </div>

      <div className={styles.priceRow}>
        <div>
          <p className={styles.priceNote}>exkl. moms · {priceNote}</p>
          {shipping === null ? (
            <p className={styles.priceNote}>Frakt tillkommer.</p>
          ) : (
            shipping > 0 && <p className={styles.priceNote}>Frakt {sek.format(shipping)} ingår i summan.</p>
          )}
          {price.startShareSek > 0 && (
            <p className={styles.priceNote}>Startkostnaden ingår i priset och delas på antalet skyltar.</p>
          )}
        </div>
        {!reseller && (order.status === "idle" || order.status === "error") ? (
          <button
            type="button"
            className="btn btn--primary btn--lg"
            disabled={!valid}
            onClick={() => setOrder({ status: "form" })}
          >
            Beställ
          </button>
        ) : null}
      </div>

      {reseller && <PurchaseSummary badges={badges} reseller={reseller} saleSek={price.totalSek} />}

      {reseller && reseller.mode === "order" && formOpen && (
        <div className={styles.delivery} data-order-form>
          <div className={styles.deliveryHead}>
            <p className={styles.specTitle}>Leverans</p>
            <Segmented label="Skyltarna skickas" value={deliverTo} options={DELIVERY_TO_OPTIONS} onChange={setDeliverTo} />
          </div>
          <DeliveryFields value={address} onChange={setAddress} disabled={order.status === "sending"} />
        </div>
      )}

      {reseller && formError && (
        <p className={styles.issue} data-severity="error" role="alert">
          {formError}
        </p>
      )}

      {reseller && (
        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          disabled={!valid || order.status === "sending"}
          onClick={() =>
            // Ordern behöver en leveransadress: första klicket visar den, andra lägger ordern.
            reseller.mode === "order" && order.status !== "form" ? setOrder({ status: "form" }) : void submitForCustomer(reseller)
          }
        >
          {order.status === "sending"
            ? reseller.mode === "quote"
              ? "Skapar offerten…"
              : "Lägger ordern…"
            : reseller.mode === "quote"
              ? `Skapa offert till ${reseller.customerName}`
              : order.status === "form"
                ? `Lägg ordern · ${sek.format(price.totalSek)} exkl. moms`
                : `Lägg order åt ${reseller.customerName}`}
        </button>
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
            {formError && (
              <p className={styles.issue} data-severity="error" role="alert">
                {formError}
              </p>
            )}
            <button type="submit" className="btn btn--ink btn--block" disabled={order.status === "sending"}>
              {order.status === "sending" ? "Skickar…" : `Skicka order · ${sek.format(price.totalInclVatSek)} inkl. moms`}
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

interface PurchaseSummaryProps {
  badges: readonly BadgeDocument[];
  reseller: ResellerOrderContext;
  saleSek: number;
}

/** Bara för återförsäljaren: vad ordern kostar i inköp enligt prismodellen och vad som blir kvar vid listpris. */
function PurchaseSummary({ badges, reseller, saleSek }: PurchaseSummaryProps) {
  const purchase = resellerOrder(badges, reseller.purchaseList);
  const margin = marginOf(saleSek, purchase.totalSek);
  const quantity = badges.reduce((sum, badge) => sum + badge.quantity, 0);
  return (
    <dl className={styles.purchase} aria-label="Ditt inköp och marginal">
      <div>
        <dt>Ditt inköp</dt>
        <dd>
          {formatSek(purchase.totalSek)}
          {quantity > 1 && <span> · {formatSek(toOre(purchase.goodsSek / quantity))} / st</span>}
          {purchase.shippingSek > 0 && <span className={styles.purchaseNote}>varav frakt {formatSek(purchase.shippingSek)}</span>}
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
      {reseller.mode === "quote" && <p>Kundpriset kan du ändra på offerten innan den skickas.</p>}
    </dl>
  );
}
