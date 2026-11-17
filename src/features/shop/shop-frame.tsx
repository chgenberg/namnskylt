import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { companyFooter } from "@/lib/company/profile";
import { googleFontsHref, shopThemeVars, shopWebFamilies, type Shop } from "@/lib/shops/model";
import { ShopNav, type NavPage } from "./shop-nav";
import styles from "./shop.module.css";

const shopPath = (shop: Pick<Shop, "slug">, rest = "") => `/butik/${shop.slug}${rest}`;

/** Butikens skal: deras färger och typsnitt över hela sidan, deras logga och uppgifter runt om. */
interface ShopFrameProps {
  shop: Shop;
  /** Vit logga på genomskinlig botten — läggs på en mörk platta så att den syns. */
  logoPlate: string | null;
  /** Butikens egna sidor efter startsidan. */
  pages: readonly NavPage[];
  stepsId: string | null;
  /** Länken till kundens konto i butiken: inloggningen, eller Mitt konto för den som är inloggad. Utelämnad i förhandsvisningen. */
  account?: { href: string; label: string };
  children: ReactNode;
}

export function ShopFrame({ shop, logoPlate, pages, stepsId, account, children }: ShopFrameProps) {
  const { profile } = shop;
  const webFamilies = shopWebFamilies(shop.font);
  return (
    <div className={styles.frame} style={shopThemeVars(shop) as CSSProperties}>
      {webFamilies.length > 0 && <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />}
      {webFamilies.map((family) => (
        <link key={family} rel="stylesheet" href={googleFontsHref(family)} precedence="default" />
      ))}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href={shopPath(shop)} className={styles.brand} aria-label={`${profile.name} — till startsidan`}>
            {profile.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- data-URL ur butikens profil
              <img
                src={profile.logo}
                alt={profile.name}
                className={styles.logo}
                data-plate={logoPlate ? "" : undefined}
                style={logoPlate ? { background: logoPlate } : undefined}
              />
            ) : (
              <span className={styles.brandName}>{profile.name}</span>
            )}
          </Link>
          <nav className={styles.nav} aria-label="Butiksmeny">
            <ShopNav base={shopPath(shop)} pages={pages} stepsId={stepsId} variant="header" />
            {account && (
              <Link href={account.href} className={styles.account} aria-label={account.label}>
                <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <circle cx="10" cy="7" r="3.2" />
                  <path d="M3.8 16.5c.9-2.8 3.3-4.3 6.2-4.3s5.3 1.5 6.2 4.3" strokeLinecap="round" />
                </svg>
                <span className={styles.accountText}>{account.label}</span>
              </Link>
            )}
            <Link href={shopPath(shop, "/skapa")} className={`btn btn--primary ${styles.navCta}`}>
              Skapa skylt
            </Link>
            {/* Här sätter skyltmotorn varukorgens symbol (`CartButton`). På övriga sidor är platsen tom. */}
            <div data-cart-slot className={styles.cartSlot} />
          </nav>
        </div>
      </header>
      <ShopNav base={shopPath(shop)} pages={pages} stepsId={stepsId} variant="strip" />
      {children}
      <footer id="kontakt" className={styles.footer}>
        <div className={styles.footerInner}>
          <div>
            <strong className={styles.footerName}>{profile.name}</strong>
            {profile.tagline && <p className={styles.footerTagline}>{profile.tagline}</p>}
          </div>
          <div className={styles.footerContact}>
            {companyFooter(profile)
              .slice(1)
              .map((line) => (
                <p key={line}>{line}</p>
              ))}
          </div>
        </div>
        <p className={styles.footerNote}>
          Namnskyltar i metall och plast · Tillverkade i Sverige · Leverans inom 5 arbetsdagar ·{" "}
          <Link href={shopPath(shop, "/villkor")}>Köpvillkor</Link>
        </p>
      </footer>
    </div>
  );
}
