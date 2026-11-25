import { JsonLd } from "@/components/json-ld";
import { pageMetadata, SITE_PAGES } from "@/lib/seo/page";
import { pageGraph } from "@/lib/seo/structured-data";
import { SiteFooter } from "@/components/site-footer";
import { InspirationGallery } from "@/features/inspiration/inspiration-gallery";
import styles from "@/features/inspiration/inspiration.module.css";
import { INSPIRATION } from "@/lib/inspiration/catalog";
import { encodeShareCode } from "@/lib/share/share-link";

const PAGE = SITE_PAGES.inspiration;

export const metadata = pageMetadata(PAGE);

export default async function InspirationPage() {
  // Länken som öppnar varje exempel i skyltmotorn räknas här, så att sidan inte behöver något skript.
  const links = Object.fromEntries(
    await Promise.all(INSPIRATION.map(async (entry) => [entry.slug, `/skapa?d=${(await encodeShareCode(entry.doc)).code}`] as const)),
  );
  return (
    <main data-floating-header>
      <JsonLd data={pageGraph(PAGE, { type: "CollectionPage" })} />
      <div className={`container ${styles.page}`}>
        <header className={styles.intro}>
          <p className="eyebrow">Inspirationsbank</p>
          <h1 className={styles.title}>Så ser en namnskylt ut på riktigt</h1>
          <p className={styles.lede}>
            Åtta namnskyltar i metall och plast. Bredvid varje bild ser du valen på nära håll: ytan, formen och
            fästet.
          </p>
        </header>
        <InspirationGallery links={links} />
      </div>
      <SiteFooter />
    </main>
  );
}
