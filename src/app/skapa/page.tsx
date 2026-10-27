import type { Metadata } from "next";
import { headers } from "next/headers";
import { engravedRows } from "@/engine";
import { preloadDesignerAssets } from "@/features/designer/assets";
import { Designer } from "@/features/designer/designer";
import { databaseConfigured, getCustomer, getPurchaseTerms } from "@/lib/orders/repository";
import { isResellerSignedIn } from "@/lib/reseller-auth/session";
import { genitive } from "@/lib/share/genitive";
import { decodeShareCode } from "@/lib/share/share-link";

interface SkapaPageProps {
  searchParams: Promise<{
    t?: string | string[];
    d?: string | string[];
    kund?: string | string[];
    offert?: string | string[];
  }>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Länkförhandsvisningar kräver absolut bildadress — samma värd som sidan hämtades från. */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto.split(",")[0]?.trim() ?? "https"}://${host.split(",")[0]?.trim() ?? host}`;
}

export async function generateMetadata({ searchParams }: SkapaPageProps): Promise<Metadata> {
  const code = first((await searchParams).d);
  const shared = await decodeShareCode(code);
  if (!shared || !code) return { title: "Skapa namnskylt" };

  const name = engravedRows(shared)[0]?.text.trim();
  const title = name ? `${genitive(name)} namnskylt` : "En delad namnskylt";
  const image = {
    url: `${await siteOrigin()}/api/share-image?d=${encodeURIComponent(code)}`,
    width: 1200,
    height: 630,
    alt: "Graverad namnskylt",
  };
  const description = "Se skylten i 3D och gör din egen — graverad i Sverige.";
  return {
    title,
    description,
    openGraph: { title, description, images: [image], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

/** `?kund=` gäller bara inloggad återförsäljare — annars är det en vanlig besökare. */
async function resellerContext(customerId: string | undefined, quote: boolean) {
  if (!customerId || !databaseConfigured() || !(await isResellerSignedIn())) return undefined;
  const [customer, purchase] = await Promise.all([getCustomer(customerId), getPurchaseTerms()]);
  return customer
    ? {
        customerId: customer.id,
        customerName: customer.company ?? customer.name,
        mode: quote ? ("quote" as const) : ("order" as const),
        purchase,
      }
    : undefined;
}

export default async function SkapaPage({ searchParams }: SkapaPageProps) {
  preloadDesignerAssets();
  const params = await searchParams;
  const shared = await decodeShareCode(first(params.d));
  const reseller = await resellerContext(first(params.kund), first(params.offert) === "1");
  return (
    <main>
      <Designer initialText={first(params.t) ?? ""} initialDoc={shared} reseller={reseller} />
    </main>
  );
}
