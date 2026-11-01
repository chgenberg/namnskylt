import { IMAGE_ID, lockStartPage, newId, pathFor, shopContentSchema, type ShopContent } from "./content";

/**
 * AI:ns förslag lagat så att det håller: kända bilder, unika id:n, giltiga
 * adresser och startsidan först. Allt annat avgör samma schema som editorn.
 */
export function repairAiContent(raw: unknown, imageIds: ReadonlySet<string>): ShopContent | null {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { pages?: unknown }).pages)) return null;
  const seen = new Set<string>();
  const freshId = (value: unknown, prefix: string) => {
    const id = typeof value === "string" && /^[A-Za-z0-9_-]{4,32}$/.test(value) && !seen.has(value) ? value : newId(prefix);
    seen.add(id);
    return id;
  };
  const paths: string[] = [];
  const pages = ((raw as { pages: unknown[] }).pages ?? []).flatMap((page, index) => {
    if (!page || typeof page !== "object") return [];
    const p = page as { id?: unknown; path?: unknown; label?: unknown; blocks?: unknown };
    const label = typeof p.label === "string" && p.label.trim() ? p.label.trim().slice(0, 30) : index === 0 ? "Hem" : "Sida";
    const path = index === 0 ? "" : pathFor(typeof p.path === "string" && p.path ? p.path : label, paths);
    paths.push(path);
    const blocks = (Array.isArray(p.blocks) ? p.blocks : []).flatMap((block) => {
      if (!block || typeof block !== "object") return [];
      const b = { ...(block as Record<string, unknown>) };
      b.id = freshId(b.id, "b");
      if ((b.kind === "imageText" || b.kind === "header") && (typeof b.imageId !== "string" || !imageIds.has(b.imageId))) b.imageId = null;
      if (b.kind === "gallery") {
        b.images = (Array.isArray(b.images) ? b.images : []).filter((id): id is string => typeof id === "string" && IMAGE_ID.test(id) && imageIds.has(id));
      }
      return [b];
    });
    return [{ id: freshId(p.id, "p"), path, label, blocks }];
  });
  const parsed = shopContentSchema.safeParse({ version: 2, pages });
  return parsed.success ? lockStartPage(parsed.data) : null;
}
