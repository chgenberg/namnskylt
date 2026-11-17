import { listCustomerAccounts } from "@/lib/customer-auth/accounts";
import { formatDay } from "@/lib/format";
import { CustomerAccountRow } from "./customer-account-row";
import styles from "./admin.module.css";
import table from "./reseller-orders.module.css";

/** Ett konto utan butik är skapat på namnskylt.com. Bara namnskylt.com sköter sådana. */
const WEB_SELLER = "namnskylt.com";

interface CustomerAccountsProps {
  /** Den som är inloggad i panelen. Listan visar kundkontona den sköter. */
  tenant: string;
}

/**
 * Kundkontona som panelens ägare sköter: kunder som har valt ett lösenord i
 * kassan eller på inloggningssidan. Här skapas länken för nytt lösenord, som
 * skickas för hand eftersom sajten inte skickar mejl.
 */
export async function CustomerAccounts({ tenant }: CustomerAccountsProps) {
  const accounts = await listCustomerAccounts(tenant);
  return (
    <section className={`${styles.panel} ${styles.section}`} aria-labelledby="customer-accounts">
      <div className={styles.sectionHead}>
        <h2 id="customer-accounts" className={styles.sectionTitle}>
          Kundkonton
        </h2>
        <span className={styles.muted}>{accounts.length} st</span>
      </div>
      <p className={styles.muted}>
        Kunder som har skapat ett konto loggar in, får kassan ifylld och ser sina ordrar. Har en kund glömt sitt lösenord
        skapar du en länk här och skickar den själv. Länken gäller i tre dagar och en gång.
      </p>
      {accounts.length === 0 ? (
        <p className={styles.muted}>Ingen kund har skapat konto än.</p>
      ) : (
        <div className={table.scroll}>
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col">E-post</th>
                <th scope="col">Kund</th>
                <th scope="col">Konto hos</th>
                <th scope="col">Skapat</th>
                <th scope="col" className={table.num}>
                  Ordrar
                </th>
                <th scope="col">
                  <span className="visually-hidden">Åtgärd</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <CustomerAccountRow
                  key={account.id}
                  accountId={account.id}
                  email={account.email}
                  customer={[account.company, account.name].filter(Boolean).join(", ") || "Inga uppgifter än"}
                  sellerName={account.shop?.name ?? WEB_SELLER}
                  created={formatDay(account.createdAt)}
                  orders={account.orders}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
