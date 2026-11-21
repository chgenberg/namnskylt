import { notFound } from "next/navigation";
import { DeleteAccountButton } from "@/features/admin/delete-account-button";
import { DeleteApplicationButton } from "@/features/admin/delete-application-button";
import { adminTenant } from "@/features/admin/guard";
import { NoticesSeen } from "@/features/admin/notices-seen";
import { ApplicationControls, PasswordLinkButton } from "@/features/admin/reseller-admin";
import styles from "@/features/admin/admin.module.css";
import table from "@/features/admin/reseller-orders.module.css";
import { formatDay } from "@/lib/format";
import { countUnreadNotices } from "@/lib/notices/repository";
import { listAccounts } from "@/lib/reseller-auth/accounts";
import { APPLICATION_STATUS_LABEL } from "@/lib/reseller-auth/application-model";
import { listApplications } from "@/lib/reseller-auth/applications";
import { isOwner } from "@/lib/tenants/model";

export const dynamic = "force-dynamic";

export default async function ResellersPage() {
  const tenant = await adminTenant();
  // Ansökningar och konton är namnskylt.coms. En återförsäljare får aldrig se andra återförsäljare.
  if (!tenant) return null;
  if (!isOwner(tenant)) notFound();
  const [applications, accounts, unread] = await Promise.all([
    listApplications(),
    listAccounts(),
    countUnreadNotices(tenant, { kind: "application" }),
  ]);
  // En godkänd ansökan utan konto väntar på att den sökande väljer lösenord.
  const open = applications.filter((a) => a.status === "pending" || (a.status === "approved" && !a.accountId));
  const closed = applications.filter((a) => !open.includes(a));

  return (
    <>
      {unread > 0 && <NoticesSeen target={{ kind: "application" }} />}
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Återförsäljare</p>
          <h1 className={styles.pageTitle}>Ansökningar och konton</h1>
          <p className={styles.pageLead}>
            Företag ansöker på <span className="mono">/aterforsaljare/ansok</span>. När ni godkänner en ansökan får ni en länk
            att skicka, där den sökande väljer lösenord. Först då finns kontot, med ansökans uppgifter som företagets.
          </p>
        </div>
      </header>

      <section className={`${styles.panel} ${styles.section}`} aria-labelledby="applications">
        <div className={styles.sectionHead}>
          <h2 id="applications" className={styles.sectionTitle}>
            Ansökningar
          </h2>
          <span className={styles.muted}>{open.length === 0 ? "Ingen väntar" : `${open.length} väntar`}</span>
        </div>
        {open.length === 0 ? (
          <p className={styles.muted}>Inga ansökningar väntar på beslut.</p>
        ) : (
          <div className={styles.cards}>
            {open.map((application) => (
              <article key={application.id} className={styles.panel}>
                <div className={styles.sectionHead}>
                  <h3 className={styles.sectionTitle}>{application.company}</h3>
                  <span className={styles.muted}>
                    {application.status === "approved" ? "Godkänd, har inte valt lösenord" : "Väntar"} · {formatDay(application.createdAt)}
                  </span>
                </div>
                <dl className={styles.facts} style={{ marginBottom: "var(--space-3)" }}>
                  <dt>Org.nr</dt>
                  <dd>{application.orgNumber}</dd>
                  <dt>Kontakt</dt>
                  <dd>{application.contactName}</dd>
                  <dt>E-post</dt>
                  <dd>{application.email}</dd>
                  {application.phone && (
                    <>
                      <dt>Telefon</dt>
                      <dd>{application.phone}</dd>
                    </>
                  )}
                  <dt>Fakturaadress</dt>
                  <dd style={{ whiteSpace: "pre-line" }}>{application.address}</dd>
                  {application.invoiceEmail && (
                    <>
                      <dt>E-post faktura</dt>
                      <dd>{application.invoiceEmail}</dd>
                    </>
                  )}
                  {application.delivery && (
                    <>
                      <dt>Leveransadress</dt>
                      <dd style={{ whiteSpace: "pre-line" }}>
                        {[application.delivery.line1, application.delivery.line2, `${application.delivery.zip} ${application.delivery.city}`]
                          .filter(Boolean)
                          .join("\n")}
                      </dd>
                    </>
                  )}
                  {application.website && (
                    <>
                      <dt>Hemsida</dt>
                      <dd>{application.website}</dd>
                    </>
                  )}
                  {application.message && (
                    <>
                      <dt>Meddelande</dt>
                      <dd style={{ whiteSpace: "pre-line" }}>{application.message}</dd>
                    </>
                  )}
                </dl>
                <ApplicationControls id={application.id} company={application.company} approved={application.status === "approved"} />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={`${styles.panel} ${styles.section}`} aria-labelledby="accounts">
        <div className={styles.sectionHead}>
          <h2 id="accounts" className={styles.sectionTitle}>
            Konton
          </h2>
          <span className={styles.muted}>{accounts.length} st</span>
        </div>
        {accounts.length === 0 ? (
          <p className={styles.muted}>Inga återförsäljare har konto än.</p>
        ) : (
          <div className={table.scroll}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th scope="col">Återförsäljare</th>
                  <th scope="col">E-post</th>
                  <th scope="col">Skapat</th>
                  <th scope="col" className={table.num}>
                    Ordrar
                  </th>
                  <th scope="col">Butik</th>
                  <th scope="col">
                    <span className="visually-hidden">Åtgärd</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <th scope="row" className={table.wrap}>
                      {account.name}
                      <span className={table.sub}>{account.id}</span>
                    </th>
                    <td>{account.email}</td>
                    <td>{formatDay(account.createdAt)}</td>
                    <td className={table.num}>{account.orders}</td>
                    <td>{account.shopSlug ?? ""}</td>
                    <td className={table.wrap}>
                      <div className={styles.actionBar}>
                        <PasswordLinkButton accountId={account.id} name={account.name} email={account.email} />
                        <DeleteAccountButton accountId={account.id} name={account.name} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {closed.length > 0 && (
        <section className={`${styles.panel} ${styles.section}`} aria-labelledby="decided">
          <div className={styles.sectionHead}>
            <h2 id="decided" className={styles.sectionTitle}>
              Avgjorda ansökningar
            </h2>
          </div>
          <ul className={styles.eventList}>
            {closed.map((application) => (
              <li key={application.id}>
                <strong>
                  {application.company} · {APPLICATION_STATUS_LABEL[application.status]}
                </strong>
                <span className={styles.muted}>
                  {application.email}
                  {application.decidedAt && ` · ${formatDay(application.decidedAt)}`}
                </span>
                <div className={styles.actionBar}>
                  <DeleteApplicationButton id={application.id} company={application.company} hasAccount={Boolean(application.accountId)} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
