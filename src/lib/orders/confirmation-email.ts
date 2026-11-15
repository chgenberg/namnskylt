import { VAT_RATE } from "@/engine";
import type { EmailMessage } from "@/lib/email";
import { escapeHtml, fromWithName, oneLine } from "@/lib/email/transactional";
import { formatSek } from "@/lib/format";
import { paymentLabel, type OrderPayment } from "@/lib/payments/model";
import { deliveryLines, SHIPPING_METHOD_LABEL, shippingMethodOf, type Delivery } from "./delivery";

/** Det orderbekräftelsen behöver veta om ordern. Inga inköpspriser, bara det kunden betalar. */
export interface ConfirmedOrder {
  orderNo: string;
  customerName: string;
  customerEmail: string;
  quantity: number;
  /** Skyltarna, exklusive moms och frakt. */
  goodsSek: number;
  shippingSek: number;
  delivery: Delivery | null;
  payment: OrderPayment | null;
  /** Kundens egen ordersida, där ordern går att följa. */
  orderUrl?: string;
}

export interface ConfirmationSender {
  /** Säljaren som kunden har handlat av: namnskylt.com eller butiken. */
  sellerName: string;
  /** Dit kundens svar går. */
  replyTo: string;
  /** Adressen mejlet skickas från. */
  fromAddress: string;
  /** Länken till köpvillkoren. */
  termsUrl: string;
}

/** Orderbekräftelsen till en kund som har beställt själv: vad som beställdes, vad det kostar och vart det skickas. */
export function composeOrderConfirmation(order: ConfirmedOrder, sender: ConfirmationSender): EmailMessage {
  const method = shippingMethodOf(order.delivery);
  // Expressfraktens pris sätts i efterhand, så summan är utan den.
  const express = method === "express";
  const exVat = order.goodsSek + order.shippingSek;
  const vat = Math.round(exVat * VAT_RATE);
  const shipping = express ? "tillkommer" : formatSek(order.shippingSek);
  const rows: [string, string][] = [
    [`Namnskyltar, ${order.quantity} st`, formatSek(order.goodsSek)],
    [`Frakt, ${SHIPPING_METHOD_LABEL[method].toLowerCase()}`, shipping],
    ["Moms 25 %", formatSek(vat)],
    [express ? "Summa inkl. moms, utan frakt" : "Summa inkl. moms", formatSek(exVat + vat)],
    ["Betalning", paymentLabel(order.payment)],
  ];
  const address = order.delivery ? deliveryLines(order.delivery.address) : [];
  const subject = oneLine(`Orderbekräftelse ${order.orderNo}`);
  const intro = `Tack för din beställning hos ${oneLine(sender.sellerName)}. Vi har tagit emot order ${order.orderNo}.`;
  const outro = "Skyltarna tillverkas i Sverige och skickas inom fem arbetsdagar. Svara på det här mejlet om något ska ändras.";
  const text = [
    `Hej ${oneLine(order.customerName)},`,
    "",
    intro,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(address.length > 0 ? ["", "Levereras till:", ...address] : []),
    "",
    outro,
    ...(order.orderUrl ? ["", `Följ din order: ${order.orderUrl}`] : []),
    "",
    `Köpvillkor: ${sender.termsUrl}`,
  ].join("\n");
  const cell = "padding:4px 16px 4px 0";
  const html = [
    `<p>Hej ${escapeHtml(oneLine(order.customerName))},</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    `<table style="border-collapse:collapse">${rows
      .map(([label, value]) => `<tr><td style="${cell}">${escapeHtml(label)}</td><td style="${cell};text-align:right">${escapeHtml(value)}</td></tr>`)
      .join("")}</table>`,
    address.length > 0 ? `<p><strong>Levereras till</strong><br>${address.map(escapeHtml).join("<br>")}</p>` : null,
    `<p>${escapeHtml(outro)}</p>`,
    order.orderUrl ? `<p><a href="${escapeHtml(order.orderUrl)}">Följ din order</a></p>` : null,
    `<p style="color:#666;font-size:13px"><a href="${escapeHtml(sender.termsUrl)}">Köpvillkor</a></p>`,
  ]
    .filter((part) => part !== null)
    .join("\n");
  return {
    from: fromWithName(sender.sellerName, sender.fromAddress),
    to: order.customerEmail,
    replyTo: sender.replyTo,
    subject,
    html,
    text,
    headers: { "Auto-Submitted": "auto-generated" },
    // Samma order ger aldrig två bekräftelser, även om utskicket skulle göras om.
    idempotencyKey: `order-confirmation:${order.orderNo}`,
  };
}

/** Det mejlet om en skickad order behöver veta. */
export interface ShippedOrder {
  orderNo: string;
  customerName: string;
  customerEmail: string;
  /** Länken där försändelsen går att följa, när verkstaden har lämnat en. */
  trackingUrl: string | null;
  /** Kundens egen ordersida. */
  orderUrl: string;
}

/** Mejlet till kunden när verkstaden har skickat skyltarna: att de är på väg, och var de går att följa. */
export function composeShippedEmail(order: ShippedOrder, sender: Omit<ConfirmationSender, "termsUrl">): EmailMessage {
  const intro = `Dina namnskyltar är på väg. Order ${order.orderNo} har skickats från tillverkningen.`;
  const text = [
    `Hej ${oneLine(order.customerName)},`,
    "",
    intro,
    ...(order.trackingUrl ? ["", `Följ försändelsen: ${order.trackingUrl}`] : []),
    "",
    `Din order: ${order.orderUrl}`,
    "",
    "Där kan du också beställa fler skyltar med samma design, till exempel när ni får ny personal.",
  ].join("\n");
  const html = [
    `<p>Hej ${escapeHtml(oneLine(order.customerName))},</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    order.trackingUrl ? `<p><a href="${escapeHtml(order.trackingUrl)}">Följ försändelsen</a></p>` : null,
    `<p><a href="${escapeHtml(order.orderUrl)}">Se din order</a>. Där kan du också beställa fler skyltar med samma design, till exempel när ni får ny personal.</p>`,
  ]
    .filter((part) => part !== null)
    .join("\n");
  return {
    from: fromWithName(sender.sellerName, sender.fromAddress),
    to: order.customerEmail,
    replyTo: sender.replyTo,
    subject: oneLine(`Dina namnskyltar är skickade (${order.orderNo})`),
    html,
    text,
    headers: { "Auto-Submitted": "auto-generated" },
    idempotencyKey: `order-shipped:${order.orderNo}`,
  };
}
