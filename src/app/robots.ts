import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/http/public-url";
import { robotsFor } from "@/lib/seo/crawl";
import { gateEnabled } from "@/lib/site-gate/token";

/** Läses när den efterfrågas, inte vid bygget, så att sajtspärren i driftens miljö avgör. */
export const dynamic = "force-dynamic";

/** Med sajtlösenordet på får ingen sökmotor in. Utan det gäller reglerna i `robotsFor`. */
export default function robots(): MetadataRoute.Robots {
  return robotsFor(gateEnabled(), publicOrigin());
}
