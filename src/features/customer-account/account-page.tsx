import Link from "next/link";
import { redirect } from "next/navigation";
import { accountPaths } from "@/lib/customer-auth/model";
import { currentCustomer } from "@/lib/customer-auth/session";
import { draftFromAddress } from "@/lib/orders/delivery";
import { isErasedCustomer } from "@/lib/orders/erase-model";
import { databaseConfigured, listAccountOrders } from "@/lib/orders/repository";
import { AccountDetailsForm } from "./account-details-form";
import { AccountOrders } from "./account-orders";
import { AccountPasswordForm } from "./account-password-form";
import { DeleteAccountButton, SignOutButton } from "./account-controls";
import styles from "./account.module.css";

interface AccountPageProps {
  /** Butiken kontot gäller; `null` = namnskylt.com. */
  shop: string | null;
  /** Säljaren kunden har konto hos: butikens namn eller namnskylt.com. */
  sellerName: string;
}

/**
 * Slutkundens sida: ordrarna som lagts med kontot, med "Beställ igen", och
 * uppgifterna som kassan fylls i med. Den som inte är inloggad skickas till
 * inloggningen.
 */
export async function AccountPage({ shop, sellerName }: AccountPageProps) {
  const paths = accountPaths(shop);
  const account = databaseConfigured() ? await currentCustomer(shop) : null;
  if (!account) redirect(paths.login);
  // En borttagen kunds order står bara kvar för bokföringen och visas inte.
  const orders = (await listAccountOrders(account.id)).filter((order) => !isErasedCustomer(order.customer));
  const { profile } = account;
  const greeting = profile.name.split(/\s+/)[0] || profile.company;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>Mitt konto · {sellerName}</p>
          <h1 className={styles.title}>{greeting ? `Hej ${greeting}` : "Mitt konto"}</h1>
          <p className={styles.lead}>Inloggad som {account.email}</p>
        </div>
        <div className={styles.headActions}>
          <Link href={paths.designer} className="btn btn--primary">
            Skapa skylt
          </Link>
          <SignOutButton shop={shop} />
        </div>
      </header>

      <section className={styles.section} aria-labelledby="account-orders">
        <h2 id="account-orders" className={styles.sectionTitle}>
          Mina ordrar
        </h2>
        <AccountOrders orders={orders} shop={shop} />
      </section>

      <section className={styles.section} aria-labelledby="account-details">
        <h2 id="account-details" className={styles.sectionTitle}>
          Mina uppgifter
        </h2>
        <p className={styles.sectionLead}>Kassan fylls i med de här uppgifterna när du är inloggad. De uppdateras när du beställer.</p>
        <AccountDetailsForm
          shop={shop}
          initial={{ name: profile.name, company: profile.company, orgNumber: profile.orgNumber, delivery: draftFromAddress(profile.delivery) }}
        />
      </section>

      <section className={styles.section} aria-labelledby="account-password">
        <h2 id="account-password" className={styles.sectionTitle}>
          Lösenord
        </h2>
        <AccountPasswordForm shop={shop} email={account.email} />
      </section>

      <section className={styles.section} aria-labelledby="account-delete">
        <h2 id="account-delete" className={styles.sectionTitle}>
          Ta bort kontot
        </h2>
        <p className={styles.sectionLead}>
          Kontot och uppgifterna ovan tas bort. Ordrarna du har lagt finns kvar hos {sellerName}, eftersom de hör till bokföringen.
        </p>
        <DeleteAccountButton shop={shop} />
      </section>
    </div>
  );
}
