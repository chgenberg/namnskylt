import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { InspirationGallery } from "@/features/inspiration/inspiration-gallery";
import styles from "@/features/inspiration/inspiration.module.css";

export const metadata: Metadata = {
  title: "Inspirationsbank",
  description:
    "Åtta namnskyltar för kända svenska företag — material, form och färg som följer varumärket. Klicka på ett foto för att se hur skylten är uppbyggd.",
};

export default function InspirationPage() {
  return (
    <main>
      <div className={`container ${styles.page}`}>
        <header className={styles.intro}>
          <p className="eyebrow">Inspirationsbank</p>
          <h1 className={styles.title}>Så ser en namnskylt ut på riktigt</h1>
          <p className={styles.lede}>
            Åtta svenska varumärken, åtta material. Klicka på ett foto för att se skylten, färgen och
            hur du gör en liknande.
          </p>
        </header>
        <InspirationGallery />
      </div>
      <SiteFooter />
    </main>
  );
}
