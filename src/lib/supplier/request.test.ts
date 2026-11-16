import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approxFonts, createBadgeDocument, logoImageRef, NO_SHIPPING, type BadgeDocument, type BadgeLogo } from "@/engine";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import { resellerPriceTable } from "@/engine/price-model";
import { DEFAULT_COMPANY } from "@/lib/company/profile";
import type { Delivery } from "@/lib/orders/delivery";
import { buildSupplierRequest, dispatchProblems, requestBytes, supplierBuyer, type SupplierRequestInput } from "./request";

const PURCHASE = resellerPriceTable(DEFAULT_PRICE_MODEL);
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

describe("ordern till verkstaden", () => {
  it("bär vårt ordernummer, projektet, beställaren som faktureras och slutkunden som referens", () => {
    const request = buildSupplierRequest(input([named("Anna Lind", 10)]));
    assert.equal(request.orderRef, "NS-2001");
    assert.equal(request.orderName, "Nya skyltar till receptionen");
    assert.deepEqual(request.buyer, { id: "exempelprofil", name: "Exempelprofil AB", orgNumber: "556000-0000", email: "order@example.se" });
    assert.deepEqual(request.customer, { name: "Anna Lind", email: "anna@example.se", company: "Hotell Exempel AB" });
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
    const request = buildSupplierRequest(input([{ ...named("Anna Lind"), logo: LOGO }], { logoPng: () => PNG }));
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

  it("en logga som pekar på en bild hos oss ska läggas in innan anropet byggs", () => {
    // Bygget flyttar bara det som redan är en bild. En adress till oss vore oanvändbar för verkstaden.
    const ref = logoImageRef("5c".repeat(32));
    const request = buildSupplierRequest(input([{ ...named("Anna Lind"), logo: { ...LOGO, image: { src: ref } } }]));
    assert.deepEqual(Object.values(request.images), [ref]);
  });
});
