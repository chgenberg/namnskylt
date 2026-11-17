"use client";

import Link from "next/link";
import { useState } from "react";
import { CustomerLoginForm } from "@/components/customer-login-form";
import { signOutRequest } from "@/lib/customer-auth/client";
import { accountPaths, type CustomerAccountView } from "@/lib/customer-auth/model";
import styles from "./cart.module.css";

interface CartAccountProps {
  /** Butiken skyltmotorn ligger i; `null` = namnskylt.com. */
  shop: string | null;
  /** Kunden som är inloggad, eller `null`. */
  account: CustomerAccountView | null;
  onChange: (account: CustomerAccountView | null) => void;
}

/**
 * Inloggningen högst upp i varukorgen (besked av ägaren 2026-11-17): en kund
 * som har beställt förut loggar in här och får kassan ifylld. Återförsäljarna
 * har sin egen inloggning, som länken går till.
 */
export function CartAccount({ shop, account, onChange }: CartAccountProps) {
  const [open, setOpen] = useState(false);
  const paths = accountPaths(shop);

  if (account) {
    return (
      <div className={styles.account} data-signed-in>
        <p className={styles.accountLead}>
          Inloggad som <strong>{account.email}</strong>
        </p>
        <p className={styles.accountLinks}>
          <Link href={paths.home}>Mitt konto</Link>
          <button
            type="button"
            onClick={async () => {
              // Kakan ligger kvar om anropet inte går fram: då är kunden fortfarande inloggad.
              if (await signOutRequest(shop)) onChange(null);
            }}
          >
            Logga ut
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className={styles.account}>
      <p className={styles.accountLead}>Har du beställt förut? Logga in, så är dina uppgifter ifyllda.</p>
      <p className={styles.accountLinks}>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
          Logga in
        </button>
        {/* I en butik är besökaren butikens kund. Återförsäljaren loggar in på namnskylt.com. */}
        {!shop && <Link href="/aterforsaljare">Logga in som återförsäljare</Link>}
      </p>
      {open && (
        <CustomerLoginForm
          shop={shop}
          autoFocus
          onSignedIn={(signedIn) => {
            setOpen(false);
            onChange(signedIn);
          }}
        />
      )}
    </div>
  );
}
