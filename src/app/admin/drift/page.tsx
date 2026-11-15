import { adminTenant } from "@/features/admin/guard";
import styles from "@/features/admin/admin.module.css";
import { OpsOverview } from "@/features/admin/ops/ops-overview";
import { getOpsStatus } from "@/lib/maintenance/status";
import { isOwner } from "@/lib/tenants/model";

export const dynamic = "force-dynamic";

export default async function OpsPage() {
  const tenant = await adminTenant();
  // Felloggen och driftens lägen gäller hela sajten. Bara namnskylt.com får se dem.
  if (!tenant || !isOwner(tenant)) return null;
  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Drift</p>
          <h1 className={styles.pageTitle}>Läget i driften</h1>
          <p className={styles.pageLead}>
            Vad som är av och på, vad servern gör i bakgrunden och vilka fel den har stött på. Ordrar som inte nådde
            verkstaden provas igen av sig själva, glesare för varje gång.
          </p>
        </div>
      </header>
      <OpsOverview status={await getOpsStatus()} />
    </>
  );
}
