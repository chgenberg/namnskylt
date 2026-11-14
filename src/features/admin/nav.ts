import "server-only";
import type { AdminNavItem } from "./nav-item";

/**
 * Panelens meny för den som är inloggad. Byggs på servern och skickas färdig
 * till `AdminShell`, så att adminens egna sidor (namn och adresser) aldrig
 * finns i JavaScript som en återförsäljares webbläsare laddar.
 */
export function adminNav({ owner, shopSlug }: { owner: boolean; shopSlug: string | null }): AdminNavItem[] {
  const first: AdminNavItem[] = [
    { href: "/admin", label: "Översikt", icon: "overview" },
    { href: "/admin/ordrar", label: "Ordrar", icon: "orders" },
    { href: "/admin/offerter", label: "Offerter", icon: "quotes" },
    { href: "/admin/kunder", label: "Kunder", icon: "customers" },
    { href: "/admin/statistik", label: "Statistik", icon: "stats" },
  ];
  const last: AdminNavItem[] = [
    { href: "/admin/export", label: "Export", icon: "export" },
    { href: "/admin/installningar", label: "Inställningar", icon: "settings" },
  ];
  if (owner) {
    return [
      ...first,
      { href: "/admin/tillverkning", label: "Tillverkning", icon: "workshop" },
      { href: "/admin/aterforsaljare", label: "Återförsäljare", icon: "resellers" },
      { href: "/admin/butiker", label: "Butiker", icon: "shops" },
      { href: "/admin/utskick", label: "Utskick", icon: "outreach" },
      { href: "/admin/prismodell", label: "Prismodell", icon: "purchase" },
      { href: "/admin/provision", label: "Provision", icon: "split" },
      ...last,
    ];
  }
  return [
    ...first,
    { href: "/admin/inkopspriser", label: "Inköpspriser", icon: "purchase" },
    ...last,
    // Butiken återförsäljaren har tagit över.
    ...(shopSlug ? [{ href: `/admin/butiker/${shopSlug}`, label: "Min butik", icon: "shops" } as const] : []),
  ];
}
