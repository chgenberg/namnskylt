"use client";

import { useState } from "react";
import styles from "@/components/dashboard/dashboard.module.css";
import { Segmented } from "@/components/ui/segmented";
import { DEMO_ORDERS, type AdminOrder } from "@/features/orders/demo-orders";
import { ProductionEditor } from "./production-editor";
import { ProductionQueue } from "./production-queue";
import { TestOrderForm } from "./test-order-form";

type ProductionTab = "queue" | "editor";

const TABS = [
  { id: "queue", label: "Kö" },
  { id: "editor", label: "Produktionseditor" },
] as const;

export function ProductionPage() {
  const [tab, setTab] = useState<ProductionTab>("queue");
  const [orders, setOrders] = useState<readonly AdminOrder[]>(DEMO_ORDERS);
  const [batchKey, setBatchKey] = useState<string | null>(null);

  const openBatch = (key: string) => {
    setBatchKey(key);
    setTab("editor");
  };

  const logout = async () => {
    await fetch("/api/production/session", { method: "DELETE" }).catch(() => undefined);
    window.location.reload();
  };

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div>
          <p className="eyebrow">Verkstad · Skylt &amp; Gravyrteknik</p>
          <h1 className={styles.title}>Produktion</h1>
        </div>
        <div className={styles.tabs}>
          <Segmented label="Vy" value={tab} options={TABS} onChange={setTab} />
          <button type="button" className="btn btn--ghost" onClick={() => void logout()}>
            Logga ut
          </button>
        </div>
      </header>

      {tab === "queue" && (
        <>
          <ProductionQueue orders={orders} onOpenBatch={openBatch} />
          <TestOrderForm orders={orders} onAddOrder={(order) => setOrders((all) => [order, ...all])} />
        </>
      )}
      {tab === "editor" && <ProductionEditor orders={orders} batchKey={batchKey} onBatchKey={setBatchKey} />}
    </div>
  );
}
