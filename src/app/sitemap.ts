import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/http/public-url";
import { sitemapFor } from "@/lib/seo/crawl";
import { gateEnabled } from "@/lib/site-gate/token";

/** Läses när den efterfrågas, inte vid bygget, så att sajtspärren i driftens miljö avgör. */
export const dynamic = "force-dynamic";

/** De publika sidorna. Tom så länge sajten är låst med sajtlösenordet. */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapFor(gateEnabled(), publicOrigin());
}
