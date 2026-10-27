import { canViewAdmin } from "@/features/admin/guard";
import { ShopBuilder } from "@/features/admin/shop-builder";
import { ShopCardActions } from "@/features/admin/shop-card-actions";
import styles from "@/features/admin/admin.module.css";
import { formatDate } from "@/features/orders/format";
import { siteOrigin } from "@/lib/http/origin";
import { listShops } from "@/lib/shops/repository";

/** Bygget läser hemsidan via en server action härifrån och kan ta en halv minut. */
export const maxDuration = 60;

export default async function ShopsPage() {
  if (!(await canViewAdmin())) return null;
  const [shops, origin] = await Promise.all([listShops(), siteOrigin()]);
  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Butiker</p>
          <h1 className={styles.pageTitle}>Demobutiker</h1>
          <p className={styles.pageLead}>
            Klistra in en återförsäljares hemsida — vi bygger en butik med deras logga, färger och typsnitt runt
            skyltmotorn. Ordrarna landar här, märkta med butiken.
          </p>
        </div>
      </header>

      <section className={styles.panel} style={{ marginBottom: "var(--space-5)" }}>
        <h2 className={styles.sectionTitle}>Bygg en butik</h2>
        <div style={{ marginTop: "var(--space-3)" }}>
          <ShopBuilder />
        </div>
      </section>

      {shops.length === 0 ? (
        <div className={styles.empty}>
          <strong>Inga butiker än</strong>
          <span>Den första tar ungefär tjugo sekunder att bygga.</span>
        </div>
      ) : (
        <div className={styles.shopGrid}>
          {shops.map(({ shop, orders }) => (
            <article key={shop.slug} className={styles.shopCard}>
              <div
                className={styles.shopBanner}
                style={{ background: `linear-gradient(135deg, ${shop.profile.primaryColor}, ${shop.profile.accentColor})` }}
              >
                <div className={styles.shopLogo}>
                  {shop.profile.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data-URL ur butikens profil
                    <img src={shop.profile.logo} alt="" />
                  ) : (
                    <strong>{shop.profile.name}</strong>
                  )}
                </div>
              </div>
              <div className={styles.shopBody}>
                <h3 className={styles.cardTitle}>{shop.profile.name}</h3>
                <p className={styles.muted}>
                  {shop.sourceUrl} · {orders} {orders === 1 ? "order" : "ordrar"} · {formatDate(shop.createdAt)}
                </p>
                <div className={styles.shopTraits}>
                  <span className={styles.swatch} style={{ background: shop.profile.primaryColor }} title={shop.profile.primaryColor} />
                  <span className={styles.swatch} style={{ background: shop.profile.accentColor }} title={shop.profile.accentColor} />
                  <span className={styles.muted}>
                    {shop.font.family ? `${shop.font.family}${shop.font.google ? "" : " (ersatt)"}` : "Sajtens typsnitt"}
                  </span>
                </div>
                <ShopCardActions slug={shop.slug} name={shop.profile.name} url={`${origin}/butik/${shop.slug}`} />
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
