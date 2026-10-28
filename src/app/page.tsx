import { SiteFooter } from "@/components/site-footer";
import { HomeHero } from "@/features/home/home-hero";
import { HowItWorks } from "@/features/home/how-it-works";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main data-home className={styles.home}>
      <div className={styles.frame} aria-hidden="true" />
      <div className={styles.main}>
        <HomeHero />
      </div>
      <HowItWorks />
      <SiteFooter />
    </main>
  );
}
