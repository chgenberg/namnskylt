"use client";

import { Fragment, useState, type FormEvent } from "react";
import { getMaterial, getMounting, priceOrder } from "@/engine";
import { BadgePreview } from "@/components/badge-preview";
import { decodeShareCode } from "@/lib/share/share-link";
import { productionBatches } from "@/lib/production";
import { formatDate, formatSek } from "./batch-label";
import { ORDER_STATUS_LABEL, type AdminOrder } from "./demo-orders";
import styles from "./admin.module.css";

interface OrdersViewProps {
  orders: readonly AdminOrder[];
  onAddOrder: (order: AdminOrder) => void;
  onOpenBatch: (key: string) => void;
}

function unique(values: readonly string[]): string {
  return [...new Set(values)].join(", ");
}

/** Koden ur en delningslänk (`…/skapa?d=1.xxx`) eller koden själv. */
function shareCodeFrom(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.startsWith("1.")) return trimmed;
  try {
    return new URL(trimmed).searchParams.get("d");
  } catch {
    return null;
  }
}

export function OrdersView({ orders, onAddOrder, onOpenBatch }: OrdersViewProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const addFromLink = async (event: FormEvent) => {
    event.preventDefault();
    const doc = await decodeShareCode(shareCodeFrom(link));
    if (!doc) {
      setNote("Länken innehåller ingen giltig skylt.");
      return;
    }
    const orderNo = `NS-T${orders.filter((o) => o.orderNo.startsWith("NS-T")).length + 1}`;
    onAddOrder({
      orderNo,
      customer: "Testorder",
      email: "test@example.se",
      placedAt: new Date().toISOString(),
      status: "new",
      badges: [doc],
    });
    setLink("");
    setOpen(orderNo);
    setNote(`${orderNo} är tillagd och ligger i produktionskön.`);
  };

  return (
    <div className={styles.overview}>
      <form className={styles.linkForm} onSubmit={addFromLink}>
        <label className={styles.muted} htmlFor="share-link">
          Lägg till en testorder från en delningslänk
        </label>
        <div className={styles.linkRow}>
          <div className="field">
            <input
              id="share-link"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://namnskylt.com/skapa?d=1.…"
              autoComplete="off"
            />
          </div>
          <button type="submit" className="btn" disabled={!link.trim()}>
            Lägg till
          </button>
        </div>
        {note && (
          <p className={styles.muted} role="status">
            {note}
          </p>
        )}
      </form>

      <section className={styles.card}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Order</th>
              <th>Kund</th>
              <th>Skyltar</th>
              <th>Material</th>
              <th>Fäste</th>
              <th>Status</th>
              <th className={styles.num}>Belopp</th>
              <th>Lagd</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const expanded = open === order.orderNo;
              return (
                <Fragment key={order.orderNo}>
                  <tr
                    className={styles.row}
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : order.orderNo)}
                  >
                    <td className="mono">{order.orderNo}</td>
                    <td>
                      <strong>{order.company ?? order.customer}</strong>
                      <span className={styles.muted}>{order.company ? order.customer : order.email}</span>
                    </td>
                    <td className="mono">{order.badges.reduce((sum, b) => sum + b.quantity, 0)}</td>
                    <td>{unique(order.badges.map((b) => getMaterial(b.materialId).name))}</td>
                    <td>{unique(order.badges.map((b) => getMounting(b.mounting).name))}</td>
                    <td>
                      <span className={styles.status} data-status={order.status}>
                        {ORDER_STATUS_LABEL[order.status]}
                      </span>
                    </td>
                    <td className={`${styles.num} mono`}>{formatSek(priceOrder(order.badges).totalSek)}</td>
                    <td className={styles.muted}>{formatDate(order.placedAt)}</td>
                  </tr>
                  {expanded && (
                    <tr className={styles.detailRow}>
                      <td colSpan={8}>
                        <div className={styles.thumbs}>
                          {order.badges.map((badge, i) => (
                            <figure key={i} className={styles.thumb}>
                              <BadgePreview doc={badge} />
                              <figcaption className={styles.muted}>
                                {badge.size.widthMm} × {badge.size.heightMm} mm · {badge.quantity} st
                              </figcaption>
                            </figure>
                          ))}
                        </div>
                        <div className={styles.detailActions}>
                          {productionBatches([order]).map((batch) => (
                            <button key={batch.key} type="button" className="chip" onClick={() => onOpenBatch(batch.key)}>
                              Visa på skivan · {getMaterial(batch.materialId).name}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
