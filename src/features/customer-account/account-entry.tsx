"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { CustomerLoginForm } from "@/components/customer-login-form";
import { Segmented } from "@/components/ui/segmented";
import { registerRequest } from "@/lib/customer-auth/client";
import { accountPaths, MIN_CUSTOMER_PASSWORD_CHARS } from "@/lib/customer-auth/model";
import styles from "./account.module.css";

const MODES = [
  { id: "login", label: "Logga in" },
  { id: "register", label: "Skapa konto" },
] as const;
type Mode = (typeof MODES)[number]["id"];

interface AccountEntryProps {
  /** Butiken kontot gäller; `null` = namnskylt.com. */
  shop: string | null;
  /** Säljaren kunden har konto hos: butikens namn eller namnskylt.com. */
  sellerName: string;
}

/** Inloggningssidan för slutkunder: logga in, eller skapa ett konto med e-post och lösenord. */
export function AccountEntry({ shop, sellerName }: AccountEntryProps) {
  const paths = accountPaths(shop);
  const [mode, setMode] = useState<Mode>("login");
  const enter = () => window.location.assign(paths.home);
  return (
    <div className={styles.entry}>
      <div className={styles.entryCard}>
        <header>
          <p className={styles.eyebrow}>{sellerName}</p>
          <h1 className={styles.entryTitle}>{mode === "login" ? "Logga in" : "Skapa konto"}</h1>
          <p className={styles.lead}>Med ett konto slipper du fylla i dina uppgifter igen, och du ser dina ordrar.</p>
        </header>
        <Segmented label="Logga in eller skapa konto" value={mode} options={MODES} onChange={setMode} />
        {mode === "login" ? <CustomerLoginForm shop={shop} onSignedIn={enter} autoFocus /> : <RegisterForm shop={shop} onCreated={enter} />}
        <p className={styles.foot}>
          {mode === "login"
            ? `Glömt lösenordet? Hör av dig till ${sellerName}, så får du en länk där du väljer ett nytt.`
            : "Kontot fylls med dina uppgifter första gången du beställer."}
        </p>
        {!shop && (
          <p className={styles.reseller}>
            Är du återförsäljare?{" "}
            <Link href="/aterforsaljare" className={styles.link}>
              Logga in som återförsäljare
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

interface RegisterFormProps {
  shop: string | null;
  onCreated: () => void;
}

function RegisterForm({ shop, onCreated }: RegisterFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);
    const result = await registerRequest(shop, { email, password });
    setSending(false);
    if (result.ok) onCreated();
    else setError(result.error);
  };

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <label className="field">
        <span className="visually-hidden">E-post</span>
        <input type="email" placeholder="E-post" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label className="field">
        <span className="visually-hidden">Lösenord</span>
        <input
          type="password"
          placeholder={`Lösenord, minst ${MIN_CUSTOMER_PASSWORD_CHARS} tecken`}
          required
          minLength={MIN_CUSTOMER_PASSWORD_CHARS}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--block" disabled={sending}>
        {sending ? "Skapar kontot…" : "Skapa konto"}
      </button>
    </form>
  );
}
