import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, type BadgeDocument } from "@/engine";
import { plasticBadge } from "@/engine/testing";
import { DEFAULT_COMPANY } from "@/lib/company/profile";
import { workshopSeller, type SellerProfile } from "@/lib/company/seller";
import { OWNER_TENANT } from "@/lib/tenants/model";
import { packingInstruction, packingSignImageUrl, packingSlipHtml, packingSlipLink, packingSlipPath, type PackingSlipOrder } from "./packing-slip";

const named = (name: string, quantity = 1): BadgeDocument => ({ ...createBadgeDocument([name, "Säljare"]), quantity });

const RESELLER: SellerProfile = {
  ...DEFAULT_COMPANY,
  name: "Profilhuset Exempel AB",
  orgNumber: "556111-2222",
  address: "Storgatan 1\n111 22 Exempelstad",
  phone: "08-123 45 67",
  email: "order@profilhuset.example",
  website: "profilhuset.example",
  bankgiro: "123-4567",
};

const ORDER: PackingSlipOrder = {
  orderNo: "NS-2001",
  resellerId: "profilhuset",
  demo: false,
  supplierOrderNo: "100412",
  supplierSentAt: "2026-11-20T10:00:00.000Z",
  placedAt: "2026-11-20T09:00:00.000Z",
  project: "Reception",
  customerPo: "4500 012345",
  customer: { name: "Anna Lind", company: "Hotell Exempel AB" },
  delivery: {
    to: "customer",
    address: { name: "Hotell Exempel AB", contactName: "Anna Lind", line1: "Hamngatan 2", line2: "", zip: "411 14", city: "Göteborg", country: "SE", phone: "070-123 45 67" },
  },
  badges: [named("Anna Lind", 2), named("Kalle Ek"), { ...plasticBadge(["Maria Öberg"]), quantity: 3 }],
};

describe("följesedeln", () => {
  it("en återförsäljares följesedel bär dess namn och nämner varken namnskylt.com eller verkstaden", () => {
    const html = packingSlipHtml(ORDER, RESELLER);
    assert.match(html, /<h1>Följesedel<\/h1>/);
    assert.match(html, /<span class="name">Profilhuset Exempel AB<\/span>/);
    assert.match(html, /Profilhuset Exempel AB · Org\.nr 556111-2222/);
    assert.doesNotMatch(html, /namnskylt|Skylt &amp; Gravyrteknik|skyltochgravyr/i);
    // Återförsäljarens kund ser vårt ordernummer, aldrig verkstadens.
    assert.match(html, /<dt>Ordernummer<\/dt><dd>NS-2001<\/dd>/);
    assert.doesNotMatch(html, /100412|Referens/);
    assert.match(html, /<dt>Inköpsnummer<\/dt><dd>4500 012345<\/dd>/);
    assert.match(html, /<dt>Märkning<\/dt><dd>Reception<\/dd>/);
    // Mottagaren och beställaren.
    assert.match(html, /Levereras till<\/p><p>Hotell Exempel AB<\/p><p>Att: Anna Lind<\/p><p>Hamngatan 2<\/p><p>411 14 Göteborg<\/p>/);
    assert.match(html, /Beställare<\/p><p>Hotell Exempel AB<\/p><p>Anna Lind<\/p>/);
  });

  it("skyltarna står design för design med namn och antal, och aldrig med pris", () => {
    const html = packingSlipHtml(ORDER, RESELLER);
    // Två designer: metallskyltarna (två namn, tre skyltar) och plastskylten (tre skyltar).
    assert.match(html, /Design 1: Metall · Mässing · Rektangel 60 × 30 mm · Nål<span>3 st<\/span>/);
    assert.match(html, /Design 2: [^<]*75 × 25 mm · Nål<span>3 st<\/span>/);
    assert.match(html, /<td>Anna Lind, Säljare<\/td><td class="qty">2 st<\/td>/);
    assert.match(html, /<td>Kalle Ek, Säljare<\/td><td class="qty">1 st<\/td>/);
    assert.match(html, /<td>Maria Öberg<\/td><td class="qty">3 st<\/td>/);
    assert.match(html, /Antal skyltar i leveransen<\/span><span>6 st<\/span>/);
    assert.doesNotMatch(html, /\bkr\b|moms|Bankgiro|pris/i);
    // En order med en enda design har ingen numrering.
    assert.doesNotMatch(packingSlipHtml({ ...ORDER, badges: [named("Anna Lind")] }, RESELLER), /Design 1/);
    // En skylt med bara logga har ingen text att skriva.
    const logo = { d: "M0 0L10 0L10 10Z", viewWidth: 10, viewHeight: 10, placement: "left" as const, heightMm: 10 };
    assert.match(packingSlipHtml({ ...ORDER, badges: [{ ...createBadgeDocument([""]), logo }] }, RESELLER), /<td>Utan text<\/td>/);
  });

  it("hos namnskylt.com bär den sajtens logga, Skylt & Gravyrtekniks uppgifter och deras ordernummer", () => {
    const seller = { ...workshopSeller({ quoteTerms: "" }), logo: "data:image/png;base64,AA" };
    const html = packingSlipHtml({ ...ORDER, resellerId: OWNER_TENANT }, seller);
    assert.match(html, /<img class="logo" src="data:image\/png;base64,AA" alt="namnskylt\.com">/);
    assert.match(html, /Skylt &amp; Gravyrteknik i Sverige AB · Org\.nr 556464-2261/);
    // En direktorder som verkstaden har tagit emot bär deras nummer, med vårt som referens.
    assert.match(html, /<dt>Ordernummer<\/dt><dd>100412<\/dd><dt>Referens<\/dt><dd>NS-2001<\/dd>/);
    // Innan verkstaden har tagit emot ordern finns bara vårt nummer.
    assert.match(packingSlipHtml({ ...ORDER, resellerId: OWNER_TENANT, supplierSentAt: null }, seller), /<dd>NS-2001<\/dd><dt>Orderdatum/);
  });

  it("upphämtning och en order utan adress skriver ingen adress, och det som kommer utifrån rensas", () => {
    const pickup = { ...ORDER.delivery!, method: "pickup" as const };
    assert.match(packingSlipHtml({ ...ORDER, delivery: pickup }, RESELLER), /Levereras till<\/p><p>Hämtas av kunden<\/p><p>Hotell Exempel AB<\/p>/);
    assert.match(packingSlipHtml({ ...ORDER, delivery: null }, RESELLER), /<p>Leveransadress saknas<\/p>/);
    const odd = packingSlipHtml({ ...ORDER, project: "<script>x</script>", customer: { name: 'Anna "A" Lind', company: null } }, RESELLER);
    assert.match(odd, /&lt;script&gt;x&lt;\/script&gt;/);
    assert.match(odd, /Anna &quot;A&quot; Lind/);
    assert.doesNotMatch(odd, /<script>/);
    // En ljus logga får en mörk platta bakom sig, som på offerten.
    assert.match(packingSlipHtml(ORDER, { ...RESELLER, logo: "data:image/png;base64,BB" }, "#112233"), /class="logo plate" src="data:image\/png;base64,BB"[^>]* style="background:#112233"/);
  });

  it("länken är kort att skriva av, och packningen följer vem som säljer", () => {
    assert.equal(packingSlipPath("0a1b2c3d4e5f"), "/f/0a1b2c3d4e5f");
    assert.equal(packingSlipLink("https://www.namnskylt.com/", "0a1b2c3d4e5f"), "www.namnskylt.com/f/0a1b2c3d4e5f");
    assert.match(packingInstruction(true), /^namnskylt\.com: /);
    assert.match(packingInstruction(false), /^Neutralt: /);
    assert.doesNotMatch(packingInstruction(false), /namnskylt/);
  });

  it("en uppdelad order har en följesedel per leverans, med dess namn och adress", () => {
    const delivery = (position: number, lines: number[], city: string) => ({
      position,
      name: "Hotell Exempel AB",
      contactName: null,
      line1: `Kontoret ${position}`,
      line2: null,
      zip: "411 14",
      city,
      country: "SE",
      phone: null,
      email: null,
      lines,
      trackingUrl: null,
    });
    const split = { ...ORDER, supplierDeliveries: [delivery(1, [1, 3], "Göteborg"), delivery(2, [2], "Malmö")] };
    const second = packingSlipHtml(split, RESELLER, null, 2);
    assert.match(second, /<dt>Leverans<\/dt><dd>2 av 2<\/dd>/);
    assert.match(second, /Levereras till<\/p><p>Hotell Exempel AB<\/p><p>Kontoret 2<\/p><p>411 14 Malmö<\/p>/);
    // Rad 2 i anropet är orderns andra skylt: bara Kalle Ek ligger i leverans 2.
    assert.match(second, /Kalle Ek/);
    assert.doesNotMatch(second, /Anna Lind \/|Maria Öberg/);
    assert.match(second, /Antal skyltar i leveransen<\/span><span>1 st/);
    // Utan nummer blir det alla leveranser, en per sida.
    const all = packingSlipHtml(split, RESELLER);
    assert.equal(all.match(/<h1>Följesedel<\/h1>/g)?.length, 2);
    assert.match(all, /class="page-break"/);
    assert.match(all, /Antal skyltar i leveransen<\/span><span>5 st/);
    // En order som inte är uppdelad är en enda följesedel, också med ett nummer.
    assert.equal(packingSlipHtml(ORDER, RESELLER, null, 1).match(/<h1>Följesedel<\/h1>/g)?.length, 1);
  });
});

describe("skyltens bild till orderbekräftelsen", () => {
  it("ligger under följesedelns kod, med skyltens nummer i ordern", () => {
    assert.equal(packingSignImageUrl("https://www.namnskylt.com/", "0a1b2c3d4e5f", 3), "https://www.namnskylt.com/f/0a1b2c3d4e5f/skylt/3.png");
  });
});
