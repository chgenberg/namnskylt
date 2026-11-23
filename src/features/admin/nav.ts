import "server-only";
import type { AdminNavItem } from "./nav-item";

/**
 * Panelens meny för den som är inloggad. Byggs på servern och skickas färdig
 * till `AdminShell`, så att adminens egna sidor (namn och adresser) aldrig
 * finns i JavaScript som en återförsäljares webbläsare laddar.
 */
export function adminNav({
  owner,
  shopSlug,
  pendingOrders = 0,
  pendingApplications = 0,
  counts,
}: {
  owner: boolean;
  shopSlug: string | null;
  /** Ordrar som väntar på att någon gör något. */
  pendingOrders?: number;
  /** Ansökningar som väntar på beslut. Bara admin har sidan. */
  pendingApplications?: number;
  /** Antalen på återförsäljarens flikar. */
  counts?: { quotes: number; orders: number; customers: number };
}): AdminNavItem[] {
  const orders: AdminNavItem = { href: "/admin/ordrar", label: "Ordrar", icon: "orders", badge: pendingOrders };
  const rest: AdminNavItem[] = [
    { href: "/admin/kunder", label: "Kunder", icon: "customers" },
    { href: "/admin/statistik", label: "Statistik", icon: "stats" },
  ];
  const last: AdminNavItem[] = [
    { href: "/admin/export", label: "Export", icon: "export" },
    { href: "/admin/installningar", label: "Inställningar", icon: "settings" },
  ];
  if (owner) {
    return [
      { href: "/admin", label: "Översikt", icon: "overview", news: true },
      orders,
      { href: "/admin/offerter", label: "Offerter", icon: "quotes" },
      ...rest,
      { href: "/admin/tillverkning", label: "Tillverkning", icon: "workshop" },
      { href: "/admin/aterforsaljare", label: "Återförsäljare", icon: "resellers", badge: pendingApplications },
      { href: "/admin/butiker", label: "Butiker", icon: "shops" },
      { href: "/admin/utskick", label: "Utskick", icon: "outreach" },
      { href: "/admin/prismodell", label: "Prismodell", icon: "purchase" },
      { href: "/admin/provision", label: "Provision", icon: "split" },
      { href: "/admin/drift", label: "Drift", icon: "ops" },
      ...last,
    ];
  }
  // Återförsäljaren har ingen översikt (besked av ägaren 2026-11-19): panelen börjar på offertlistan,
  // som står först bland flikarna och bär antalet olästa besked. Flikarna bär antalet i listan, som i
  // Godis-sajtens panel (besked av ägaren 2026-11-23).
  return [
    { href: "/admin/offerter", label: "Offerter", icon: "quotes", news: true, count: counts?.quotes },
    { ...orders, badge: 0, count: counts?.orders },
    { href: "/admin/kunder", label: "Kunder", icon: "customers", count: counts?.customers },
    { href: "/admin/statistik", label: "Statistik", icon: "stats" },
    { href: "/admin/inkopspriser", label: "Inköpspriser", icon: "purchase" },
    ...last,
    // Butiken återförsäljaren har tagit över.
    ...(shopSlug ? [{ href: `/admin/butiker/${shopSlug}`, label: "Min butik", icon: "shops" } as const] : []),
  ];
}
