"use client";

import { useState, useTransition } from "react";
import { reorderAction } from "./order-actions";
import styles from "./quote-public.module.css";

/**
 * Fler skyltar med samma design, till exempel till ny personal. Kunden skriver
 * namnen och får en offert med priset, som den godkänner i nästa steg.
 */
export function ReorderForm({ token }: { token: string }) {
  const [names, setNames] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const count = names.split("\n").filter((line) => line.trim()).length;

  return (
    <form
      className={styles.reorder}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await reorderAction({ token, names, quantity });
          if (result.ok) window.location.href = result.quotePath;
          else setError(result.error);
        });
      }}
    >
      <label className={styles.label} htmlFor="reorder-names">
        Namn, ett per rad
      </label>
      <textarea
        id="reorder-names"
        className={styles.textarea}
        value={names}
        maxLength={20_000}
        required
        placeholder={"Anna Lind, Säljare\nErik Berg, Tekniker"}
        onChange={(event) => setNames(event.target.value)}
      />
      <p className={styles.hint}>Skriv titeln efter ett komma om skylten har en andra rad.</p>
      <label className={styles.reorderQuantity}>
        <span className={styles.label}>Antal per namn</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={1000}
          value={quantity}
          onChange={(event) => setQuantity(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
        />
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.buttons}>
        <button type="submit" className="btn btn--primary btn--lg" disabled={pending || count === 0}>
          {pending ? "Räknar pris…" : count > 1 ? `Se pris för ${count} namn` : "Se pris och beställ"}
        </button>
      </div>
      <p className={styles.hint}>Du ser priset och godkänner i nästa steg. Inget beställs förrän du har godkänt.</p>
    </form>
  );
}
