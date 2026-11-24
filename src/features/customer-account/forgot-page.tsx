"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { accountPaths } from "@/lib/customer-auth/model";
import styles from "./account.module.css";
import { customerForgotPasswordAction } from "./forgot-actions";

interface CustomerForgotPageProps {
  /** Butiken kontot hör till; `null` = namnskylt.com. */
  shop: string | null;
  sellerName: string;
  /** Sajtens mejl är påslagna, så att länken går att skicka. */
  available: boolean;
}

/**
 * "Glömt lösenordet?" för kundens konto (besked av ägaren 2026-11-24: "glömt lösenord saknas"). Kunden
 * skriver sin adress och får en länk där ett nytt lösenord väljs. Svaret säger aldrig om adressen har
 * ett konto.
 */
export function CustomerForgotPage({ shop, sellerName, available }: CustomerForgotPageProps) {
  const paths = accountPaths(shop);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className={styles.entry}>
      <div className={styles.entryCard}>
        <header>
          <p className={styles.eyebrow}>{sellerName}</p>
          <h1 className={styles.entryTitle}>Glömt lösenordet</h1>
          <p className={styles.lead}>
            {available
              ? "Skriv adressen du loggar in med, så mejlar vi en länk där du väljer ett nytt lösenord."
              : `Hör av dig till ${sellerName}, så får du en länk där du väljer ett nytt lösenord.`}
          </p>
        </header>
        {sent ? (
          <p className={styles.lead} role="status">
            <strong>Titta i din inkorg.</strong> Finns adressen hos oss har vi mejlat en länk där du väljer ett nytt
            lösenord. Länken gäller i två timmar.
          </p>
        ) : (
          available && (
            <form
              className={styles.forgotForm}
              onSubmit={(event) => {
                event.preventDefault();
                const email = String(new FormData(event.currentTarget).get("email") ?? "");
                setError(null);
                startTransition(async () => {
                  const result = await customerForgotPasswordAction(shop, email);
                  if (result.ok) setSent(true);
                  else setError(result.error);
                });
              }}
            >
              <label className="field">
                <span className="visually-hidden">E-post</span>
                <input name="email" type="email" placeholder="E-post" required maxLength={200} autoComplete="email" autoFocus />
              </label>
              {error && (
                <p className={styles.forgotError} role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
                {pending ? "Skickar…" : "Mejla en länk"}
              </button>
            </form>
          )
        )}
        <p className={styles.foot}>
          <Link href={paths.login} className={styles.link}>
            Till inloggningen
          </Link>
        </p>
      </div>
    </div>
  );
}
