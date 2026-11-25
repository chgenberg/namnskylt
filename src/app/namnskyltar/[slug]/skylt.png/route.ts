import { renderMailBadge } from "@/lib/quotes/mail-image";
import { TOPIC_EXAMPLES } from "@/lib/topics/examples";

/** Bilderna ritas en gång per process: exempelskyltarna ändras bara med koden. */
const cache = new Map<string, Promise<Buffer>>();

/** Exempelskylten på en sida om namnskyltar, ritad av motorn som offertmejlets bild (1056 × 528 px). */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = TOPIC_EXAMPLES[slug];
  if (!doc) return new Response("Finns inte", { status: 404 });
  let image = cache.get(slug);
  if (!image) {
    image = renderMailBadge(doc);
    cache.set(slug, image);
    image.catch(() => cache.delete(slug));
  }
  return new Response(new Uint8Array(await image), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
  });
}
