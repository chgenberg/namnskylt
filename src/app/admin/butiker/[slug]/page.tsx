import Link from "next/link";
import { notFound } from "next/navigation";
import { adminTenant } from "@/features/admin/guard";
import { CopyField, ShopDomainForm, ShopLookForm, ShopPriceForm } from "@/features/admin/shop-settings";
import styles from "@/features/admin/admin.module.css";
import { formatSek } from "@/features/orders/format";
import { siteOrigin } from "@/lib/http/origin";
import { SHOP_ROOT_DOMAIN } from "@/lib/shops/host";
import { SHOP_SLUG } from "@/lib/shops/model";
import { getShop, getShopOptions } from "@/lib/shops/repository";
import { shopStats } from "@/lib/shops/stats";
import { isOwner } from "@/lib/tenants/model";

const STATS_DAYS = 30;
/** Återförsäljarens CNAME pekar hit; vi kopplar adressen och certifikatet i Railway. */
const CNAME_TARGET = `butiker.${SHOP_ROOT_DOMAIN}`;

export default async function ShopDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const tenant = await adminTenant();
  if (!tenant || !isOwner(tenant)) return null;
  const { slug } = await params;
  if (!SHOP_SLUG.test(slug)) notFound();
  const [shop, options, stats, origin] = await Promise.all([getShop(slug), getShopOptions(slug), shopStats(slug, STATS_DAYS), siteOrigin()]);
  if (!shop) notFound();

  const subdomain = `https://${shop.slug}.${SHOP_ROOT_DOMAIN}`;
  const embed = `<div data-namnskylt="${shop.slug}"></div>\n<script src="${origin}/embed.js" async></script>`;
  const peak = Math.max(1, ...stats.days.map((d) => d.visits + d.embeds));
  const { totals } = stats;

  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>
            <Link href="/admin/butiker">Butiker</Link> · {shop.sourceUrl}
          </p>
          <h1 className={styles.pageTitle}>{shop.profile.name}</h1>
          <p className={styles.pageLead}>Utseende, priser, adress och inbäddning — allt syns i butiken direkt när det sparas.</p>
        </div>
        <a href={`/butik/${shop.slug}`} target="_blank" rel="noreferrer" className="btn btn--primary">
          Öppna butiken ↗
        </a>
      </header>

      <section className={styles.panel} aria-labelledby="statistik">
        <h2 id="statistik" className={styles.sectionTitle}>
          Senaste {STATS_DAYS} dagarna
        </h2>
        <div className={styles.kpis}>
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>Besök i butiken</span>
            <span className={styles.kpiValue}>{totals.visits}</span>
          </div>
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>Visningar på deras sajt</span>
            <span className={styles.kpiValue}>{totals.embeds}</span>
          </div>
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>Öppnade skyltmotorn</span>
            <span className={styles.kpiValue}>{totals.designs}</span>
          </div>
          <div className={styles.kpi} data-tone="navy">
            <span className={styles.kpiLabel}>Ordrar</span>
            <span className={styles.kpiValue}>{totals.orders}</span>
            <span className={styles.kpiHint}>
              {formatSek(totals.salesSek)}
              {stats.conversionPercent !== null && ` · ${stats.conversionPercent} % av besöken`}
            </span>
          </div>
        </div>
        <div className={styles.dayBars} role="img" aria-label={`Besök per dag, högst ${peak}`}>
          {stats.days.map((day) => (
            <span
              key={day.date}
              className={styles.dayBar}
              style={{ height: `${Math.max(2, ((day.visits + day.embeds) / peak) * 100)}%` }}
              data-order={day.orders > 0 || undefined}
              title={`${day.date}: ${day.visits} besök, ${day.embeds} på deras sajt, ${day.designs} i motorn, ${day.orders} ordrar`}
            />
          ))}
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="utseende">
        <h2 id="utseende" className={styles.sectionTitle}>
          Utseende
        </h2>
        <ShopLookForm
          slug={shop.slug}
          logo={shop.profile.logo}
          primaryColor={shop.profile.primaryColor}
          accentColor={shop.profile.accentColor}
          logoOptions={options?.logos ?? []}
          colorOptions={options?.colors ?? []}
        />
      </section>

      <section className={styles.panel} aria-labelledby="priser">
        <h2 id="priser" className={styles.sectionTitle}>
          Priser i butiken
        </h2>
        <ShopPriceForm slug={shop.slug} priceList={shop.priceList ?? null} />
      </section>

      <section className={styles.panel} aria-labelledby="adress">
        <h2 id="adress" className={styles.sectionTitle}>
          Adress
        </h2>
        <div className={styles.form}>
          <CopyField label="Underadress — fungerar för alla butiker" value={subdomain} />
          <ShopDomainForm slug={shop.slug} domain={shop.domain ?? null} />
          <p className={styles.muted}>
            Återförsäljaren lägger in en CNAME-post från sin adress till <code>{CNAME_TARGET}</code>. När posten finns kopplar vi
            adressen och certifikatet — sedan visar den butiken.
          </p>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="inbaddning">
        <h2 id="inbaddning" className={styles.sectionTitle}>
          På återförsäljarens egen sajt
        </h2>
        <div className={styles.form}>
          <CopyField label="Klistra in där skylten ska synas" value={embed} multiline />
          <p className={styles.muted}>
            Skylten snurrar i butikens färger och typsnitt; Skapa skylt öppnar butiken i hela fönstret.{" "}
            <a href={`/inbaddning/${shop.slug}`} target="_blank" rel="noreferrer">
              Förhandsvisa ↗
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
