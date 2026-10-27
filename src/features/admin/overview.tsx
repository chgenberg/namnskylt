"use client";

import { useMemo } from "react";
import { priceOrder } from "@/engine";
import { packSheets, productionBatches, sheetUtilization } from "@/lib/production";
import { batchLabel, formatDate, formatSek, METHOD_LABEL } from "./batch-label";
import { ORDER_STATUS_LABEL, type AdminOrder } from "./demo-orders";
import styles from "./admin.module.css";

interface OverviewProps {
  orders: readonly AdminOrder[];
  onOpenBatch: (key: string) => void;
}

export function Overview({ orders, onOpenBatch }: OverviewProps) {
  const queue = useMemo(() => orders.filter((o) => o.status !== "shipped"), [orders]);
  const batches = useMemo(
    () =>
      productionBatches(queue).map((batch) => {
        const packing = packSheets(batch.units, batch.method);
        const utilization =
          packing.sheets.reduce((sum, sheet) => sum + sheetUtilization(sheet), 0) / Math.max(1, packing.sheets.length);
        return { batch, sheets: packing.sheets.length, utilization };
      }),
    [queue],
  );
  const badgeCount = batches.reduce((sum, b) => sum + b.batch.units.length, 0);
  const sheetCount = batches.reduce((sum, b) => sum + b.sheets, 0);
  const revenue = orders.reduce((sum, o) => sum + priceOrder(o.badges).totalSek, 0);

  const stats = [
    { label: "Ordrar i kö", value: String(queue.length) },
    { label: "Skyltar att tillverka", value: String(badgeCount) },
    { label: "Skivor att köra", value: String(sheetCount) },
    { label: "Ordervärde exkl. moms", value: formatSek(revenue) },
  ];

  return (
    <div className={styles.overview}>
      <div className={styles.stats}>
        {stats.map((stat) => (
          <div key={stat.label} className={styles.stat}>
            <span className={styles.statLabel}>{stat.label}</span>
            <span className={`${styles.statValue} mono`}>{stat.value}</span>
          </div>
        ))}
      </div>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Produktionskö</h2>
          <span className={styles.muted}>En batch per material och färg</span>
        </div>
        <ul className={styles.queue}>
          {batches.map(({ batch, sheets, utilization }) => (
            <li key={batch.key} className={styles.queueRow}>
              <div>
                <strong>{batchLabel(batch)}</strong>
                <span className={styles.muted}>{METHOD_LABEL[batch.method]}</span>
              </div>
              <span className="mono">{batch.units.length} st</span>
              <span className="mono">
                {sheets} {sheets === 1 ? "skiva" : "skivor"} · {Math.round(utilization * 100)} %
              </span>
              <button type="button" className="chip" onClick={() => onOpenBatch(batch.key)}>
                Öppna i editorn
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Senaste ordrar</h2>
        </div>
        <ul className={styles.queue}>
          {orders.slice(0, 5).map((order) => (
            <li key={order.orderNo} className={styles.queueRow}>
              <div>
                <strong className="mono">{order.orderNo}</strong>
                <span className={styles.muted}>{order.company ?? order.customer}</span>
              </div>
              <span className="mono">{order.badges.reduce((sum, b) => sum + b.quantity, 0)} st</span>
              <span className={styles.muted}>{formatDate(order.placedAt)}</span>
              <span className={styles.status} data-status={order.status}>
                {ORDER_STATUS_LABEL[order.status]}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
