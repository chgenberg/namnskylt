"use client";

import { useState, type FormEvent } from "react";
import styles from "@/components/dashboard/dashboard.module.css";
import type { AdminOrder } from "@/features/orders/demo-orders";
import { decodeShareCode } from "@/lib/share/share-link";

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

interface TestOrderFormProps {
  orders: readonly AdminOrder[];
  onAddOrder: (order: AdminOrder) => void;
}

/** Lägger en delad skylt i produktionskön för att provköra ark och filer. */
export function TestOrderForm({ orders, onAddOrder }: TestOrderFormProps) {
  const [link, setLink] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const add = async (event: FormEvent) => {
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
    setNote(`${orderNo} är tillagd och ligger i produktionskön.`);
  };

  return (
    <form className={styles.linkForm} onSubmit={(event) => void add(event)}>
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
  );
}
