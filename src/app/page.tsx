import { JsonLd } from "@/components/json-ld";
import { SiteFooter } from "@/components/site-footer";
import { HomeFaq } from "@/features/home/faq";
import { HomeHero } from "@/features/home/home-hero";
import { HowItWorks } from "@/features/home/how-it-works";
import { ResellerInvite } from "@/features/home/reseller-invite";
import { siteFacts } from "@/lib/seo/facts";
import { pageMetadata, SITE_PAGES } from "@/lib/seo/page";
import { faqItems } from "@/lib/seo/site-facts";
import { faqPage, graph, products, siteOrganization, webPage, website, workshopOrganization } from "@/lib/seo/structured-data";
import styles from "./page.module.css";

const PAGE = SITE_PAGES.home;

export const metadata = pageMetadata(PAGE);

export default async function HomePage() {
  const facts = await siteFacts();
  return (
    <main data-home className={styles.home}>
      {/* Vem som står bakom sajten, produkterna och de vanliga frågorna, för sökmotorer och AI-tjänster. */}
      <JsonLd data={graph([siteOrganization(), workshopOrganization(), website(), webPage(PAGE), ...products(facts), faqPage(facts)])} />
      <div className={styles.frame} aria-hidden="true" />
      <div className={styles.main}>
        <HomeHero />
      </div>
      <HowItWorks />
      <HomeFaq items={faqItems(facts)} />
      <ResellerInvite />
      <SiteFooter />
    </main>
  );
}
