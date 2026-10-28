import { canViewAdmin } from "@/features/admin/guard";
import { ShopBuilder } from "@/features/admin/shop-builder";
import { ShopCardActions } from "@/features/admin/shop-card-actions";
import { ShopEmailPreview } from "@/features/admin/shop-email-preview";
import { ShopSearch } from "@/features/admin/shop-search";
import styles from "@/features/admin/admin.module.css";
import { formatDate } from "@/features/orders/format";
import { siteOrigin } from "@/lib/http/origin";
import { darkPlate, isLightLogo } from "@/lib/images/logo-tone";
import { listShops } from "@/lib/shops/repository";

/** Bygget läser hemsidan via en server action härifrån och kan ta en halv minut. */
export const maxDuration = 60;

/** Alla ord ska finnas i namnet, hemsidan eller länken — "profil göteborg" hittar rätt. */
function matches(haystack: string, query: string): boolean {
  const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const text = normalize(haystack);
  return normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

export default async function ShopsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  if (!(await canViewAdmin())) return null;
  const query = ((await searchParams).q ?? "").trim().slice(0, 100);
  const [allShops, origin] = await Promise.all([listShops(), siteOrigin()]);
  const shops = query
    ? allShops.filter(({ shop }) => matches(`${shop.profile.name} ${shop.sourceUrl} ${shop.slug} ${shop.profile.address}`, query))
    : allShops;
  const lightLogos = new Set(
    (await Promise.all(shops.map(async ({ shop }) => ((await isLightLogo(shop.profile.logo)) ? shop.slug : null)))).filter(
      (slug): slug is string => slug !== null,
    ),
  );
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
        <ShopEmailPreview shops={allShops.map(({ shop }) => ({ slug: shop.slug, name: shop.profile.name }))} />
      </header>

      <section className={styles.panel} style={{ marginBottom: "var(--space-5)" }}>
        <h2 className={styles.sectionTitle}>Bygg en butik</h2>
        <div style={{ marginTop: "var(--space-3)" }}>
          <ShopBuilder />
        </div>
      </section>

      {allShops.length > 0 && <ShopSearch query={query} shown={shops.length} total={allShops.length} />}

      {shops.length === 0 ? (
        <div className={styles.empty}>
          <strong>{query ? "Ingen butik matchar" : "Inga butiker än"}</strong>
          <span>{query ? `Inget matchar ”${query}”.` : "Den första tar ungefär tjugo sekunder att bygga."}</span>
        </div>
      ) : (
        <div className={styles.shopGrid}>
          {shops.map(({ shop, orders }) => (
            <article key={shop.slug} className={styles.shopCard}>
              <div
                className={styles.shopBanner}
                style={{ background: `linear-gradient(135deg, ${shop.profile.primaryColor}, ${shop.profile.accentColor})` }}
              >
                <div
                  className={styles.shopLogo}
                  style={lightLogos.has(shop.slug) ? { background: darkPlate(shop.profile.primaryColor) } : undefined}
                >
                  {shop.profile.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- liten logga, ingen optimering behövs
                    <img src={`/butik/${shop.slug}/logo`} alt="" loading="lazy" decoding="async" />
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
