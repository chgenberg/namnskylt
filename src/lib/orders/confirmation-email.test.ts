import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeResetEmail } from "@/lib/reseller-auth/reset-email";
import { composeOrderConfirmation, composeShippedEmail, type ConfirmedOrder } from "./confirmation-email";

const sender = { sellerName: "namnskylt.com", replyTo: "hej@example.se", fromAddress: "order@example.se", termsUrl: "https://www.namnskylt.com/villkor" };
const address = { name: "Exempel AB", contactName: "Anna Lind", line1: "Storgatan 1", line2: null, zip: "111 22", city: "Stockholm", country: "SE" as const, phone: null };
const order: ConfirmedOrder = {
  orderNo: "NS-2001",
  customerName: "Anna Lind",
  customerEmail: "anna@example.se",
  quantity: 4,
  goodsSek: 852,
  shippingSek: 159,
  delivery: { to: "customer", address },
  payment: null,
};

describe("orderbekräftelsen", () => {
  it("säger vad som beställts, vad det kostar med moms och vart det skickas", () => {
    const mail = composeOrderConfirmation(order, sender);
    assert.equal(mail.to, "anna@example.se");
    assert.equal(mail.subject, "Orderbekräftelse NS-2001");
    assert.equal(mail.from, '"namnskylt.com" <order@example.se>');
    assert.equal(mail.replyTo, "hej@example.se");
    assert.match(mail.text, /Namnskyltar, 4 st: 852\skr/);
    assert.match(mail.text, /Frakt, standardfrakt: 159\skr/);
    // (852 + 159) × 25 % = 253, summa 1 264.
    assert.match(mail.text, /Moms 25 %: 253\skr/);
    assert.match(mail.text, /Summa inkl\. moms: 1\s264\skr/);
    assert.match(mail.text, /Betalning: Faktura/);
    assert.match(mail.text, /Exempel AB\nAtt: Anna Lind\nStorgatan 1\n111 22 Stockholm/);
    assert.match(mail.text, /https:\/\/www\.namnskylt\.com\/villkor/);
    assert.equal(mail.idempotencyKey, "order-confirmation:NS-2001");
  });

  it("säger att en kortbetald order är betald", () => {
    const paid = { method: "card", provider: "stripe", reference: "pi_1", amountOre: 126_400, paidAt: "2026-11-15T12:00:00Z" } as const;
    assert.match(composeOrderConfirmation({ ...order, payment: paid }, sender).text, /Betalning: Betald med kort/);
  });

  it("lovar inget pris på expressfrakten och tar ingen frakt för upphämtning", () => {
    const express = composeOrderConfirmation({ ...order, shippingSek: 0, delivery: { to: "customer", address, method: "express" } }, sender);
    assert.match(express.text, /Frakt, postnord express: tillkommer/);
    assert.match(express.text, /Summa inkl\. moms, utan frakt: 1\s065\skr/);
    const pickup = composeOrderConfirmation({ ...order, shippingSek: 0, delivery: { to: "customer", address, method: "pickup" } }, sender);
    assert.match(pickup.text, /Frakt, hämta i högsbo: 0\skr/);
  });

  it("låter inte kundens namn eller butikens namn ändra mejlets huvuden eller HTML", () => {
    const mail = composeOrderConfirmation(
      { ...order, customerName: "Anna\r\nBcc: annan@example.se <b>" },
      { ...sender, sellerName: 'Butik "X"\n<script>' },
    );
    assert.doesNotMatch(mail.from, /[\r\n]/);
    assert.equal(mail.from, '"Butik X script" <order@example.se>');
    assert.doesNotMatch(mail.html, /<b>|<script>/);
    assert.match(mail.html, /Anna Bcc: annan@example\.se &lt;b&gt;/);
  });
});

describe("mejlet om en skickad order", () => {
  const shipped = { orderNo: "NS-2001", customerName: "Anna Lind", customerEmail: "anna@example.se", trackingUrl: "https://spara.example/abc", orderUrl: "https://www.namnskylt.com/order/" + "a".repeat(64) };
  const from = { sellerName: sender.sellerName, replyTo: sender.replyTo, fromAddress: sender.fromAddress };

  it("bär spårningslänken och länken till kundens ordersida", () => {
    const mail = composeShippedEmail(shipped, from);
    assert.equal(mail.subject, "Dina namnskyltar är skickade (NS-2001)");
    assert.match(mail.text, /Följ försändelsen: https:\/\/spara\.example\/abc/);
    assert.match(mail.text, /Din order: https:\/\/www\.namnskylt\.com\/order\/a{64}/);
    assert.match(mail.html, /href="https:\/\/spara\.example\/abc"/);
    assert.equal(mail.idempotencyKey, "order-shipped:NS-2001");
  });

  it("går att skicka utan spårningslänk", () => {
    const mail = composeShippedEmail({ ...shipped, trackingUrl: null }, from);
    assert.doesNotMatch(mail.text, /Följ försändelsen/);
    assert.doesNotMatch(mail.html, /Följ försändelsen/);
  });
});

describe("mejlet om nytt lösenord", () => {
  it("bär länken, säger hur länge den gäller och avslöjar inget konto", () => {
    const mail = composeResetEmail({ to: "anna@example.se", url: "https://www.namnskylt.com/aterforsaljare/konto/abcdefghijklmnopqrstuvwxyz012345", from: "namnskylt.com <order@example.se>", replyTo: "order@example.se" });
    assert.equal(mail.subject, "Välj ett nytt lösenord");
    assert.match(mail.text, /https:\/\/www\.namnskylt\.com\/aterforsaljare\/konto\/abcdefghijklmnopqrstuvwxyz012345/);
    assert.match(mail.text, /gäller i 2 timmar/);
    assert.match(mail.html, /href="https:\/\/www\.namnskylt\.com\/aterforsaljare\/konto\/abcdefghijklmnopqrstuvwxyz012345"/);
  });
});
