import Link from "next/link";
import { customerAccessLinkAccount } from "@/lib/customer-auth/access-links";
import { getCustomerAccount } from "@/lib/customer-auth/accounts";
import { accountPaths } from "@/lib/customer-auth/model";
import { databaseConfigured } from "@/lib/orders/repository";
import { PasswordLinkForm } from "./password-link-form";
import styles from "./account.module.css";

interface PasswordLinkPageProps {
  /** Butiken sidan öppnades i; `null` = namnskylt.com. Länken gäller bara där kontot finns. */
  shop: string | null;
  sellerName: string;
  token: string;
  /** Länken kom från varukorgen (`?varukorg=1`). */
  fromCart?: boolean;
}

/** Länken från säljaren: kunden väljer ett nytt lösenord och är sedan inloggad. */
export async function PasswordLinkPage({ shop, sellerName, token, fromCart = false }: PasswordLinkPageProps) {
  const accountId = databaseConfigured() ? await customerAccessLinkAccount(token) : null;
  const account = accountId ? await getCustomerAccount(accountId) : null;
  const valid = account !== null && account.shop === shop;
  return (
    <div className={styles.entry}>
      <div className={styles.entryCard}>
        <header>
          <p className={styles.eyebrow}>{sellerName}</p>
          <h1 className={styles.entryTitle}>{valid ? "Välj nytt lösenord" : "Länken fungerar inte längre"}</h1>
          <p className={styles.lead}>
            {valid ? (
              fromCart ? (
                "Lösenordet gäller ditt konto. När du har sparat det är du inloggad och kommer tillbaka till varukorgen."
              ) : (
                "Lösenordet gäller ditt konto. När du har sparat det är du inloggad."
              )
            ) : (
              <>
                Den är redan använd eller har gått ut. Be {sellerName} om en ny, eller <Link href={accountPaths(shop).login}>logga in</Link>.
              </>
            )}
          </p>
        </header>
        {valid && <PasswordLinkForm token={token} email={account.email} fromCart={fromCart} />}
      </div>
    </div>
  );
}
