"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { useAdminSession } from "@/hooks/use-admin-session";
import { DEMO_ORDERS, type AdminOrder } from "./demo-orders";
import { OrdersView } from "./orders-view";
import { Overview } from "./overview";
import { ProductionEditor } from "./production-editor";
import styles from "./admin.module.css";

type AdminTab = "overview" | "orders" | "production";

const TABS = [
  { id: "overview", label: "Översikt" },
  { id: "orders", label: "Ordrar" },
  { id: "production", label: "Produktionseditor" },
] as const;

export function AdminPage() {
  const { session, ready, login, logout } = useAdminSession();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [orders, setOrders] = useState<readonly AdminOrder[]>(DEMO_ORDERS);
  const [batchKey, setBatchKey] = useState<string | null>(null);

  if (!ready) return <div className={styles.page} />;

  if (!session) {
    return (
      <div className={styles.page}>
        <div className={styles.gate}>
          <p className="eyebrow">Admin</p>
          <h1 className={styles.gateTitle}>Logga in för att se ordrar och produktion</h1>
          <p className={styles.muted}>
            Mockup — inget lösenord. Använd knappen uppe till höger, eller logga in här.
          </p>
          <button type="button" className="btn btn--primary" onClick={login}>
            Logga in
          </button>
        </div>
      </div>
    );
  }

  const openBatch = (key: string) => {
    setBatchKey(key);
    setTab("production");
  };

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div>
          <p className="eyebrow">Admin · mockup</p>
          <h1 className={styles.title}>Namnskylt — produktion</h1>
        </div>
        <div className={styles.tabs}>
          <Segmented label="Vy" value={tab} options={TABS} onChange={setTab} />
          <button type="button" className="btn btn--ghost" onClick={logout}>
            Logga ut
          </button>
        </div>
      </header>

      {tab === "overview" && <Overview orders={orders} onOpenBatch={openBatch} />}
      {tab === "orders" && (
        <OrdersView orders={orders} onAddOrder={(order) => setOrders((all) => [order, ...all])} onOpenBatch={openBatch} />
      )}
      {tab === "production" && <ProductionEditor orders={orders} batchKey={batchKey} onBatchKey={setBatchKey} />}
    </div>
  );
}
