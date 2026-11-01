"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./shop.module.css";

export interface NavPage {
  path: string;
  label: string;
}

interface ShopNavProps {
  base: string;
  pages: readonly NavPage[];
  /** Butiken har inga egna sidor än: ankarlänkarna den alltid haft — till stegen om de finns. */
  stepsId: string | null;
  variant: "header" | "strip";
}

/** Butikens meny: egna sidor (Om oss, Kontakt …) i den ordning återförsäljaren valt. */
export function ShopNav({ base, pages, stepsId, variant }: ShopNavProps) {
  const pathname = usePathname();
  const items =
    pages.length > 0
      ? pages.map((p) => ({ href: `${base}/${p.path}`, label: p.label, current: pathname === `${base}/${p.path}` }))
      : [
          ...(stepsId ? [{ href: `${base}#${stepsId}`, label: "Så funkar det", current: false }] : []),
          { href: "#kontakt", label: "Kontakt", current: false },
        ];
  if (variant === "strip") {
    if (pages.length === 0) return null;
    return (
      <nav className={styles.pageNav} aria-label="Butikens sidor">
        <Link href={base} aria-current={pathname === base ? "page" : undefined}>
          Hem
        </Link>
        {items.map((item) => (
          <Link key={item.href} href={item.href} aria-current={item.current ? "page" : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <>
      {items.map((item) =>
        item.href.startsWith("#") ? (
          <a key={item.href} href={item.href} className={styles.navLink}>
            {item.label}
          </a>
        ) : (
          <Link key={item.href} href={item.href} className={styles.navLink} aria-current={item.current ? "page" : undefined}>
            {item.label}
          </Link>
        ),
      )}
    </>
  );
}
