import { JsonLd } from "@/components/json-ld";
import { SiteFooter } from "@/components/site-footer";
import { TopicsHub } from "@/features/topics/topics-hub";
import { pageMetadata } from "@/lib/seo/page";
import { pageGraph } from "@/lib/seo/structured-data";
import { SITE_ORIGIN } from "@/lib/seo/site-facts";
import { TOPIC_HUB, TOPICS, topicPath } from "@/lib/topics/model";

export const metadata = pageMetadata(TOPIC_HUB);

/** Översikten över sidorna om namnskyltar, efter skylt och efter bransch. */
export default function NamnskyltarPage() {
  const list = {
    "@type": "ItemList",
    itemListElement: TOPICS.map((topic, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: topic.title,
      url: `${SITE_ORIGIN}${topicPath(topic)}`,
    })),
  };
  return (
    <main>
      <JsonLd data={pageGraph(TOPIC_HUB, { type: "CollectionPage", name: "Namnskyltar", parts: [list] })} />
      <TopicsHub />
      <SiteFooter />
    </main>
  );
}
