import { jsonLdText } from "@/lib/seo/structured-data";

/** Strukturerad data i sidan (schema.org). Syns inte för besökaren. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(data) }} />;
}
