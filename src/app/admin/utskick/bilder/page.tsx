import Link from "next/link";
import adminStyles from "@/features/admin/admin.module.css";
import { adminTenant } from "@/features/admin/guard";
import { REVIEW_LABEL } from "@/features/outreach/labels";
import styles from "@/features/outreach/outreach.module.css";
import { PersonaReview } from "@/features/outreach/persona-review";
import { assetPath } from "@/lib/outreach/badge-asset";
import { ASSET_REVIEWS, type AssetReview } from "@/lib/outreach/model";
import * as store from "@/lib/outreach/repository";
import { isOwner } from "@/lib/tenants/model";

export const dynamic = "force-dynamic";

export default async function PersonaReviewPage({ searchParams }: { searchParams: Promise<{ visa?: string }> }) {
  const tenant = await adminTenant();
  if (!tenant || !isOwner(tenant)) return null;
  const requested = (await searchParams).visa;
  const review: AssetReview = ASSET_REVIEWS.find((r) => r === requested) ?? "pending";
  const sql = store.outreachDb();
  const [personas, all] = await Promise.all([store.personasByReview(sql, review), store.personaReviewByLead(sql)]);
  const count = (r: AssetReview) => [...all.values()].filter((v) => v === r).length;

  return (
    <>
      <header className={adminStyles.pageHead}>
        <div>
          <p className={adminStyles.eyebrow}>
            <Link className={adminStyles.link} href="/admin/utskick">
              Utskick
            </Link>
          </p>
          <h1 className={adminStyles.pageTitle}>Granska bilderna</h1>
          <p className={adminStyles.pageLead}>
            Jämför loggan och texten på personens skylt med den riktiga skylten bredvid. Bara godkända bilder följer med
            i mejlet — för övriga visar mejlet skylten.
          </p>
        </div>
      </header>

      <nav className={adminStyles.filters} aria-label="Granskningsstatus" style={{ marginBottom: "var(--space-5)" }}>
        {ASSET_REVIEWS.map((r) => (
          <Link
            key={r}
            className={`${adminStyles.filter} ${styles.tab}`}
            aria-current={r === review ? "page" : undefined}
            href={`/admin/utskick/bilder?visa=${r}`}
          >
            {REVIEW_LABEL[r]} <span className={adminStyles.filterCount}>{count(r)}</span>
          </Link>
        ))}
      </nav>

      {personas.length === 0 ? (
        <div className={adminStyles.empty}>
          <strong>Inga bilder här</strong>
          <span>Personbilderna görs av pnpm outreach:prepare.</span>
        </div>
      ) : (
        <ul className={styles.reviewGrid}>
          {personas.map((p) => (
            <li key={p.id} className={styles.reviewCard}>
              {/* eslint-disable-next-line @next/next/no-img-element -- färdig JPEG från utskicket */}
              <img className={styles.reviewPhoto} src={assetPath(p.id)} width={p.width} height={p.height} alt={`AI-genererad person åt ${p.companyName}`} loading="lazy" />
              {p.heroId && (
                // eslint-disable-next-line @next/next/no-img-element -- färdig JPEG från utskicket
                <img className={styles.reviewBadge} src={assetPath(p.heroId)} alt="Den riktiga skylten" loading="lazy" />
              )}
              <div className={styles.reviewBody}>
                <Link className={adminStyles.link} href={`/admin/utskick/${p.leadId}`}>
                  {p.companyName}
                </Link>
                <PersonaReview assetId={p.id} review={p.review} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
