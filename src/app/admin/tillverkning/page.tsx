import { DispatchQueue, type DispatchRow } from "@/features/admin/dispatch-queue";
import { adminTenant } from "@/features/admin/guard";
import { NoticesSeen } from "@/features/admin/notices-seen";
import styles from "@/features/admin/admin.module.css";
import { countUnreadNotices } from "@/lib/notices/repository";
import { listOrdersForDispatch } from "@/lib/orders/repository";
import { supplierApiConfigured } from "@/lib/supplier/client";
import { dispatchStatus, partyFor } from "@/lib/supplier/dispatch";
import type { SupplierBuyer } from "@/lib/supplier/types";
import { isOwner } from "@/lib/tenants/model";

export const dynamic = "force-dynamic";

export default async function DispatchPage() {
  const tenant = await adminTenant();
  // Översikten visar alla återförsäljares ordrar. Bara namnskylt.com får se den.
  if (!tenant || !isOwner(tenant)) return null;
  const orders = await listOrdersForDispatch();
  // Varje återförsäljares uppgifter läses en gång. En direktorder har kunden som beställare.
  const sellers = new Map<string, SupplierBuyer>();
  const rows: DispatchRow[] = [];
  for (const row of orders) {
    rows.push({ ...row, status: dispatchStatus(row.order, await partyFor(row.order, sellers)) });
  }
  const connected = supplierApiConfigured();
  // Beskeden om nya ordrar hos återförsäljarna leder hit, och är lästa när sidan har öppnats.
  const unread = await countUnreadNotices(tenant, { kind: "reseller-order" });

  return (
    <>
      {unread > 0 && <NoticesSeen target={{ kind: "reseller-order" }} />}
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Tillverkning</p>
          <h1 className={styles.pageTitle}>Ordrar till verkstaden</h1>
          <p className={styles.pageLead}>
            Varje order sparas här först och skickas sedan till Skylt &amp; Gravyrteknik med skyltarna, den som
            faktureras, leveransadressen och frakten. En återförsäljares order faktureras återförsäljaren. En order direkt
            hos namnskylt.com faktureras kunden. Under Underlag syns exakt det som skickas.
          </p>
        </div>
      </header>
      <div className={styles.callout} data-tone={connected ? "good" : "warn"} style={{ marginBottom: "var(--space-4)" }}>
        {connected ? (
          <>
            <strong>Kopplingen till Skylt &amp; Gravyrteknik är aktiverad.</strong>
            <span>Nya ordrar skickas direkt när de läggs. Äldre ordrar som väntar skickas en i taget härifrån.</span>
          </>
        ) : (
          <>
            <strong>Kopplingen till Skylt &amp; Gravyrteknik är inte aktiverad.</strong>
            <span>
              Ordrar sparas och väntar här, och ingenting skickas. Kopplingen slås på med SUPPLIER_API_URL och
              SUPPLIER_API_KEY i driftmiljön.
            </span>
          </>
        )}
      </div>
      {rows.length === 0 ? (
        <div className={styles.empty}>
          <strong>Inga ordrar än</strong>
          <span>När en order läggs syns den här.</span>
        </div>
      ) : (
        <DispatchQueue rows={rows} connected={connected} />
      )}
    </>
  );
}
