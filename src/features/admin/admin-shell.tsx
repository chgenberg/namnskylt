"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DemoBanner } from "./demo-data-controls";
import styles from "./admin.module.css";

const ICON: Record<string, ReactNode> = {
  overview: <path d="M3 3h6v8H3zM11 3h6v4h-6zM11 9h6v8h-6zM3 13h6v4H3z" />,
  orders: <path d="M4 3h12v14H4zM7 7h6M7 10h6M7 13h4" />,
  customers: <path d="M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 17c0-3 2.2-5 5-5s5 2 5 5M14 9a2.5 2.5 0 1 0 0-5M15 12c2 .4 3 2.2 3 5" />,
  stats: <path d="M3 17h14M5 14V9M9 14V5M13 14v-3M17 14V7" />,
  export: <path d="M10 3v10M6 9l4 4 4-4M4 17h12" />,
};

const NAV = [
  { href: "/admin", label: "Översikt", icon: "overview" },
  { href: "/admin/ordrar", label: "Ordrar", icon: "orders" },
  { href: "/admin/kunder", label: "Kunder", icon: "customers" },
  { href: "/admin/statistik", label: "Statistik", icon: "stats" },
  { href: "/admin/export", label: "Export", icon: "export" },
] as const;

function NavIcon({ name }: { name: string }) {
  return (
    <span className={styles.navIcon} aria-hidden="true">
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {ICON[name]}
      </svg>
    </span>
  );
}

interface AdminShellProps {
  /** Ordrar som väntar på att någon gör något — visas som siffra i menyn. */
  pending: number;
  /** Antal demoordrar — visas som en banner över varje sida. */
  demoCount?: number;
  children: ReactNode;
}

export function AdminShell({ pending, demoCount = 0, children }: AdminShellProps) {
  const pathname = usePathname();
  const isCurrent = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));

  const logout = async () => {
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => undefined);
    window.location.href = "/";
  };

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandEyebrow}>Återförsäljare</span>
          <span className={styles.brandName}>namnskylt.com</span>
        </div>
        <nav className={styles.nav} aria-label="Adminmeny">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.navLink}
              aria-current={isCurrent(item.href) ? "page" : undefined}
            >
              <NavIcon name={item.icon} />
              {item.label}
              {item.icon === "orders" && pending > 0 && <span className={styles.navBadge}>{pending}</span>}
            </Link>
          ))}
        </nav>
        <div className={styles.sidebarFoot}>
          <span>Inloggad som återförsäljare</span>
          <button type="button" className={styles.logout} onClick={() => void logout()}>
            Logga ut
          </button>
        </div>
      </aside>
      <div className={styles.main}>
        {demoCount > 0 && <DemoBanner count={demoCount} />}
        {children}
      </div>
    </div>
  );
}
