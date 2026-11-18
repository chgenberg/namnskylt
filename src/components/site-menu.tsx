"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./site-header.module.css";

interface SiteMenuProps {
  items: readonly { href: string; label: string }[];
}

/**
 * Sidhuvudets länkar. På en bred skärm står de på rad. På en smal ryms de inte
 * bredvid loggan, inloggningen och varukorgen, och ligger då bakom knappen Meny.
 */
export function SiteMenu({ items }: SiteMenuProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={root} className={styles.menu} data-open={open ? "" : undefined}>
      <button
        ref={button}
        type="button"
        className={styles.menuButton}
        aria-label="Meny"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((was) => !was)}
      >
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" className={styles.menuIcon}>
          <path d={open ? "M5 5l10 10M15 5L5 15" : "M3 6h14M3 10h14M3 14h14"} />
        </svg>
        <span className={styles.menuLabel} aria-hidden="true">
          Meny
        </span>
      </button>
      <div id={id} className={styles.menuLinks}>
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={styles.link}
            aria-current={pathname === item.href ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
