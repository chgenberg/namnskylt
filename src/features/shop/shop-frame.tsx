import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { companyFooter } from "@/lib/company/profile";
import { googleFontsHref, shopThemeVars, type Shop } from "@/lib/shops/model";
import styles from "./shop.module.css";

export const shopPath = (shop: Pick<Shop, "slug">, rest = "") => `/butik/${shop.slug}${rest}`;

/** Butikens skal: deras färger och typsnitt över hela sidan, deras logga och uppgifter runt om. */
export function ShopFrame({ shop, children }: { shop: Shop; children: ReactNode }) {
  const { profile } = shop;
  return (
    <div className={styles.frame} style={shopThemeVars(shop) as CSSProperties}>
      {shop.font.family && shop.font.google && (
        <>
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link rel="stylesheet" href={googleFontsHref(shop.font.family)} precedence="default" />
        </>
      )}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href={shopPath(shop)} className={styles.brand} aria-label={`${profile.name} — till startsidan`}>
            {profile.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- data-URL ur butikens profil
              <img src={profile.logo} alt={profile.name} className={styles.logo} />
            ) : (
              <span className={styles.brandName}>{profile.name}</span>
            )}
          </Link>
          <nav className={styles.nav} aria-label="Butiksmeny">
            <Link href={`${shopPath(shop)}#sa-funkar-det`} className={styles.navLink}>
              Så funkar det
            </Link>
            <a href="#kontakt" className={styles.navLink}>
              Kontakt
            </a>
            <Link href={shopPath(shop, "/skapa")} className={`btn btn--primary ${styles.navCta}`}>
              Skapa skylt
            </Link>
          </nav>
        </div>
      </header>
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
        <p className={styles.footerNote}>Graverade namnskyltar · Tillverkade i Sverige · Leverans inom 5 arbetsdagar</p>
      </footer>
    </div>
  );
}
