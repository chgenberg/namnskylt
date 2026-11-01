import type { FontId } from "@/engine";
import { HomeHero } from "@/features/home/home-hero";
import type { Block } from "@/lib/shops/content";
import { ShopBlocks, type BlockEditing, type ShopContact } from "./shop-blocks";
import styles from "./shop.module.css";

interface ShopPageViewProps {
  slug: string;
  name: string;
  badgeFont: FontId;
  contact: ShopContact;
  blocks: readonly Block[];
  today: string;
  editing?: BlockEditing;
  /** Stegen på startsidan, för länken "Så funkar det" under skrivrutan. */
  howHref: string | null;
  /** Startsidan har skyltmotorns hero; undersidorna bygger återförsäljaren själv. */
  hero: boolean;
}

/** Startsidan: skyltmotorns hero och stegen, likadan i alla butiker. Undersidorna: bara återförsäljarens block. */
export function ShopPageView({ slug, name, badgeFont, contact, blocks, today, editing, howHref, hero }: ShopPageViewProps) {
  if (!hero) {
    return (
      <div className={styles.subpage}>
        <ShopBlocks slug={slug} blocks={blocks} contact={contact} today={today} editing={editing} />
      </div>
    );
  }
  return (
    <>
      <div className={styles.heroStage}>
        <div className={styles.glow} aria-hidden="true" />
        <HomeHero
          createPath={`/butik/${slug}/skapa`}
          eyebrow={`Graverade namnskyltar från ${name}`}
          branded
          badgeFont={badgeFont}
          howHref={howHref}
        />
      </div>
      <ShopBlocks slug={slug} blocks={blocks} contact={contact} today={today} editing={editing} />
    </>
  );
}
