import "server-only";
import { requireDb } from "@/lib/db/client";
import { sendTransactional } from "@/lib/email/transactional";
import { noticeEmailSettings } from "@/lib/notices/email";
import { getShop } from "@/lib/shops/repository";
import { composeOrderConfirmation } from "./confirmation-email";
import { badgeCount } from "./model";
import { priceWithPricing } from "./pricing";
import { databaseConfigured, getCompanyProfile, getOrderForDispatch } from "./repository";

/**
 * Mejlar orderbekräftelsen till en kund som har beställt själv. Gör ingenting
 * förrän sajtens mejl är påslagna (`RESEND_API_KEY` och `NOTICE_FROM_EMAIL`).
 * Kastar aldrig: ordern är redan lagd, och ett mejl som inte går iväg får inte
 * ge kunden ett fel.
 */
export async function sendOrderConfirmation(orderNo: string): Promise<void> {
  try {
    const settings = noticeEmailSettings();
    if (!settings || !databaseConfigured()) return;
    const order = await getOrderForDispatch(orderNo);
    if (!order || order.demo) return;
    const [company, shop] = await Promise.all([getCompanyProfile(order.resellerId), order.shopSlug ? getShop(order.shopSlug) : null]);
    const price = priceWithPricing(order.badges, order.pricing, order.priceList, order.shippingSek);
    const sent = await sendTransactional(
      composeOrderConfirmation(
        {
          orderNo: order.orderNo,
          customerName: order.customer.name,
          customerEmail: order.customer.email,
          quantity: badgeCount(order),
          goodsSek: price.goodsSek,
          shippingSek: price.shippingSek,
          delivery: order.delivery,
          payment: order.payment,
          orderUrl: `${settings.origin}/order/${order.customerToken}`,
        },
        {
          sellerName: shop?.profile.name || company.name,
          replyTo: company.email || settings.replyTo,
          fromAddress: settings.replyTo,
          termsUrl: `${settings.origin}${shop ? `/butik/${shop.slug}/villkor` : "/villkor"}`,
        },
      ),
    );
    if (sent) await requireDb()`update orders set confirmation_emailed_at = now() where order_no = ${orderNo}`;
  } catch (error) {
    console.error("Orderbekräftelsen kunde inte mejlas", error);
  }
}
