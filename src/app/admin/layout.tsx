import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminLogin } from "@/features/admin/admin-login";
import { AdminShell } from "@/features/admin/admin-shell";
import { Notice } from "@/features/admin/notice";
import { databaseConfigured, listOrders } from "@/lib/orders/repository";
import { isResellerSignedIn, resellerPass } from "@/lib/reseller-auth/session";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

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
  if (!(await isResellerSignedIn())) {
    return (
      <main>
        <AdminLogin />
      </main>
    );
  }
  if (!databaseConfigured()) {
    return (
      <main>
        <AdminShell pending={0}>
          <Notice title="Databasen är inte kopplad">
            Ordrar skickas fortfarande till tillverkningen men sparas inte. Lägg till en Postgres-databas och sätt{" "}
            <code>DATABASE_URL</code>.
          </Notice>
        </AdminShell>
      </main>
    );
  }
  const pending = (await listOrders()).filter((o) => o.status === "received").length;
  return (
    <main>
      <AdminShell pending={pending}>{children}</AdminShell>
    </main>
  );
}
