"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, type Dispatch, type FormEvent } from "react";
import { ProgressBanner } from "@/components/ui/progress-banner";
import { QUANTITY_TIERS, badgeDocumentSchema, isPartnerMade, priceOrder, type BadgeDocument } from "@/engine";
import type { ResellerOrderContext } from "../reseller";
import type { DesignerAction } from "../state";
import styles from "./sections.module.css";

const QUICK_QUANTITIES = [1, 10, 50, 200] as const;
const ORDER_EXPECTED_MS = 3_000;
const ORDER_STEPS = [
  [0, "Kontrollerar skyltarna…"],
  [35, "Skapar produktionsfilerna…"],
  [70, "Skickar till Skylt & Gravyrteknik…"],
] as const;
const PARTNER_STEPS = [
  [0, "Kontrollerar skyltarna…"],
  [50, "Skickar förfrågan…"],
] as const;

type OrderState =
  | { status: "idle" }
  | { status: "form" }
  | { status: "sending" }
  | { status: "done"; orderNumber: string; shipDate: string; mock: boolean }
  | { status: "requested"; requestNumber: string }
  | { status: "error"; message: string };

const sek = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

interface OrderSectionProps {
  doc: BadgeDocument;
  /** Allt som beställs: `doc` först, sedan skyltarna med samma design. */
  badges: readonly BadgeDocument[];
  dispatch: Dispatch<DesignerAction>;
  reseller?: ResellerOrderContext;
}

export function OrderSection({ doc, badges, dispatch, reseller }: OrderSectionProps) {
  const [order, setOrder] = useState<OrderState>({ status: "idle" });
  const price = priceOrder(badges);
  const names = badges.length;
  const discount = Math.round((1 - price.tier.factor) * 100);
  const nextTier = [...QUANTITY_TIERS].reverse().find((t) => t.minQuantity > price.quantity);
  const valid = badges.every((badge) => badgeDocumentSchema.safeParse(badge).success);
  const partnerMade = isPartnerMade(doc.materialId);

  /** Återförsäljaren: ordern eller offerten läggs på kunden och panelen öppnar den. */
  async function submitForCustomer(context: ResellerOrderContext) {
    setOrder({ status: "sending" });
    const quote = context.mode === "quote";
    try {
      const response = await fetch(quote ? "/api/admin/quotes" : "/api/admin/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerId: context.customerId, badges }),
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
    setOrder({ status: "sending" });
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer: { name: form.get("name"), email: form.get("email") },
          badges,
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
        mock: body.status === "mock",
      });
    } catch (error) {
      setOrder({ status: "error", message: error instanceof Error ? error.message : "Något gick fel" });
    }
  }

  return (
    <section className={styles.order} aria-label="Antal och pris">
      <div className={styles.quantityRow}>
        <div className={`field ${styles.stepper}`}>
          <button type="button" aria-label="Minska antal" onClick={() => dispatch({ type: "quantity", quantity: doc.quantity - 1 })}>
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            aria-label={names > 1 ? "Antal per namn" : "Antal"}
            min={1}
            value={doc.quantity}
            onChange={(e) => dispatch({ type: "quantity", quantity: Number(e.target.value) })}
          />
          <button type="button" aria-label="Öka antal" onClick={() => dispatch({ type: "quantity", quantity: doc.quantity + 1 })}>
            +
          </button>
        </div>
        <div className={styles.chips}>
          {QUICK_QUANTITIES.map((q) => (
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

      <div className={styles.priceRow}>
        <div>
          <p className={styles.priceLabel}>
            {names > 1 && `${names} namn × ${doc.quantity} = ${price.quantity} st · `}
            {sek.format(price.unitSek)} / st{discount > 0 && <span className={styles.discount}>−{discount}%</span>}
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
          <p className={styles.priceNote}>
            exkl. moms · {nextTier ? `Mängdrabatt från ${nextTier.minQuantity} st` : "Högsta mängdrabatt"}
          </p>
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

      {reseller && (
        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          disabled={!valid || order.status === "sending"}
          onClick={() => void submitForCustomer(reseller)}
        >
          {order.status === "sending"
            ? reseller.mode === "quote"
              ? "Skapar offerten…"
              : "Lägger ordern…"
            : reseller.mode === "quote"
              ? `Skapa offert till ${reseller.customerName}`
              : `Lägg order åt ${reseller.customerName}`}
        </button>
      )}

      <AnimatePresence initial={false}>
        {!reseller && (order.status === "form" || order.status === "sending") && (
          <motion.form
            key="form"
            className={styles.orderForm}
            onSubmit={submit}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <label className="field">
              <span className="visually-hidden">Namn</span>
              <input name="name" placeholder="Ditt namn" required autoComplete="name" />
            </label>
            <label className="field">
              <span className="visually-hidden">E-post</span>
              <input name="email" type="email" placeholder="E-post" required autoComplete="email" />
            </label>
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
        steps={partnerMade ? PARTNER_STEPS : ORDER_STEPS}
        doneLabel={partnerMade ? "Förfrågan är skickad" : "Ordern är skickad"}
      />

      {order.status === "done" && (
        <motion.div className={styles.receipt} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} role="status">
          <strong>Order {order.orderNumber} mottagen.</strong> Beräknat skickdatum {order.shipDate}.
          {order.mock && <span className={styles.priceNote}> Testläge — leverantörs-API:t är inte kopplat än.</span>}
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
