import { siteFacts } from "@/lib/seo/facts";
import { llmsText } from "@/lib/seo/llms";
import { gateEnabled } from "@/lib/site-gate/token";

/** Läses när den efterfrågas, så att priserna följer prismodellen och sajtspärren i driftens miljö avgör. */
export const dynamic = "force-dynamic";

/** Sajten beskriven för AI-tjänster (llmstxt.org). Finns inte så länge sajten är låst med sajtlösenordet. */
export async function GET() {
  if (gateEnabled()) return new Response("Finns inte", { status: 404 });
  return new Response(llmsText(await siteFacts()), {
    headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
