import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "@/features/admin/admin-shell";
import { LoginForm } from "@/features/admin/login-form";
import { adminNav } from "@/features/admin/nav";
import { Notice } from "@/features/admin/notice";
import { ShotBackfill } from "@/features/admin/shot-backfill";
import { countUnreadNotices } from "@/lib/notices/repository";
import { databaseConfigured, getCompanyProfile, listOrders, missingBadgeShots, panelCounts } from "@/lib/orders/repository";
import { accountEmail } from "@/lib/reseller-auth/accounts";
import { countPendingApplications } from "@/lib/reseller-auth/applications";
import { currentTenant, resellerPass } from "@/lib/reseller-auth/session";
import { shopsOwnedBy } from "@/lib/shops/editor-repository";
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
        <LoginForm kind="admin" />
      </main>
    );
  }
  if (!databaseConfigured()) {
    return (
      <main>
        <AdminShell nav={adminNav({ owner: isOwner(tenant), shopSlug: null })} owner={isOwner(tenant)}>
          <Notice title="Databasen är inte kopplad">
            Ordrar skickas fortfarande till tillverkningen men sparas inte. Lägg till en Postgres-databas och sätt{" "}
            <code>DATABASE_URL</code>.
          </Notice>
        </AdminShell>
      </main>
    );
  }
  const owner = isOwner(tenant);
  const [orders, company, missing, ownedShops, unread, pendingApplications, counts, login] = await Promise.all([
    listOrders(tenant),
    getCompanyProfile(tenant),
    missingBadgeShots(tenant, MISSING_SHOTS_PER_VIEW),
    owner ? Promise.resolve([]) : shopsOwnedBy(tenant),
    countUnreadNotices(tenant),
    owner ? countPendingApplications() : Promise.resolve(0),
    owner ? null : panelCounts(tenant),
    owner ? null : accountEmail(tenant),
  ]);
  const pendingOrders = orders.filter((o) => o.status === "received").length;
  const demoCount = orders.filter((o) => o.demo).length;
  return (
    <main>
      <AdminShell
        nav={adminNav({
          owner,
          shopSlug: ownedShops[0] ?? null,
          pendingOrders,
          pendingApplications,
          counts: counts ? { ...counts, orders: orders.length } : undefined,
        })}
        login={login}
        unread={unread}
        demoCount={demoCount}
        companyName={company.name}
        owner={isOwner(tenant)}
      >
        {children}
      </AdminShell>
      <ShotBackfill items={missing} />
    </main>
  );
}
