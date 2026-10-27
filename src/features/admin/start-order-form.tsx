"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { startOrderAction } from "./actions";
import styles from "./admin.module.css";

export interface CustomerOption {
  id: string;
  label: string;
  detail: string;
}

interface StartOrderFormProps {
  customers: readonly CustomerOption[];
  preselected?: string;
  /** Offert: samma flöde, men skyltmotorn sparar en offert i stället för att lägga en order. */
  mode?: "order" | "quote";
}

/** Steg 1: vem ordern gäller. Steg 2 är samma designer som kunderna använder. */
export function StartOrderForm({ customers, preselected, mode: kind = "order" }: StartOrderFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"existing" | "new">(customers.length > 0 ? "existing" : "new");
  const [query, setQuery] = useState("");
  const [customerId, setCustomerId] = useState(preselected ?? "");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? customers.filter((c) => `${c.label} ${c.detail}`.toLowerCase().includes(q)) : customers;
  }, [customers, query]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const input =
      mode === "existing"
        ? { customerId, text, mode: kind }
        : {
            name: String(form.get("name") ?? ""),
            email: String(form.get("email") ?? ""),
            company: String(form.get("company") ?? "") || undefined,
            phone: String(form.get("phone") ?? "") || undefined,
            orgNumber: String(form.get("orgNumber") ?? "") || undefined,
            address: String(form.get("address") ?? "") || undefined,
            text,
            mode: kind,
          };
    if (mode === "existing" && !customerId) {
      setError("Välj en kund");
      return;
    }
    if (!text.trim()) {
      setError("Skriv namn och titel för första skylten");
      return;
    }
    startTransition(async () => {
      const result = await startOrderAction(input);
      if (!result.ok || !result.url) {
        setError(result.ok ? "Något gick fel" : result.error);
        return;
      }
      router.push(result.url);
    });
  };

  return (
    <form className={`${styles.panel} ${styles.startOrder}`} onSubmit={submit}>
      <div className={styles.stepHead}>
        <span className={styles.stepNo}>1</span>
        <h2 className={styles.sectionTitle}>{kind === "quote" ? "Vem är offerten till?" : "Vem är ordern till?"}</h2>
      </div>

      <div className={styles.filters} role="group" aria-label="Kund">
        <button type="button" className={styles.filter} aria-pressed={mode === "existing"} onClick={() => setMode("existing")} disabled={customers.length === 0}>
          Befintlig kund
        </button>
        <button type="button" className={styles.filter} aria-pressed={mode === "new"} onClick={() => setMode("new")}>
          Ny kund
        </button>
      </div>

      {mode === "existing" ? (
        <div key="existing" className={styles.form}>
          <label className={styles.search}>
            <span className="visually-hidden">Sök kund</span>
            <input type="search" value={query} placeholder="Sök företag, namn eller e-post…" onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className={styles.customerPick} role="radiogroup" aria-label="Välj kund">
            {matches.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={customerId === c.id}
                className={styles.customerOption}
                onClick={() => setCustomerId(c.id)}
              >
                <strong>{c.label}</strong>
                <span className={styles.muted}>{c.detail}</span>
              </button>
            ))}
            {matches.length === 0 && <p className={styles.muted}>Ingen kund matchar. Välj ”Ny kund”.</p>}
          </div>
        </div>
      ) : (
        <div key="new" className={styles.formGrid}>
          <label className={styles.formRow}>
            <span className={styles.formLabel}>Företag</span>
            <input className={styles.input} name="company" maxLength={120} placeholder="Hotell Kronan" />
          </label>
          <label className={styles.formRow}>
            <span className={styles.formLabel}>Kontaktperson *</span>
            <input className={styles.input} name="name" required maxLength={120} placeholder="Anders Wik" />
          </label>
          <label className={styles.formRow}>
            <span className={styles.formLabel}>E-post *</span>
            <input className={styles.input} name="email" type="email" required placeholder="anders@hotellkronan.se" />
          </label>
          <label className={styles.formRow}>
            <span className={styles.formLabel}>Telefon</span>
            <input className={styles.input} name="phone" type="tel" maxLength={40} placeholder="070-123 45 67" />
          </label>
          <label className={styles.formRow}>
            <span className={styles.formLabel}>Org.nr</span>
            <input className={styles.input} name="orgNumber" maxLength={20} placeholder="556123-4567" />
          </label>
          <label className={`${styles.formRow} ${styles.formWide}`}>
            <span className={styles.formLabel}>Adress</span>
            <textarea
              className={styles.input}
              name="address"
              rows={2}
              maxLength={300}
              placeholder={"Storgatan 1\n111 22 Stockholm"}
            />
          </label>
        </div>
      )}

      <div className={styles.stepHead}>
        <span className={styles.stepNo}>2</span>
        <h2 className={styles.sectionTitle}>Namn och titel på skylten</h2>
      </div>
      <label className={styles.formRow}>
        <span className={styles.formLabel}>Samma ruta som på startsidan — fler namn lägger du till i designern</span>
        <input
          className={styles.input}
          required
          value={text}
          maxLength={300}
          placeholder="Anna Lindqvist, Projektledare"
          onChange={(e) => setText(e.target.value)}
        />
      </label>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.dialogActions}>
        <button type="submit" className="btn btn--primary btn--lg" disabled={pending}>
          {pending ? "Öppnar skyltmotorn…" : "Fortsätt till skyltmotorn →"}
        </button>
      </div>
    </form>
  );
}
