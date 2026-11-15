import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { createBadgeDocument, toOfferedDocument } from "@/engine";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import type { Delivery } from "@/lib/orders/delivery";
import { checkoutLines } from "./checkout";
import { parsePayment, paymentLabel } from "./model";
import { paidSessionId, parseSession, sessionForm, stripeSettings, verifyWebhook } from "./stripe";

const SECRET = "whsec_test";
const sign = (payload: string, seconds: number, secret = SECRET) =>
  `t=${seconds},v1=${createHmac("sha256", secret).update(`${seconds}.${payload}`).digest("hex")}`;

describe("strömbrytaren för kortbetalning", () => {
  it("är av utan båda nycklarna", () => {
    assert.equal(stripeSettings({}), null);
    assert.equal(stripeSettings({ STRIPE_SECRET_KEY: "sk_test_1" }), null);
    assert.equal(stripeSettings({ STRIPE_WEBHOOK_SECRET: "whsec_1" }), null);
    assert.equal(stripeSettings({ STRIPE_SECRET_KEY: "  ", STRIPE_WEBHOOK_SECRET: "whsec_1" }), null);
  });

  it("är på med båda, och pekar på Stripe om inget annat sägs", () => {
    const settings = stripeSettings({ STRIPE_SECRET_KEY: "sk_test_1", STRIPE_WEBHOOK_SECRET: "whsec_1" });
    assert.equal(settings?.apiUrl, "https://api.stripe.com");
    assert.equal(stripeSettings({ STRIPE_SECRET_KEY: "a", STRIPE_WEBHOOK_SECRET: "b", STRIPE_API_URL: "http://127.0.0.1:9/" })?.apiUrl, "http://127.0.0.1:9");
    assert.equal(stripeSettings({ STRIPE_SECRET_KEY: "a", STRIPE_WEBHOOK_SECRET: "b", STRIPE_API_URL: "ftp://x" }), null);
  });
});

describe("betalsessionen", () => {
  it("skapas i svenska kronor med en rad per belopp och pekar tillbaka på kassan", () => {
    const form = sessionForm({
      reference: "kassa-1",
      email: "anna@example.se",
      lines: [
        { name: "Namnskyltar, 4 st", amountOre: 106_500 },
        { name: "Frakt", amountOre: 19_900 },
      ],
      successUrl: "https://www.namnskylt.com/betalning/klar?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://www.namnskylt.com/betalning/avbruten?kassa=kassa-1",
      expiresAt: new Date("2026-11-15T12:00:00Z"),
    });
    assert.equal(form.get("mode"), "payment");
    assert.equal(form.get("client_reference_id"), "kassa-1");
    assert.equal(form.get("customer_email"), "anna@example.se");
    assert.equal(form.get("expires_at"), String(Date.parse("2026-11-15T12:00:00Z") / 1000));
    assert.equal(form.get("line_items[0][price_data][currency]"), "sek");
    assert.equal(form.get("line_items[0][price_data][unit_amount]"), "106500");
    assert.equal(form.get("line_items[1][price_data][product_data][name]"), "Frakt");
    assert.equal(form.get("line_items[1][price_data][unit_amount]"), "19900");
    // Stripe byter själv ut platshållaren, så den måste komma fram oförändrad.
    assert.match(form.get("success_url") ?? "", /session_id=\{CHECKOUT_SESSION_ID\}$/);
  });

  it("läses ur Stripes svar, och bara `paid` räknas som betald", () => {
    const base = { id: "cs_test_abc12345", client_reference_id: "kassa-1", amount_total: 126_400, currency: "SEK" };
    const paid = parseSession({ ...base, payment_status: "paid", payment_intent: "pi_123" });
    assert.deepEqual(paid, { id: "cs_test_abc12345", url: null, paid: true, amountOre: 126_400, currency: "sek", reference: "kassa-1", paymentRef: "pi_123" });
    assert.equal(parseSession({ ...base, payment_status: "unpaid" })?.paid, false);
    assert.equal(parseSession({ ...base, payment_status: "no_payment_required" })?.paid, false);
    assert.equal(parseSession({ ...base, payment_status: "paid", payment_intent: { id: "pi_9" } })?.paymentRef, "pi_9");
    assert.equal(parseSession({ id: "../../etc", payment_status: "paid" }), null);
    assert.equal(parseSession(null), null);
  });
});

describe("webhookens signatur", () => {
  const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_test_abc12345" } } });
  const now = Date.parse("2026-11-15T12:00:00Z");
  const seconds = now / 1000;

  it("godkänner Stripes signatur på exakt kroppen", () => {
    assert.equal(verifyWebhook(payload, sign(payload, seconds), SECRET, now), true);
    // Stripe kan skicka flera signaturer medan en hemlighet byts.
    assert.equal(verifyWebhook(payload, `${sign(payload, seconds, "gammal")},v1=${sign(payload, seconds).split("v1=")[1]}`, SECRET, now), true);
  });

  it("nekar fel hemlighet, ändrad kropp, gammal signatur och skräp", () => {
    assert.equal(verifyWebhook(payload, sign(payload, seconds, "fel"), SECRET, now), false);
    assert.equal(verifyWebhook(`${payload} `, sign(payload, seconds), SECRET, now), false);
    assert.equal(verifyWebhook(payload, sign(payload, seconds - 301), SECRET, now), false);
    assert.equal(verifyWebhook(payload, null, SECRET, now), false);
    assert.equal(verifyWebhook(payload, "t=abc,v1=zz", SECRET, now), false);
    assert.equal(verifyWebhook(payload, `t=${seconds},v1=kort`, SECRET, now), false);
    assert.equal(verifyWebhook(payload, sign(payload, seconds, ""), "", now), false);
  });

  it("läser bara sessionens id ur händelser som gäller en betalning", () => {
    assert.equal(paidSessionId(JSON.parse(payload)), "cs_test_abc12345");
    assert.equal(paidSessionId({ type: "checkout.session.async_payment_succeeded", data: { object: { id: "cs_live_abc12345" } } }), "cs_live_abc12345");
    assert.equal(paidSessionId({ type: "checkout.session.expired", data: { object: { id: "cs_test_abc12345" } } }), null);
    assert.equal(paidSessionId({ type: "checkout.session.completed", data: { object: { id: "inte-en-session" } } }), null);
    assert.equal(paidSessionId("skräp"), null);
  });
});

describe("det kunden betalar med kort", () => {
  const badge = { ...toOfferedDocument(createBadgeDocument(["Anna Lind"])), quantity: 4 };
  const address = { name: "Anna Lind", contactName: null, line1: "Storgatan 1", line2: null, zip: "111 22", city: "Stockholm", country: "SE" as const, phone: null };
  const standard: Delivery = { to: "customer", address };

  it("är skyltarna och frakten med moms, och raderna summerar till beloppet", () => {
    const { lines, totalOre } = checkoutLines([badge], DEFAULT_PRICE_MODEL, standard);
    assert.equal(lines.length, 2);
    assert.equal(lines[1]?.name, "Frakt");
    assert.equal(lines[0]?.name, "Namnskyltar, 4 st");
    assert.equal(lines.reduce((sum, line) => sum + line.amountOre, 0), totalOre);
    // Hela kronor med moms, alltså jämna hundra ören.
    assert.equal(totalOre % 100, 0);
    assert.ok(lines.every((line) => line.amountOre > 0));
  });

  it("har ingen fraktrad när skyltarna hämtas", () => {
    const { lines, totalOre } = checkoutLines([badge], DEFAULT_PRICE_MODEL, { ...standard, method: "pickup" });
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.amountOre, totalOre);
    assert.ok(totalOre < checkoutLines([badge], DEFAULT_PRICE_MODEL, standard).totalOre);
  });
});

describe("betalningen på ordern", () => {
  it("läses bara när den är hel, och en order utan betalning faktureras", () => {
    const payment = { method: "card", provider: "stripe", reference: "pi_1", amountOre: 126_400, paidAt: "2026-11-15T12:00:00.000Z" };
    assert.deepEqual(parsePayment(payment), payment);
    assert.equal(parsePayment(null), null);
    assert.equal(parsePayment({ ...payment, amountOre: 0 }), null);
    assert.equal(parsePayment({ ...payment, method: "swish" }), null);
    assert.equal(paymentLabel(parsePayment(payment)), "Betald med kort");
    assert.equal(paymentLabel(null), "Faktura");
  });
});
