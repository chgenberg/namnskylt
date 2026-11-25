import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { SiteFooter } from "@/components/site-footer";
import { TopicPage } from "@/features/topics/topic-page";
import { siteFacts } from "@/lib/seo/facts";
import { pageMetadata } from "@/lib/seo/page";
import { faqPage, pageGraph, products } from "@/lib/seo/structured-data";
import { encodeShareCode } from "@/lib/share/share-link";
import { TOPIC_EXAMPLES } from "@/lib/topics/examples";
import { getTopic, TOPIC_HUB, topicPath, type Topic } from "@/lib/topics/model";

interface TopicRouteProps {
  params: Promise<{ slug: string }>;
}

/** Ritas när den efterfrågas, så att priserna följer prismodellen i drift. Okända adresser ger 404 (`getTopic`). */
export const dynamic = "force-dynamic";

const sitePage = (topic: Topic) => ({ path: topicPath(topic), title: topic.title, description: topic.description });

export async function generateMetadata({ params }: TopicRouteProps): Promise<Metadata> {
  const topic = getTopic((await params).slug);
  return topic ? pageMetadata(sitePage(topic)) : {};
}

export default async function TopicRoute({ params }: TopicRouteProps) {
  const topic = getTopic((await params).slug);
  const example = topic ? TOPIC_EXAMPLES[topic.slug] : undefined;
  if (!topic || !example) notFound();
  const facts = await siteFacts();
  const related = topic.related.map(getTopic).filter((item): item is Topic => item !== null);
  const exampleHref = `/skapa?d=${(await encodeShareCode(example)).code}`;
  const ownProducts = products(facts).filter((product) =>
    topic.materials.some((material) => String(product["@id"]).endsWith(`-${material}`)),
  );
  return (
    <main>
      <JsonLd
        data={pageGraph(sitePage(topic), {
          trail: [{ name: "Namnskyltar", path: TOPIC_HUB.path }],
          name: topic.name,
          parts: [...ownProducts, faqPage(topic.faq(facts))],
        })}
      />
      <TopicPage topic={topic} facts={facts} exampleHref={exampleHref} related={related} />
      <SiteFooter />
    </main>
  );
}
