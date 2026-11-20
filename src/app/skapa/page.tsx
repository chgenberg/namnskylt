import type { Metadata } from "next";
import { badgeGroups, engravedRows, toOfferedDocument } from "@/engine";
import { resellerPriceTable } from "@/engine/price-model";
import { preloadDesignerAssets } from "@/features/designer/assets";
import { Designer } from "@/features/designer/designer";
import { customerDesignerContext } from "@/lib/customer-auth/designer-context";
import { copyMarkOf } from "@/lib/designer-work/model";
import { siteOrigin } from "@/lib/http/origin";
import { EMPTY_DELIVERY_DRAFT } from "@/lib/orders/delivery";
import { deliveryOptions, resellerDeliveryDraft } from "@/lib/orders/delivery-options";
import { isErasedCustomer } from "@/lib/orders/erase-model";
import { customerChoiceRows } from "@/lib/orders/customer-choices";
import { databaseConfigured, getCustomer, getOrder, getPriceModel } from "@/lib/orders/repository";
import { quoteSellerView } from "@/lib/quotes/seller-view";
import { isOwner } from "@/lib/tenants/model";
import { paymentsConfigured } from "@/lib/payments/stripe";
import { currentTenant } from "@/lib/reseller-auth/session";
import { genitive } from "@/lib/share/genitive";
import { decodeShareCode } from "@/lib/share/share-link";

interface SkapaPageProps {
  searchParams: Promise<{
    t?: string | string[];
    d?: string | string[];
    kund?: string | string[];
    /** En tidigare order som ska öppnas för ändring, åt samma kund. */
    kopia?: string | string[];
    offert?: string | string[];
    projekt?: string | string[];
    /** En av den inloggade kundens ordrar som ska beställas igen. */
    igen?: string | string[];
    /** Kopians märke: varje klick på "Kopiera order" eller "Ändra först" är en egen kopia. */
    ny?: string | string[];
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

/**
 * Den som är inloggad i panelen lägger order och skapar offert åt sina kunder
 * i skyltmotorn. Med `?kund=` är kunden vald i förväg, från panelen. Utan den
 * väljs kunden bland de gamla, eller fylls i som ny, i varukorgen (besked av
 * ägaren 2026-11-17). Den som inte är inloggad är en vanlig besökare.
 */
async function resellerContext(customerId: string | undefined, quote: boolean, project: string | undefined, copyOf: string | undefined) {
  const tenant = databaseConfigured() ? await currentTenant() : null;
  if (!tenant) return undefined;
  const mode = quote ? ("quote" as const) : ("order" as const);
  // Inköpspriserna går bara till en inloggad återförsäljare. Admin ser slutkundens pris, som alla andra.
  const purchaseList = isOwner(tenant) ? undefined : resellerPriceTable(await getPriceModel());
  // Säljaren som offertens dokument ritas med, för knappen Offert: samma som PDF:en ritas med.
  const shared = { mode, ...(purchaseList && { purchaseList }), quoteSeller: await quoteSellerView(tenant) };
  const customer = customerId ? await getCustomer(tenant, customerId) : null;
  // Utan kund i adressen, eller med en som inte går att beställa åt, väljs kunden i varukorgen.
  if (!customer || isErasedCustomer(customer)) {
    const customers = await customerChoiceRows(tenant);
    return {
      ...shared,
      customerId: null,
      customerName: "",
      project: project?.trim().slice(0, 120) || undefined,
      delivery: { customer: EMPTY_DELIVERY_DRAFT, reseller: await resellerDeliveryDraft(tenant) },
      customers,
      needsInvoiceDetails: isOwner(tenant),
    };
  }
  // Kopian måste vara återförsäljarens egen order till just den här kunden.
  const original = copyOf && /^NS-\d{1,9}$/.test(copyOf) ? await getOrder(tenant, copyOf) : null;
  const copy =
    original && original.customer.id === customer.id && original.badges.length > 0
      ? // Äldre skyltar flyttas till dagens sortiment, som när en delad skylt öppnas.
        { orderNo: original.orderNo, groups: badgeGroups(original.badges.map(toOfferedDocument)) }
      : undefined;
  return {
    ...shared,
    customerId: customer.id,
    customerName: customer.company ?? customer.name,
    ...(customer.demo && { customerDemo: true }),
    project: project?.trim().slice(0, 120) || (copy ? (original?.project ?? undefined) : undefined),
    delivery: await deliveryOptions(tenant, customer),
    copy,
  };
}

export default async function SkapaPage({ searchParams }: SkapaPageProps) {
  preloadDesignerAssets();
  const params = await searchParams;
  const shared = await decodeShareCode(first(params.d));
  const reseller = await resellerContext(first(params.kund), first(params.offert) === "1", first(params.projekt), first(params.kopia));
  // Kundens eget konto gäller inte när en återförsäljare lägger en order åt en kund.
  const customer = reseller ? null : await customerDesignerContext(null, first(params.igen));
  return (
    <main>
      <Designer
        initialText={first(params.t) ?? ""}
        initialDoc={shared}
        reseller={reseller}
        cardPayments={paymentsConfigured() && databaseConfigured()}
        {...customer}
        copyMark={copyMarkOf(first(params.ny))}
        // Startsidans ruta skickar alltid med `t`, även tomt: då visas startrutan utan namn också.
        fromStart={first(params.t) !== undefined}
      />
    </main>
  );
}
