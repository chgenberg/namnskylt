import type { ShopContent } from "./content";
import type { Shop } from "./model";

export interface ShopContact {
  name: string;
  email: string;
  phone: string;
  address: string;
  website: string;
}

export function shopContact(shop: Pick<Shop, "profile">): ShopContact {
  const { name, email, phone, address, website } = shop.profile;
  return { name, email, phone, address: address.replace(/\s*\n\s*/g, ", "), website };
}

/** Dagens datum i svensk tid, för kampanjremsornas slutdatum. */
export function todayInSweden(now = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}

/** Menyn: sidorna efter startsidan, och stegens id för ankarlänken när det inte finns några. */
export function shopMenu(content: ShopContent): { pages: { path: string; label: string }[]; stepsId: string | null } {
  const [start, ...rest] = content.pages;
  return {
    pages: rest.map((p) => ({ path: p.path, label: p.label })),
    stepsId: start?.blocks.find((b) => b.kind === "steps")?.id ?? null,
  };
}

/** "Så funkar det" under skrivrutan: stegen på startsidan, eller ingen länk. */
export function howItWorksHref(content: ShopContent, slug: string, onStartPage: boolean): string | null {
  const { stepsId } = shopMenu(content);
  if (!stepsId) return null;
  return onStartPage ? `#${stepsId}` : `/butik/${slug}#${stepsId}`;
}
