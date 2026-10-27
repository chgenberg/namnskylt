"use client";

import { useMemo } from "react";
import { priceOrder } from "@/engine";
import { packSheets, productionBatches, sheetUtilization } from "@/lib/production";
import styles from "@/components/dashboard/dashboard.module.css";
import type { AdminOrder } from "@/lib/orders/demo-orders";
import { formatSek } from "@/features/orders/format";
import { batchLabel, METHOD_LABEL } from "./batch-label";

interface ProductionQueueProps {
  orders: readonly AdminOrder[];
  onOpenBatch: (key: string) => void;
}

export function ProductionQueue({ orders, onOpenBatch }: ProductionQueueProps) {
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
  const value = queue.reduce((sum, o) => sum + priceOrder(o.badges).totalSek, 0);

  const stats = [
    { label: "Ordrar i kö", value: String(queue.length) },
    { label: "Skyltar att tillverka", value: String(badgeCount) },
    { label: "Skivor att köra", value: String(sheetCount) },
    { label: "Värde i kön exkl. moms", value: formatSek(value) },
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
    </div>
  );
}
