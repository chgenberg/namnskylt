import Link from "next/link";
import styles from "@/features/admin/admin.module.css";
import { Notice } from "@/features/admin/notice";
import { SwitchToAdmin } from "@/features/admin/switch-to-admin";
import { currentTenant } from "@/lib/reseller-auth/session";
import { isOwner } from "@/lib/tenants/model";

/**
 * Sidan i panelen finns inte för den som är inloggad. Det vanligaste skälet är fel inloggning:
 * en länk i ett besked till namnskylt.coms admin öppnad av den som är inloggad som
 * återförsäljare (hände 2026-11-21, och sidan svarade då bara "404" på engelska). Panelen har
 * en inloggning i taget, så sidan säger vem som är inloggad och låter den byta till adminens
 * inloggning på samma adress.
 *
 * Sidan säger aldrig om ordern eller offerten finns hos någon annan: svaret är detsamma för
 * varje adress som inte hör till den inloggade.
 */
export default async function AdminNotFound() {
  const tenant = await currentTenant();
  if (tenant && isOwner(tenant)) {
    return (
      <Notice title="Sidan finns inte">
        <p>Ordern, offerten eller sidan finns inte längre. Den kan ha tagits bort.</p>
        <p className={styles.welcomeActions}>
          <Link href="/admin/ordrar" className="btn btn--primary">
            Till ordrarna
          </Link>
          <Link href="/admin/offerter" className="btn">
            Till offerterna
          </Link>
        </p>
      </Notice>
    );
  }
  return (
    <Notice title="Sidan finns inte i din panel">
      <p>Du är inloggad som återförsäljare. Ordern, offerten eller sidan du öppnade hör inte till ditt konto.</p>
      <p>Kom du hit från ett besked till namnskylt.coms admin? Logga in som admin, så öppnas sidan.</p>
      <p className={styles.welcomeActions}>
        <SwitchToAdmin />
        <Link href="/admin/offerter" className="btn">
          Till mina offerter
        </Link>
      </p>
    </Notice>
  );
}
