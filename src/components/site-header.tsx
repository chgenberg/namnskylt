import Image from "next/image";
import Link from "next/link";
import { isResellerSignedIn } from "@/lib/reseller-auth/session";
import styles from "./site-header.module.css";

const NAV = [
  { href: "/#sa-funkar-det", label: "Så funkar det" },
  { href: "/inspiration", label: "Inspirationsbank" },
] as const;

export async function SiteHeader() {
  const signedIn = await isResellerSignedIn();
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="namnskylt.com — till startsidan">
          <Image
            src="/logo-namnskylt.svg"
            alt="namnskylt.com"
            width={504}
            height={97}
            unoptimized
            priority
            className={styles.logo}
          />
        </Link>
        <nav aria-label="Huvudmeny" className={styles.nav}>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={styles.link}>
              {item.label}
            </Link>
          ))}
          {signedIn ? (
            <Link href="/admin" className={`${styles.link} ${styles.admin}`}>
              <span className={styles.avatar} aria-hidden>
                A
              </span>
              <span className={styles.adminText}>Admin</span>
            </Link>
          ) : (
            <Link href="/admin" className={`${styles.link} ${styles.login}`}>
              Logga in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
