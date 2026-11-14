import { CompanyForm } from "@/features/admin/company-form";
import { adminTenant } from "@/features/admin/guard";
import { PasswordForm } from "@/features/admin/password-form";
import styles from "@/features/admin/admin.module.css";
import { getCompanyProfile } from "@/lib/orders/repository";
import { isOwner } from "@/lib/tenants/model";

/** Läsningen av hemsidan körs som server action härifrån och kan ta en halv minut. */
export const maxDuration = 60;

export default async function SettingsPage() {
  const tenant = await adminTenant();
  if (!tenant) return null;
  const profile = await getCompanyProfile(tenant);
  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Inställningar</p>
          <h1 className={styles.pageTitle}>Ditt företag</h1>
          <p className={styles.pageLead}>
            Uppgifterna, loggan och färgerna som dina offerter skickas med. Företagsnamn, organisationsnummer och adress är
            också det Skylt &amp; Gravyrteknik fakturerar, så en order går inte till verkstaden utan organisationsnummer.
          </p>
        </div>
      </header>
      <CompanyForm profile={profile} />
      {!isOwner(tenant) && (
        <section className={`${styles.panel} ${styles.section}`} aria-labelledby="password">
          <div className={styles.sectionHead}>
            <h2 id="password" className={styles.sectionTitle}>
              Lösenord
            </h2>
          </div>
          <PasswordForm />
        </section>
      )}
    </>
  );
}
