import type { Metadata } from "next";
import { engravedRows } from "@/engine";
import { resellerPriceTable } from "@/engine/price-model";
import { preloadDesignerAssets } from "@/features/designer/assets";
import { Designer } from "@/features/designer/designer";
import { siteOrigin } from "@/lib/http/origin";
import { deliveryOptions } from "@/lib/orders/delivery-options";
import { databaseConfigured, getCustomer, getPriceModel } from "@/lib/orders/repository";
import { currentTenant } from "@/lib/reseller-auth/session";
import { genitive } from "@/lib/share/genitive";
import { decodeShareCode } from "@/lib/share/share-link";

interface SkapaPageProps {
  searchParams: Promise<{
    t?: string | string[];
    d?: string | string[];
    kund?: string | string[];
    offert?: string | string[];
    projekt?: string | string[];
  }>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
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
    alt: "Namnskylt",
  };
  const description = "Se skylten i 3D och gör din egen — tillverkad i Sverige.";
  return {
    title,
    description,
    openGraph: { title, description, images: [image], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

/** `?kund=` gäller bara inloggad återförsäljare — annars är det en vanlig besökare. */
async function resellerContext(customerId: string | undefined, quote: boolean, project: string | undefined) {
  const tenant = customerId && databaseConfigured() ? await currentTenant() : null;
  if (!customerId || !tenant) return undefined;
  const customer = await getCustomer(tenant, customerId);
  return customer
    ? {
        customerId: customer.id,
        customerName: customer.company ?? customer.name,
        mode: quote ? ("quote" as const) : ("order" as const),
        project: project?.trim().slice(0, 120) || undefined,
        purchaseList: resellerPriceTable(await getPriceModel()),
        delivery: await deliveryOptions(tenant, customer),
      }
    : undefined;
}

export default async function SkapaPage({ searchParams }: SkapaPageProps) {
  preloadDesignerAssets();
  const params = await searchParams;
  const shared = await decodeShareCode(first(params.d));
  const reseller = await resellerContext(first(params.kund), first(params.offert) === "1", first(params.projekt));
  return (
    <main>
      <Designer initialText={first(params.t) ?? ""} initialDoc={shared} reseller={reseller} />
    </main>
  );
}
