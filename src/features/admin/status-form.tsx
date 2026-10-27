"use client";

import { useState, useTransition } from "react";
import { ORDER_STATUSES, ORDER_STATUS_LABEL, type OrderStatus, type StoredOrder } from "@/lib/orders/model";
import { updateStatusAction } from "./actions";
import styles from "./admin.module.css";

/** Nästa naturliga steg först, så att det vanligaste är ett klick. */
function nextStatus(status: OrderStatus): OrderStatus {
  const flow: OrderStatus[] = ["received", "approved", "in-production", "shipped", "delivered"];
  const index = flow.indexOf(status === "proof-sent" ? "received" : status);
  return flow[Math.min(flow.length - 1, index + 1)] ?? "delivered";
}

export function StatusForm({ order }: { order: StoredOrder }) {
  const [status, setStatus] = useState<OrderStatus>(nextStatus(order.status));
  const [tracking, setTracking] = useState(order.trackingUrl ?? "");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await updateStatusAction({
        orderNo: order.orderNo,
        status,
        note: note.trim() || undefined,
        trackingUrl: tracking.trim(),
      });
      setMessage(result.ok ? { ok: true, text: "Sparat" } : { ok: false, text: result.error });
      if (result.ok) setNote("");
    });
  };

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <label className={styles.formRow}>
        <span className={styles.formLabel}>Ny status</span>
        <select className={styles.select} value={status} onChange={(event) => setStatus(event.target.value as OrderStatus)}>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      {(status === "shipped" || status === "delivered" || order.trackingUrl) && (
        <label className={styles.formRow}>
          <span className={styles.formLabel}>Spårningslänk</span>
          <input
            className={styles.input}
            type="url"
            placeholder="https://tracking.postnord.com/…"
            value={tracking}
            onChange={(event) => setTracking(event.target.value)}
          />
        </label>
      )}
      <label className={styles.formRow}>
        <span className={styles.formLabel}>Anteckning (valfri)</span>
        <input className={styles.input} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
      </label>
      <button type="submit" className="btn btn--primary" disabled={pending}>
        {pending ? "Sparar…" : `Sätt till ”${ORDER_STATUS_LABEL[status]}”`}
      </button>
      {message && (
        <p className={message.ok ? styles.success : styles.error} role="status">
          {message.text}
        </p>
      )}
    </form>
  );
}
