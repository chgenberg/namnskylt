"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setExpressShippingAction } from "./dispatch-actions";
import styles from "./admin.module.css";

/**
 * Expressfraktens pris på en order. Verkstaden sätter priset efter storlek och
 * vikt, och tills deras system skickar det själv skriver admin in det här.
 * Summan på ordern räknas om, och kunden ser beloppet på sin ordersida.
 */
export function ExpressPriceField({ orderNo, sek }: { orderNo: string; sek: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(sek === null ? "" : String(sek));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const amount = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(amount) && amount >= 0;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        setError(null);
        startTransition(async () => {
          const result = await setExpressShippingAction(orderNo, amount);
          if (!result.ok) setError(result.error);
          router.refresh();
        });
      }}
    >
      <label>
        <span className="visually-hidden">Expressfraktens pris för {orderNo}, kronor exklusive moms</span>
        <input
          type="text"
          inputMode="numeric"
          size={5}
          value={value}
          placeholder="kr"
          aria-invalid={value.trim() !== "" && !valid}
          onChange={(event) => setValue(event.target.value.replace(/[^\d]/g, ""))}
        />
      </label>{" "}
      <button type="submit" className={styles.ghostButton} disabled={pending || !valid || amount === sek}>
        {pending ? "Sparar…" : "Spara"}
      </button>
      {error && (
        <span className={styles.error} role="alert" style={{ display: "block", whiteSpace: "normal" }}>
          {error}
        </span>
      )}
    </form>
  );
}
