import Image from "next/image";
import Link from "next/link";
import { accountPaths } from "@/lib/customer-auth/model";
import { currentCustomer } from "@/lib/customer-auth/session";
import { currentTenant } from "@/lib/reseller-auth/session";
import { isOwner } from "@/lib/tenants/model";
import styles from "./site-header.module.css";
import { SiteMenu } from "./site-menu";

const NAV = [
  { href: "/inspiration", label: "Inspirationsbank" },
  { href: "/om-oss", label: "Om oss" },
  { href: "/kontakt", label: "Kontakta oss" },
] as const;

export async function SiteHeader() {
  const tenant = await currentTenant();
  // Två skilda inlogg: admin är namnskylt.com, övriga är återförsäljare.
  const admin = tenant !== null && isOwner(tenant);
  // En slutkund har ett eget konto, skilt från panelens. "Logga in" går dit, och därifrån vidare till återförsäljarnas inlogg.
  const customer = tenant ? null : await currentCustomer(null);
  const account = accountPaths(null);
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
          <SiteMenu items={NAV} />
          {tenant ? (
            <Link href="/admin" className={`${styles.link} ${styles.admin}`}>
              <span className={styles.avatar} aria-hidden>
                {admin ? "A" : "Å"}
              </span>
              <span className={styles.adminText}>{admin ? "Admin" : "Mina sidor"}</span>
            </Link>
          ) : customer ? (
            <Link href={account.home} className={`${styles.link} ${styles.admin}`}>
              <span className={styles.avatar} aria-hidden>
                {(customer.profile.name || customer.email).charAt(0).toUpperCase()}
              </span>
              <span className={styles.adminText}>Mitt konto</span>
            </Link>
          ) : (
            <Link href={account.login} className={`${styles.link} ${styles.login}`}>
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
