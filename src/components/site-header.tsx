import Image from "next/image";
import Link from "next/link";
import styles from "./site-header.module.css";

const NAV = [
  { href: "/#borja", label: "Namnskyltar" },
  { href: "/#sa-funkar-det", label: "Så funkar det" },
  { href: "/#pins", label: "Pins", soon: true },
  { href: "/foretag", label: "För företag" },
] as const;

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="namnskylt.com — till startsidan">
          <Image
            src="/logo-namnskylt.png"
            alt="namnskylt.com"
            width={1024}
            height={328}
            priority
            className={styles.logo}
          />
        </Link>
        <nav aria-label="Huvudmeny" className={styles.nav}>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={styles.link}>
              {item.label}
              {"soon" in item && <span className={styles.soon}>Snart</span>}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
