"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { DemoBanner } from "./demo-data-controls";
import type { AdminNavIcon, AdminNavItem } from "./nav-item";
import styles from "./admin.module.css";

const ICON: Record<AdminNavIcon, ReactNode> = {
  overview: <path d="M3 3h6v8H3zM11 3h6v4h-6zM11 9h6v8h-6zM3 13h6v4H3z" />,
  orders: <path d="M4 3h12v14H4zM7 7h6M7 10h6M7 13h4" />,
  quotes: <path d="M5 2.5h7l3.5 3.5v11.5h-10.5zM12 2.5V6h3.5M7.5 10h5M7.5 13h3" />,
  customers: <path d="M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 17c0-3 2.2-5 5-5s5 2 5 5M14 9a2.5 2.5 0 1 0 0-5M15 12c2 .4 3 2.2 3 5" />,
  stats: <path d="M3 17h14M5 14V9M9 14V5M13 14v-3M17 14V7" />,
  export: <path d="M10 3v10M6 9l4 4 4-4M4 17h12" />,
  purchase: <path d="M3 10.5V3h7.5l6.5 6.5-7.5 7.5zM7 7h.01" />,
  shops: <path d="M3 7.5 4.5 3h11L17 7.5M3 7.5h14M3 7.5c0 1.4 1.1 2.5 2.3 2.5s2.4-1.1 2.4-2.5c0 1.4 1 2.5 2.3 2.5s2.3-1.1 2.3-2.5c0 1.4 1.1 2.5 2.4 2.5S17 8.9 17 7.5M4.5 10v7h11v-7M8 17v-4h4v4" />,
  outreach: <path d="M2.5 5.5h15v10h-15zM2.5 5.5l7.5 6 7.5-6" />,
  split: <path d="M9 3.5a7 7 0 1 0 7.5 7.5H9zM12 2.6a6.5 6.5 0 0 1 5.4 5.4H12z" />,
  workshop: <path d="M2.5 17V8.5l4.5 3v-3l4.5 3V4h3.5v13zM2.5 17h15M6 14h1.5M10 14h1.5" />,
  resellers: <path d="M3 17V6.5L10 3l7 3.5V17M3 17h14M7 17v-4h6v4M7 9.5h.01M10 9.5h.01M13 9.5h.01" />,
  ops: <path d="M2.5 10.5h3.5l2-5.5 3.5 10 2-4.5h4" />,
  settings: <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" />,
};

function NavIcon({ name }: { name: AdminNavIcon }) {
  return (
    <span className={styles.navIcon} aria-hidden="true">
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {ICON[name]}
      </svg>
    </span>
  );
}

/** Så ofta panelen frågar servern om nya besked medan den är öppen. */
const NOTICE_POLL_MS = 60_000;

/**
 * Antalet olästa besked, hållet aktuellt medan panelen är öppen: servern frågas
 * en gång i minuten och när fliken visas igen. Antalet står också först i
 * flikens titel, så att det syns när panelen ligger i en flik i bakgrunden.
 */
function useUnreadNotices(fromServer: number): number {
  const [unread, setUnread] = useState(fromServer);
  const [seenFromServer, setSeenFromServer] = useState(fromServer);
  // Ett nytt antal från servern, till exempel efter att besked märkts som lästa, gäller före det senast hämtade.
  if (seenFromServer !== fromServer) {
    setSeenFromServer(fromServer);
    setUnread(fromServer);
  }

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const response = await fetch("/api/admin/notices", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { unread?: unknown };
        if (!stopped && typeof data.unread === "number") setUnread(data.unread);
      } catch {
        // Nätet är nere. Nästa försök går om en minut.
      }
    };
    const whenShown = () => {
      if (document.visibilityState === "visible") void check();
    };
    const timer = window.setInterval(() => void check(), NOTICE_POLL_MS);
    document.addEventListener("visibilitychange", whenShown);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", whenShown);
    };
  }, []);

  useEffect(() => {
    const apply = () => {
      const title = document.title.replace(/^\(\d+\) /, "");
      const wanted = unread > 0 ? `(${unread}) ${title}` : title;
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    // Sidans titel sätts om när en ny sida visas, och vid första laddningen efter att det här har körts.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [unread]);

  return unread;
}

interface AdminShellProps {
  /** Menyn för den inloggade, byggd på servern (`adminNav`). Adminens sidor finns aldrig i klientkoden. */
  nav: AdminNavItem[];
  /** Olästa besked: en kund har svarat eller beställt. Visas som siffra på Översikt. */
  unread?: number;
  /** Antal demoordrar — visas som en banner över varje sida. */
  demoCount?: number;
  /** Företagets namn från inställningarna. */
  companyName?: string;
  /** Admin-inlogget, alltså namnskylt.com själv. Annars en återförsäljare. */
  owner?: boolean;
  children: ReactNode;
}

export function AdminShell({ nav, unread = 0, demoCount = 0, companyName = "namnskylt.com", owner = false, children }: AdminShellProps) {
  const pathname = usePathname();
  const unreadNow = useUnreadNotices(unread);
  const isCurrent = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));

  const logout = async () => {
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => undefined);
    window.location.href = "/";
  };

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandEyebrow}>{owner ? "Admin" : "Återförsäljare"}</span>
          <span className={styles.brandName}>{companyName}</span>
        </div>
        <nav className={styles.nav} aria-label="Adminmeny">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.navLink}
              aria-current={isCurrent(item.href) ? "page" : undefined}
            >
              <NavIcon name={item.icon} />
              {item.label}
              {item.icon === "overview" && unreadNow > 0 && (
                <span className={styles.navBadge} data-tone="news" aria-label={`${unreadNow} nya besked`}>
                  {unreadNow}
                </span>
              )}
              {Boolean(item.badge) && <span className={styles.navBadge}>{item.badge}</span>}
            </Link>
          ))}
        </nav>
        <div className={styles.sidebarFoot}>
          <span>{owner ? "Inloggad som admin" : "Inloggad som återförsäljare"}</span>
          <button type="button" className={styles.logout} onClick={() => void logout()}>
            <span className={styles.navIcon} aria-hidden="true">
              <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 5 17h3M12.5 13.5 16 10l-3.5-3.5M16 10H8" />
              </svg>
            </span>
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
