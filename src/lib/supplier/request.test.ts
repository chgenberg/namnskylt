import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approxFonts, createBadgeDocument, logoImageRef, NO_SHIPPING, type BadgeDocument, type BadgeLogo } from "@/engine";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import { engravedBadge } from "@/engine/testing";
import { endPriceTable, resellerPriceTable } from "@/engine/price-model";
import { DEFAULT_COMPANY } from "@/lib/company/profile";
import type { Delivery } from "@/lib/orders/delivery";
import { priceWithPricing } from "@/lib/orders/pricing";
import { buildSupplierRequest, customerBuyer, dispatchProblems, requestBytes, supplierBuyer, supplierOrderName, type SupplierRequestInput } from "./request";

const PURCHASE = resellerPriceTable(DEFAULT_PRICE_MODEL);
/** Slutkundens prislista: det kunden betalar på en direktorder. */
const SALE = endPriceTable(DEFAULT_PRICE_MODEL);
const DELIVERY: Delivery = {
  to: "customer",
  address: {
    name: "Hotell Exempel AB",
    contactName: "Anna Lind",
    line1: "Storgatan 1",
    line2: null,
    zip: "111 22",
    city: "Stockholm",
    country: "SE",
    phone: null,
  },
};
const BUYER = supplierBuyer("exempelprofil", { ...DEFAULT_COMPANY, name: "Exempelprofil AB", orgNumber: "556000-0000", email: "order@example.se" }, null);
/** En liten PNG som data-URL: det enda som spelar roll här är att den är densamma på flera skyltar. */
const PNG = `data:image/png;base64,${"iVBORw0KGgo".repeat(40)}`;
const LOGO: BadgeLogo = { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "left", heightMm: 8 };

function input(badges: BadgeDocument[], patch: Partial<SupplierRequestInput> = {}): SupplierRequestInput {
  return {
    orderNo: "NS-2001",
    project: "Nya skyltar till receptionen",
    customer: { name: "Anna Lind", email: "anna@example.se", company: "Hotell Exempel AB" },
    buyer: BUYER,
    delivery: DELIVERY,
    badges,
    purchaseList: PURCHASE,
    fonts: approxFonts,
    ...patch,
  };
}

const named = (name: string, quantity = 1): BadgeDocument => ({ ...createBadgeDocument([name]), quantity });

/** Kunden på en direktorder hos namnskylt.com: företaget med sitt organisationsnummer. */
const CUSTOMER = { name: "Anna Lind", company: "Hotell Exempel AB", orgNumber: "556111-2222", email: "anna@example.se", phone: "070-123 45 67", address: null };
/** En direktorder: kunden är beställaren, och namnskylt.coms egen adress följer med för aviseringar. */
const direct = (patch: Partial<SupplierRequestInput> = {}): Partial<SupplierRequestInput> => ({
  buyer: customerBuyer(CUSTOMER, patch.delivery ?? DELIVERY),
  direct: { priceList: SALE, pricing: null, sellerEmail: "hej@example.se" },
  ...patch,
});

describe("ordern till verkstaden", () => {
  it("bär vårt ordernummer, projektet, beställaren som faktureras och slutkunden som referens", () => {
    const request = buildSupplierRequest(input([named("Anna Lind", 10)]));
    assert.equal(request.orderRef, "NS-2001");
    assert.equal(request.orderName, "Nya skyltar till receptionen");
    assert.deepEqual(request.buyer, { id: "exempelprofil", name: "Exempelprofil AB", orgNumber: "556000-0000", email: "order@example.se" });
    assert.deepEqual(request.customer, { name: "Anna Lind", email: "anna@example.se", company: "Hotell Exempel AB" });
  });

  it("beställarens inköpsnummer står i orderns märkning, som verkstadens faktura visar", () => {
    const one = [named("Anna Lind", 10)];
    // Verkstadens mottagare har inget eget fält för numret: deras "Ert ordernummer" är vårt ordernummer.
    assert.equal(buildSupplierRequest(input(one, { customerPo: " 4500 012345 " })).orderName, "Nya skyltar till receptionen · Inköpsnr 4500 012345");
    assert.equal(buildSupplierRequest(input(one, { project: null, customerPo: "PO-77" })).orderName, "Inköpsnr PO-77");
    assert.equal(buildSupplierRequest(input(one, { project: null })).orderName, undefined);
    assert.equal(buildSupplierRequest(input(one, { customerPo: "  " })).orderName, "Nya skyltar till receptionen");
    // Märkningen får ha 120 tecken hos verkstaden. Projektets namn kortas, aldrig numret.
    const long = supplierOrderName("P".repeat(120), "4500 012345");
    assert.ok(long && long.length <= 120 && long.endsWith(" · Inköpsnr 4500 012345"), long ?? "saknas");
    // Vårt ordernummer är fortfarande referensen.
    assert.equal(buildSupplierRequest(input(one, { customerPo: "PO-77" })).orderRef, "NS-2001");
  });

  it("följesedelns länk och packningen står som egna rader på varje skylt", () => {
    const packing = { link: "www.namnskylt.com/f/0a1b2c3d4e5f", instruction: "Neutralt: återförsäljarens följesedel, inga egna loggor eller klistermärken" };
    const request = buildSupplierRequest(input([named("Anna Lind"), named("Kalle Ek", 3)], { packing }));
    for (const line of request.lines) {
      assert.deepEqual(line.document.partnerSpecs?.slice(-2), [
        { label: "Följesedel", value: packing.link },
        { label: "Packning", value: packing.instruction },
      ]);
      // Skyltens egna rader står kvar före dem.
      assert.equal(line.document.partnerSpecs?.[0]?.label, "Fäste");
    }
    // Utan följesedel har skylten bara sina egna rader.
    assert.equal(buildSupplierRequest(input([named("Anna Lind")])).lines[0]?.document.partnerSpecs?.some((row) => row.label === "Följesedel"), false);
  });

  it("en återförsäljares kund får sakna e-post: ordern går att skicka, med kunden som referens", () => {
    // En offert kan sparas med bara företagets namn (beslut av ägaren 2026-11-19). Verkstadens mottagare
    // godtar en tom e-post för slutkunden och använder bara namnet och företaget i sin anteckning.
    const order = input([named("Anna Lind", 10)], { customer: { name: "Hotell Exempel AB", email: "", company: "Hotell Exempel AB" } });
    const request = buildSupplierRequest(order);
    assert.deepEqual(request.customer, { name: "Hotell Exempel AB", email: "", company: "Hotell Exempel AB" });
    assert.deepEqual(dispatchProblems({ badges: order.badges, delivery: DELIVERY }, BUYER), []);
    // Aviseringen går till återförsäljaren, som för alla återförsäljares ordrar.
    assert.ok(!JSON.stringify(request.shipping.address).includes('"email":""'));
  });

  it("raderna har återförsäljarens pris per skylt med startkostnaden inräknad, och summerar till varuvärdet", () => {
    const request = buildSupplierRequest(input([named("Anna Lind", 6), named("Bo Ek", 4)]));
    // Premium med nål på första trappsteget: 73 + 5 kr, plus 200 kr startkostnad delad på 10 skyltar.
    assert.deepEqual(
      request.lines.map((line) => [line.reference, line.quantity, line.unitPriceSek]),
      [
        ["NS-2001-1", 6, 98],
        ["NS-2001-2", 4, 98],
      ],
    );
    assert.equal(request.minimumTopUpSek, 0);
    assert.equal(request.goodsSek, 980);
    assert.equal(request.lines.reduce((sum, line) => sum + line.unitPriceSek * line.quantity, 0) + request.minimumTopUpSek, request.goodsSek);
  });

  it("en ensam skylt bär minidebiteringen som ett eget belopp", () => {
    const request = buildSupplierRequest(input([named("Anna Lind")], { purchaseList: resellerPriceTable({ ...DEFAULT_PRICE_MODEL, startSek: 0 }) }));
    assert.equal(request.lines[0]?.unitPriceSek, 78);
    assert.equal(request.minimumTopUpSek, 221);
    assert.equal(request.goodsSek, 299);
  });

  it("frakten följer återförsäljarens varuvärde: varubrev upp till 500 kr, annars paket", () => {
    const small = buildSupplierRequest(input([named("Anna Lind", 2)]));
    assert.equal(small.goodsSek, 2 * 78 + 200);
    assert.deepEqual([small.shipping.method, small.shipping.costSek], ["postnord-varubrev", 75]);
    const large = buildSupplierRequest(input([named("Anna Lind", 10)]));
    assert.deepEqual([large.shipping.method, large.shipping.costSek], ["dhl-paket", 159]);
  });

  it("express och upphämtning skickas med verkstadens egna koder och utan fraktkostnad", () => {
    const express = buildSupplierRequest(input([named("Anna Lind", 10)], { delivery: { ...DELIVERY, method: "express" } }));
    assert.deepEqual([express.shipping.method, express.shipping.costSek], ["postnord-express", 0]);
    const pickup = buildSupplierRequest(input([named("Anna Lind", 10)], { delivery: { ...DELIVERY, method: "pickup" } }));
    assert.deepEqual([pickup.shipping.method, pickup.shipping.costSek], ["pickup-hogsbo", 0]);
    // Varorna kostar detsamma oavsett fraktsätt.
    assert.equal(pickup.goodsSek, buildSupplierRequest(input([named("Anna Lind", 10)])).goodsSek);
  });

  it("en order från före frakten skickas utan fraktkostnad", () => {
    const request = buildSupplierRequest(input([named("Anna Lind", 10)], { purchaseList: resellerPriceTable({ ...DEFAULT_PRICE_MODEL, shipping: NO_SHIPPING }) }));
    assert.equal(request.shipping.costSek, 0);
  });

  it("leveransadressen går över fält för fält, utan tomma fält", () => {
    const request = buildSupplierRequest(input([named("Anna Lind")]));
    assert.deepEqual(request.shipping.address, {
      name: "Hotell Exempel AB",
      contactName: "Anna Lind",
      line1: "Storgatan 1",
      zip: "111 22",
      city: "Stockholm",
      country: "SE",
      // Skyltarna går till en återförsäljares kund: transportören aviserar återförsäljaren.
      email: "order@example.se",
    });
  });

  it("varje rad har leverantörens dokument och en färdig produktionsfil", () => {
    const [line] = buildSupplierRequest(input([named("Anna Lind")])).lines;
    assert.equal(line?.document.productType, "sign");
    assert.equal(line?.document.material, "namnskylt-metall");
    assert.match(line?.productionSvg ?? "", /^<svg/);
  });
});

describe("bilderna i anropet", () => {
  const withColourLogo = (name: string): BadgeDocument => ({ ...named(name), logo: { ...LOGO, image: { src: PNG } } });

  it("hundra namn med samma logga i färg ger en bild, och lagren pekar på den", () => {
    const badges = Array.from({ length: 100 }, (_, i) => withColourLogo(`Person ${i + 1}`));
    const request = buildSupplierRequest(input(badges));
    const keys = Object.keys(request.images);
    assert.equal(keys.length, 1);
    assert.equal(request.images[keys[0] ?? ""], PNG);
    for (const line of request.lines) {
      const image = line.document.layers.find((layer) => layer.data.kind === "image");
      assert.equal(image?.data.kind === "image" && image.data.src, `image:${keys[0]}`);
    }
    // Bilden står en gång, inte hundra.
    assert.equal(JSON.stringify(request).split(PNG).length - 1, 1);
    assert.ok(requestBytes(request) < 1_000_000);
  });

  it("en graverad logga får sin svartvita miniatyr på samma sätt", () => {
    // Gravyr finns på plast och på äldre skyltar utan vald metod. Dagens metallskylt printas.
    const request = buildSupplierRequest(input([{ ...engravedBadge(["Anna Lind"]), logo: LOGO }], { logoPng: () => PNG }));
    const image = request.lines[0]?.document.layers.find((layer) => layer.data.kind === "image");
    assert.equal(image?.data.kind === "image" && image.data.renderMode, "engrave");
    assert.deepEqual(Object.values(request.images), [PNG]);
  });

  it("miniatyren visar gravyrformen när en logga i färg graveras, och siluetten när en svartvit printas", () => {
    const form = "M0 0L10 0L10 10L0 10ZM3 3L7 3L7 7L3 7Z";
    const drawn: string[] = [];
    const logoPng = (logo: BadgeLogo) => {
      drawn.push(logo.d);
      return PNG;
    };
    const colour: BadgeLogo = { ...LOGO, engraveD: form, image: { src: PNG } };
    buildSupplierRequest(input([{ ...named("Anna Lind"), logo: colour, marking: "engrave" }], { logoPng }));
    assert.deepEqual(drawn, [form]);
    // En logga i färg som printas skickas som sin bild och behöver ingen miniatyr.
    buildSupplierRequest(input([{ ...named("Anna Lind"), logo: colour, marking: "engrave-name-print-logo" }], { logoPng }));
    assert.deepEqual(drawn, [form]);
    // En svartvit logga som printas ritas ur sina egna banor.
    buildSupplierRequest(input([{ ...named("Anna Lind"), logo: LOGO, marking: "print" }], { logoPng }));
    assert.deepEqual(drawn, [form, LOGO.d]);
  });

  it("en skylt utan logga ger inga bilder", () => {
    assert.deepEqual(buildSupplierRequest(input([named("Anna Lind")])).images, {});
  });
});

describe("det som stoppar en order", () => {
  const order = { badges: [named("Anna Lind")], delivery: DELIVERY };

  it("en order med leveransadress och en beställare med organisationsnummer är klar", () => {
    assert.deepEqual(dispatchProblems(order, BUYER), []);
  });

  it("utan leveransadress, organisationsnummer eller e-post säger den vad som saknas", () => {
    assert.deepEqual(dispatchProblems({ ...order, delivery: null }, BUYER), ["Leveransadress saknas"]);
    assert.deepEqual(dispatchProblems(order, { ...BUYER, orgNumber: "" }), ["Återförsäljarens organisationsnummer saknas"]);
    assert.deepEqual(dispatchProblems(order, { ...BUYER, email: "" }), ["Återförsäljarens e-postadress saknas"]);
    assert.equal(dispatchProblems({ ...order, delivery: null }, null).length, 3);
  });

  it("beställarens e-post är företagets, annars kontots", () => {
    const company = { ...DEFAULT_COMPANY, name: "Exempelprofil AB", orgNumber: "556000-0000", email: "" };
    assert.equal(supplierBuyer("exempelprofil", company, "konto@example.se").email, "konto@example.se");
    assert.equal(supplierBuyer("exempelprofil", { ...company, email: "order@example.se" }, "konto@example.se").email, "order@example.se");
    // Har företaget en egen adress för fakturor går verkstadens faktura dit.
    assert.equal(
      supplierBuyer("exempelprofil", { ...company, email: "order@example.se", invoiceEmail: "faktura@example.se" }, "konto@example.se").email,
      "faktura@example.se",
    );
    assert.equal(supplierBuyer("exempelprofil", company, null).email, "");
  });

  it("beställarens fakturaadress skickas tolkad när den fria texten går att läsa", () => {
    const company = { ...DEFAULT_COMPANY, name: "Exempelprofil AB", orgNumber: "556000-0000", email: "order@example.se" };
    const buyer = supplierBuyer("exempelprofil", { ...company, address: "Storgatan 1\nBox 12\n111 22 Stockholm" }, null);
    assert.equal(buyer.address, "Storgatan 1\nBox 12\n111 22 Stockholm");
    assert.deepEqual(buyer.billingAddress, { line1: "Storgatan 1", line2: "Box 12", zip: "111 22", city: "Stockholm", country: "SE" });
    assert.deepEqual(supplierBuyer("exempelprofil", { ...company, address: "Storgatan 1, 111 22 Stockholm" }, null).billingAddress, {
      line1: "Storgatan 1",
      zip: "111 22",
      city: "Stockholm",
      country: "SE",
    });
    // Står företagets namn först hoppas den raden över, så att gatan blir gata.
    assert.deepEqual(supplierBuyer("exempelprofil", { ...company, address: "Exempelprofil AB\nStorgatan 1\n111 22 Stockholm" }, null).billingAddress, {
      line1: "Storgatan 1",
      zip: "111 22",
      city: "Stockholm",
      country: "SE",
    });
    // Samma sak när adressen står på en rad med komma emellan.
    assert.deepEqual(supplierBuyer("exempelprofil", { ...company, address: "Exempelprofil AB, Storgatan 1, 111 22 Stockholm" }, null).billingAddress, {
      line1: "Storgatan 1",
      zip: "111 22",
      city: "Stockholm",
      country: "SE",
    });
    // En rad längre än verkstaden tar emot skickas inte tolkad: ett valfritt fält får inte stoppa ordern.
    const long = supplierBuyer("exempelprofil", { ...company, address: `${"Storgatan ".repeat(25)}1\n111 22 Stockholm` }, null);
    assert.equal(long.billingAddress, undefined);
    assert.ok((long.address ?? "").length > 200);
    // Går texten inte att läsa följer bara den fria texten med: en halv adress är sämre än ingen.
    const unclear = supplierBuyer("exempelprofil", { ...company, address: "Storgatan 1" }, null);
    assert.equal(unclear.address, "Storgatan 1");
    assert.equal(unclear.billingAddress, undefined);
    assert.equal(supplierBuyer("exempelprofil", company, null).billingAddress, undefined);
  });

  it("namnskylt.coms egna kunder aviseras direkt av transportören", () => {
    const own = buildSupplierRequest(input([named("Anna Lind")], direct()));
    assert.equal(own.shipping.address.email, "anna@example.se");
    // Utan adress till kunden aviseras vi själva.
    const unknown = buildSupplierRequest(input([named("Anna Lind")], direct({ customer: { name: "Anna Lind", email: " ", company: null } })));
    assert.equal(unknown.shipping.address.email, "hej@example.se");
    // En borttagen kund har en platshållare till adress: den går inte att avisera på.
    const erased = { name: "Borttagen kund", email: "borttagen-3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f@borttagen.invalid", company: null };
    assert.equal(buildSupplierRequest(input([named("Anna Lind")], direct({ customer: erased }))).shipping.address.email, "hej@example.se");
    // Skickas skyltarna till oss själva aviseras vi, inte kunden.
    const toUs = buildSupplierRequest(input([named("Anna Lind")], direct({ delivery: { ...DELIVERY, to: "reseller" } })));
    assert.equal(toUs.shipping.address.email, "hej@example.se");
  });

  it("en kortbetald order hos namnskylt.com faktureras namnskylt.com, men kunden aviseras ändå", () => {
    // Kunden har redan betalat: namnskylt.com är beställaren, till inköpspris. Aviseringen följer säljaren.
    const owner = supplierBuyer("namnskylt", { ...DEFAULT_COMPANY, orgNumber: "556000-0000", email: "hej@example.se" }, null);
    const paid = buildSupplierRequest(input([named("Anna Lind", 10)], { buyer: owner }));
    assert.equal(paid.buyer.orgNumber, "556000-0000");
    assert.equal(paid.lines[0]?.unitPriceSek, 98);
    assert.equal(paid.shipping.address.email, "anna@example.se");
  });

  it("en direktorder har kunden som beställare, med företagets organisationsnummer", () => {
    const request = buildSupplierRequest(input([named("Anna Lind", 10)], direct()));
    assert.deepEqual(request.buyer, {
      id: "namnskylt",
      name: "Hotell Exempel AB",
      orgNumber: "556111-2222",
      email: "anna@example.se",
      phone: "070-123 45 67",
      // Kunden har ingen egen adress sparad: skyltarna går till kunden, så leveransadressen är fakturaadressen.
      billingAddress: { line1: "Storgatan 1", zip: "111 22", city: "Stockholm", country: "SE" },
    });
    // Kundens egen adress går före leveransadressen, och utan företag står personen som beställare.
    const own = customerBuyer({ ...CUSTOMER, company: null, address: "Hamngatan 2\n222 33 Lund" }, DELIVERY);
    assert.equal(own.name, "Anna Lind");
    assert.deepEqual(own.billingAddress, { line1: "Hamngatan 2", zip: "222 33", city: "Lund", country: "SE" });
    // Går skyltarna till oss själva är leveransadressen inte kundens.
    assert.equal(customerBuyer(CUSTOMER, { ...DELIVERY, to: "reseller" }).billingAddress, undefined);
    assert.equal(customerBuyer({ ...CUSTOMER, orgNumber: null }, DELIVERY).orgNumber, "");
  });

  it("en direktorder bär kundens pris per skylt, inte inköpspriset, och samma frakt som i övriga led", () => {
    const badges = [named("Anna Lind", 6), named("Bo Ek", 4)];
    const purchase = buildSupplierRequest(input(badges));
    const request = buildSupplierRequest(input(badges, direct()));
    const sale = priceWithPricing(badges, null, SALE, purchase.shipping.costSek);
    assert.deepEqual(
      request.lines.map((line) => line.unitPriceSek),
      sale.lines.map((line) => line.unitSek),
    );
    assert.ok((request.lines[0]?.unitPriceSek ?? 0) > (purchase.lines[0]?.unitPriceSek ?? 0));
    assert.equal(request.goodsSek, sale.goodsSek);
    assert.equal(request.lines.reduce((sum, line) => sum + line.unitPriceSek * line.quantity, 0) + request.minimumTopUpSek, request.goodsSek);
    // Frakten och fraktsättet följer inköpslistan, så att de är desamma hur ordern än faktureras.
    assert.deepEqual([request.shipping.method, request.shipping.costSek], [purchase.shipping.method, purchase.shipping.costSek]);
    // Dokumenten är desamma: bara priset och beställaren skiljer.
    assert.deepEqual(request.lines.map((line) => line.document), purchase.lines.map((line) => line.document));
  });

  it("en direktorder med egna à-priser fakturerar dem, och en ensam skylt får kundens påslag till minsta ordervärde", () => {
    const badges = [named("Anna Lind", 6), named("Bo Ek", 4)];
    const priced = buildSupplierRequest(input(badges, direct({ direct: { priceList: SALE, pricing: { unitOverrides: [100, null], discountPercent: 0, extras: [] }, sellerEmail: "hej@example.se" } })));
    assert.equal(priced.lines[0]?.unitPriceSek, 100);
    assert.equal(priced.lines.reduce((sum, line) => sum + line.unitPriceSek * line.quantity, 0) + priced.minimumTopUpSek, priced.goodsSek);
    const single = buildSupplierRequest(input([named("Anna Lind")], direct()));
    const sale = priceWithPricing([named("Anna Lind")], null, SALE, 0);
    assert.equal(single.minimumTopUpSek, sale.minimumTopUpSek);
    assert.equal(single.goodsSek, sale.goodsSek);
    assert.equal(single.goodsSek, Math.max(SALE.minOrderSek, sale.badgesSek));
  });

  it("en direktorder stoppas när den inte går att fakturera rätt, och felen pekar på kunden", () => {
    const order = { badges: [named("Anna Lind")], delivery: DELIVERY, pricing: null };
    const buyer = customerBuyer(CUSTOMER, DELIVERY);
    assert.deepEqual(dispatchProblems(order, buyer, true), []);
    assert.deepEqual(dispatchProblems(order, customerBuyer({ ...CUSTOMER, orgNumber: null }, DELIVERY), true), ["Kundens organisationsnummer saknas"]);
    assert.deepEqual(dispatchProblems(order, customerBuyer({ ...CUSTOMER, orgNumber: "12345" }, DELIVERY), true), ["Kundens organisationsnummer ska ha tio siffror"]);
    assert.deepEqual(dispatchProblems(order, customerBuyer({ ...CUSTOMER, email: "" }, DELIVERY), true), ["Kundens e-postadress saknas"]);
    // En rabatt i procent och extrarader har ingen plats i anropet.
    const blocked = "Ordern har rabatt i procent eller extrarader, som verkstaden inte kan fakturera. Lägg priset som à-pris per skylt";
    assert.deepEqual(dispatchProblems({ ...order, pricing: { unitOverrides: [], discountPercent: 10, extras: [] } }, buyer, true), [blocked]);
    assert.deepEqual(dispatchProblems({ ...order, pricing: { unitOverrides: [], discountPercent: 0, extras: [{ label: "Expressorder", amountSek: 300 }] } }, buyer, true), [blocked]);
    assert.deepEqual(dispatchProblems({ ...order, pricing: { unitOverrides: [90], discountPercent: 0, extras: [] } }, buyer, true), []);
    // En borttagen kund har en platshållare till adress och ska varken faktureras eller mejlas.
    const erased = customerBuyer({ ...CUSTOMER, email: "borttagen-3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f@borttagen.invalid" }, DELIVERY);
    assert.deepEqual(dispatchProblems(order, erased, true), ["Kunden är borttagen"]);
    // En återförsäljares egna priser mot kunden rör inte det verkstaden fakturerar återförsäljaren.
    assert.deepEqual(dispatchProblems({ ...order, pricing: { unitOverrides: [], discountPercent: 10, extras: [{ label: "Expressorder", amountSek: 300 }] } }, BUYER), []);
  });

  it("en återförsäljares kund aviseras aldrig direkt: beskedet går till återförsäljaren", () => {
    // Verkstaden står som avsändare i transportörens avisering, och ska inte synas för butikens kund.
    const toCustomer = buildSupplierRequest(input([named("Anna Lind")]));
    assert.equal(toCustomer.shipping.address.email, "order@example.se");
    const toReseller = buildSupplierRequest(input([named("Anna Lind")], { delivery: { ...DELIVERY, to: "reseller" } }));
    assert.equal(toReseller.shipping.address.email, "order@example.se");
  });

  it("aviseringen går till företagets vanliga adress, inte fakturabrevlådan", () => {
    const company = { ...DEFAULT_COMPANY, name: "Exempelprofil AB", orgNumber: "556000-0000", email: "order@example.se", invoiceEmail: "faktura@example.se" };
    const buyer = supplierBuyer("exempelprofil", company, "konto@example.se");
    assert.equal(buyer.email, "faktura@example.se");
    assert.equal(buyer.contactEmail, "order@example.se");
    for (const to of ["customer", "reseller"] as const) {
      const request = buildSupplierRequest(input([named("Anna Lind")], { buyer, delivery: { ...DELIVERY, to } }));
      assert.equal(request.shipping.address.email, "order@example.se", to);
    }
    // Är adresserna samma skickas bara den ena.
    assert.equal("contactEmail" in BUYER, false);
  });

  it("vid upphämtning aviseras ingen", () => {
    const pickup = buildSupplierRequest(input([named("Anna Lind")], { delivery: { ...DELIVERY, method: "pickup" } }));
    assert.equal("email" in pickup.shipping.address, false);
  });

  it("ett organisationsnummer som verkstaden inte kan läsa stoppar utskicket här, inte hos verkstaden", () => {
    const order = { badges: [named("Anna Lind")], delivery: DELIVERY };
    for (const orgNumber of ["55600", "556000-00000", "ej klart", "SE55600000000"]) {
      assert.deepEqual(dispatchProblems(order, { ...BUYER, orgNumber }), ["Återförsäljarens organisationsnummer ska ha tio siffror"], orgNumber);
    }
    // Det verkstaden läser som tio siffror går igenom: med eller utan bindestreck, som momsnummer och med sekel.
    for (const orgNumber of ["5560000000", "556000 - 0000", "SE556000000001", "16556000-0000"]) {
      assert.deepEqual(dispatchProblems(order, { ...BUYER, orgNumber }), [], orgNumber);
    }
  });

  it("en logga som pekar på en bild hos oss ska läggas in innan anropet byggs", () => {
    // Bygget flyttar bara det som redan är en bild. En adress till oss vore oanvändbar för verkstaden.
    const ref = logoImageRef("5c".repeat(32));
    const request = buildSupplierRequest(input([{ ...named("Anna Lind"), logo: { ...LOGO, image: { src: ref } } }]));
    assert.deepEqual(Object.values(request.images), [ref]);
  });
});
