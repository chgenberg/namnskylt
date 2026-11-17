import Image from "next/image";
import Link from "next/link";
import { currentTenant } from "@/lib/reseller-auth/session";
import { isOwner } from "@/lib/tenants/model";
import styles from "./site-header.module.css";

const NAV = [
  { href: "/#sa-funkar-det", label: "Så funkar det" },
  { href: "/inspiration", label: "Inspirationsbank" },
] as const;

export async function SiteHeader() {
  const tenant = await currentTenant();
  // Två skilda inlogg: admin är namnskylt.com, övriga är återförsäljare.
  const admin = tenant !== null && isOwner(tenant);
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
          {tenant ? (
            <Link href="/admin" className={`${styles.link} ${styles.admin}`}>
              <span className={styles.avatar} aria-hidden>
                {admin ? "A" : "Å"}
              </span>
              <span className={styles.adminText}>{admin ? "Admin" : "Mina sidor"}</span>
            </Link>
          ) : (
            <Link href="/aterforsaljare" className={`${styles.link} ${styles.login}`}>
              Logga in
            </Link>
          )}
          {/* Här sätter skyltmotorn varukorgens symbol (`CartButton`). På övriga sidor är platsen tom. */}
          <div data-cart-slot className={styles.cartSlot} />
        </nav>
      </div>
    </header>
  );
}
