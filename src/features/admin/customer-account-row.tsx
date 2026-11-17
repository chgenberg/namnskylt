"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { customerPasswordLinkAction, deleteCustomerAccountAction } from "./customer-account-actions";
import { LinkBox } from "./reseller-admin";
import type { LinkResult } from "./reseller-admin-actions";
import styles from "./admin.module.css";
import table from "./reseller-orders.module.css";

/** Antal kolumner i listan över kundkonton. Länken för nytt lösenord får en egen rad över alla. */
const ACCOUNT_COLUMNS = 6;

interface CustomerAccountRowProps {
  accountId: string;
  email: string;
  /** Företag och namn ur kontots uppgifter, eller en rad om att de saknas. */
  customer: string;
  /** Säljaren kunden har konto hos: butikens namn eller namnskylt.com. */
  sellerName: string;
  created: string;
  orders: number;
}

/**
 * Ett kundkonto i panelens lista, med lösenordslänk och borttagning. Länken
 * visas en gång, på en egen rad under kontot, och skickas av den som sköter kontot.
 */
export function CustomerAccountRow({ accountId, email, customer, sellerName, created, orders }: CustomerAccountRowProps) {
  const router = useRouter();
  const [link, setLink] = useState<Extract<LinkResult, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <tr>
        <td>{email}</td>
        <td>{customer}</td>
        <td>{sellerName}</td>
        <td>{created}</td>
        <td className={table.num}>{orders}</td>
        <td>
          <div className={styles.actionBar}>
            <button
              type="button"
              className={styles.ghostButton}
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await customerPasswordLinkAction(accountId);
                  if (result.ok) setLink(result);
                  else setError(result.error);
                });
              }}
            >
              {link ? "Ny länk" : "Lösenordslänk"}
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Ta bort kontot för ${email}? Kundens ordrar står kvar.`)) return;
                setError(null);
                startTransition(async () => {
                  const result = await deleteCustomerAccountAction(accountId);
                  if (result.ok) router.refresh();
                  else setError(result.error);
                });
              }}
            >
              Ta bort
            </button>
          </div>
          {error && (
            <span className={styles.error} role="alert">
              {error}
            </span>
          )}
        </td>
      </tr>
      {link && (
        <tr>
          <td colSpan={ACCOUNT_COLUMNS}>
            <LinkBox
              link={link}
              subject={`Nytt lösenord hos ${sellerName}`}
              body={`Hej!\n\nHär är länken för att välja nytt lösenord till ditt konto hos ${sellerName}:`}
            />
          </td>
        </tr>
      )}
    </>
  );
}
