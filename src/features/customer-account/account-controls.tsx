"use client";

import { useState, useTransition } from "react";
import { signOutRequest } from "@/lib/customer-auth/client";
import { accountPaths } from "@/lib/customer-auth/model";
import { deleteAccountAction } from "./actions";
import styles from "./account.module.css";

/** Loggar ut och går till inloggningssidan. */
export function SignOutButton({ shop }: { shop: string | null }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className="btn"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await signOutRequest(shop);
        window.location.assign(accountPaths(shop).login);
      }}
    >
      Logga ut
    </button>
  );
}

/** Kunden tar bort sitt eget konto, efter en fråga. */
export function DeleteAccountButton({ shop }: { shop: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className={styles.form}>
      <div>
        <button
          type="button"
          className={`btn ${styles.danger}`}
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Ta bort kontot? Det går inte att ångra.")) return;
            setError(null);
            startTransition(async () => {
              const result = await deleteAccountAction(shop);
              if (result.ok) window.location.assign(accountPaths(shop).login);
              else setError(result.error);
            });
          }}
        >
          {pending ? "Tar bort…" : "Ta bort mitt konto"}
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
