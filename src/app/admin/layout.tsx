import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminLogin } from "@/features/admin/admin-login";
import { AdminShell } from "@/features/admin/admin-shell";
import { Notice } from "@/features/admin/notice";
import { ShotBackfill } from "@/features/admin/shot-backfill";
import { databaseConfigured, getCompanyProfile, listOrders, missingBadgeShots } from "@/lib/orders/repository";
import { currentTenant, resellerPass } from "@/lib/reseller-auth/session";
import { isOwner } from "@/lib/tenants/model";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Gamla ordrar och offerter får sin 3D-bild några i taget, medan panelen används. */
const MISSING_SHOTS_PER_VIEW = 20;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!resellerPass.configured()) {
    return (
      <main>
        <Notice title="Inloggningen är inte påslagen">
          Sätt miljövariabeln <code>RESELLER_PASSWORD</code> för att kunna logga in.
        </Notice>
      </main>
    );
  }
  const tenant = await currentTenant();
  if (!tenant) {
    return (
      <main>
        <AdminLogin />
      </main>
    );
  }
  if (!databaseConfigured()) {
    return (
      <main>
        <AdminShell pending={0} owner={isOwner(tenant)}>
          <Notice title="Databasen är inte kopplad">
            Ordrar skickas fortfarande till tillverkningen men sparas inte. Lägg till en Postgres-databas och sätt{" "}
            <code>DATABASE_URL</code>.
          </Notice>
        </AdminShell>
      </main>
    );
  }
  const [orders, company, missing] = await Promise.all([
    listOrders(tenant),
    getCompanyProfile(tenant),
    missingBadgeShots(tenant, MISSING_SHOTS_PER_VIEW),
  ]);
  const pending = orders.filter((o) => o.status === "received").length;
  const demoCount = orders.filter((o) => o.demo).length;
  return (
    <main>
      <AdminShell pending={pending} demoCount={demoCount} companyName={company.name} owner={isOwner(tenant)}>
        {children}
      </AdminShell>
      <ShotBackfill items={missing} />
    </main>
  );
}
