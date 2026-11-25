"use client";

import { useId, useState, type FormEvent } from "react";
import { requestCallbackAction } from "./actions";
import styles from "./demo.module.css";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; name: string } | { kind: "error"; message: string };

/**
 * Bli uppringd: namn och telefonnummer, inget annat (besked av ägaren 2026-11-25). Förfrågan går som
 * mejl till hej@namnskylt.com. Länkkoden från utskicksmejlet följer med, så att vi ser vilket företag det är.
 */
export function CallbackForm({ token }: { token: string | null }) {
  const id = useId();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [fax, setFax] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === "sending") return;
    setState({ kind: "sending" });
    try {
      const result = await requestCallbackAction({ name, phone, fax, ...(token ? { k: token } : {}) });
      setState(result.ok ? { kind: "sent", name: name.trim().split(/\s+/)[0] ?? "" } : { kind: "error", message: result.error });
    } catch {
      setState({ kind: "error", message: "Det gick inte att skicka. Försök igen, eller ring oss." });
    }
  }

  if (state.kind === "sent") {
    return (
      <p className={styles.sent} role="status">
        Tack{state.name ? `, ${state.name}` : ""}! Vi ringer upp dig.
      </p>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label className={styles.field} htmlFor={`${id}-namn`}>
        <span>Namn</span>
        <input
          id={`${id}-namn`}
          name="name"
          autoComplete="name"
          required
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className={styles.field} htmlFor={`${id}-telefon`}>
        <span>Telefon</span>
        <input
          id={`${id}-telefon`}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          maxLength={30}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </label>
      {/* Bara en robot fyller i det här fältet. */}
      <label className={styles.trap} aria-hidden="true">
        Fax
        <input tabIndex={-1} autoComplete="off" name="fax" value={fax} onChange={(event) => setFax(event.target.value)} />
      </label>
      <button type="submit" className="btn btn--primary btn--lg" disabled={state.kind === "sending"}>
        {state.kind === "sending" ? "Skickar…" : "Ring upp mig"}
      </button>
      {state.kind === "error" ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
