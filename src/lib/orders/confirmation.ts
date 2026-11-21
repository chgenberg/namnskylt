import "server-only";
import { requireDb } from "@/lib/db/client";
import { sellerBrand } from "@/lib/email/seller-brand";
import { sendTransactional } from "@/lib/email/transactional";
import { noticeEmailSettings } from "@/lib/notices/email";
import { getShop } from "@/lib/shops/repository";
import { composeOrderConfirmation } from "./confirmation-email";
import { badgeCount, customerGetsSiteMail } from "./model";
import { priceWithPricing } from "./pricing";
import { databaseConfigured, getOrderForDispatch, getSellerProfile } from "./repository";

/**
 * Mejlar orderbekräftelsen till en kund som har beställt själv i en återförsäljares butik
 * (`customerGetsSiteMail`), i butikens utseende: dess logga, namn och färg. En direktorder hos
 * namnskylt.com bekräftas av Skylt & Gravyrtekniks system och får inget mejl härifrån. Gör
 * ingenting förrän mejlen är påslagna (`noticeEmailSettings`). Kastar aldrig: ordern är redan
 * lagd, och ett mejl som inte går iväg får inte ge kunden ett fel.
 */
export async function sendOrderConfirmation(orderNo: string): Promise<void> {
  try {
    const settings = noticeEmailSettings();
    if (!settings || !databaseConfigured()) return;
    const order = await getOrderForDispatch(orderNo);
    if (!order || !customerGetsSiteMail(order)) return;
    const [company, shop] = await Promise.all([getSellerProfile(order.resellerId), order.shopSlug ? getShop(order.shopSlug) : null]);
    // Kunden möter säljaren som i butiken: butikens egen logga, namn och färg.
    const face = shop ? shop.profile : company;
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
          sellerName: face.name || company.name,
          replyTo: face.email || company.email || settings.replyTo,
          fromAddress: settings.replyTo,
          termsUrl: `${settings.origin}${shop ? `/butik/${shop.slug}/villkor` : "/villkor"}`,
          brand: await sellerBrand(face, settings.origin, `${settings.origin}/order/${order.customerToken}/logga.png`),
        },
      ),
      settings,
    );
    if (sent) await requireDb()`update orders set confirmation_emailed_at = now() where order_no = ${orderNo}`;
  } catch (error) {
    console.error("Orderbekräftelsen kunde inte mejlas", error);
  }
}
