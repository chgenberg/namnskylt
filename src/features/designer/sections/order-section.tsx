"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, type Dispatch, type FormEvent } from "react";
import { QUANTITY_TIERS, badgeDocumentSchema, priceBadge, type BadgeDocument } from "@/engine";
import type { DesignerAction } from "../state";
import styles from "./sections.module.css";

const QUICK_QUANTITIES = [1, 10, 50, 200] as const;

type OrderState =
  | { status: "idle" }
  | { status: "form" }
  | { status: "sending" }
  | { status: "done"; orderNumber: string; shipDate: string; mock: boolean }
  | { status: "error"; message: string };

const sek = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

interface OrderSectionProps {
  doc: BadgeDocument;
  dispatch: Dispatch<DesignerAction>;
}

export function OrderSection({ doc, dispatch }: OrderSectionProps) {
  const [order, setOrder] = useState<OrderState>({ status: "idle" });
  const price = priceBadge(doc);
  const discount = Math.round((1 - price.tier.factor) * 100);
  const nextTier = [...QUANTITY_TIERS].reverse().find((t) => t.minQuantity > price.quantity);
  const valid = badgeDocumentSchema.safeParse(doc).success;

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
          badges: [doc],
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Något gick fel");
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
            aria-label="Antal"
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
        {order.status === "idle" || order.status === "error" ? (
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

      <AnimatePresence initial={false}>
        {(order.status === "form" || order.status === "sending") && (
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

      {order.status === "done" && (
        <motion.div className={styles.receipt} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} role="status">
          <strong>Order {order.orderNumber} mottagen.</strong> Beräknat skickdatum {order.shipDate}.
          {order.mock && <span className={styles.priceNote}> Testläge — leverantörs-API:t är inte kopplat än.</span>}
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
