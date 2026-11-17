"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { ProfileDraft } from "@/lib/customer-auth/model";
import { saveProfileAction } from "./actions";
import { ProfileFields } from "./profile-fields";
import styles from "./account.module.css";

interface AccountDetailsFormProps {
  shop: string | null;
  initial: ProfileDraft;
}

/** Uppgifterna kassan fylls i med, under Mitt konto. */
export function AccountDetailsForm({ shop, initial }: AccountDetailsFormProps) {
  const [values, setValues] = useState(initial);
  const [status, setStatus] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveProfileAction(shop, values);
      setStatus(result.ok ? { tone: "good", text: "Uppgifterna är sparade." } : { tone: "bad", text: result.error });
    });
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <ProfileFields
        value={values}
        disabled={pending}
        onChange={(next) => {
          setValues(next);
          setStatus(null);
        }}
      />
      {status && (
        <p className={status.tone === "good" ? styles.saved : styles.error} role={status.tone === "good" ? "status" : "alert"}>
          {status.text}
        </p>
      )}
      <div>
        <button type="submit" className="btn btn--primary" disabled={pending}>
          {pending ? "Sparar…" : "Spara uppgifterna"}
        </button>
      </div>
    </form>
  );
}
