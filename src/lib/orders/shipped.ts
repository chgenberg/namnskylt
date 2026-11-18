import "server-only";
import { requireDb } from "@/lib/db/client";
import { nameBrand } from "@/lib/email/layout";
import { sellerBrand } from "@/lib/email/seller-brand";
import { sendTransactional } from "@/lib/email/transactional";
import { noticeEmailSettings } from "@/lib/notices/email";
import { customerLabel } from "@/lib/notices/model";
import { notify } from "@/lib/notices/notify";
import { getShop } from "@/lib/shops/repository";
import { composeShippedEmail } from "./confirmation-email";
import { databaseConfigured, getOrderForDispatch, getSellerProfile } from "./repository";

/**
 * Verkstaden har skickat ordern. Den som äger ordern får ett besked i panelen,
 * och kunden får ett mejl med spårningslänken när skyltarna går till kunden och
 * sajtens mejl är påslagna. Kastar aldrig: statusen är redan sparad.
 */
export async function announceShipped(orderNo: string): Promise<void> {
  try {
    if (!databaseConfigured()) return;
    const order = await getOrderForDispatch(orderNo);
    if (!order || order.demo) return;
    await notify({
      tenant: order.resellerId,
      kind: "order-shipped",
      who: customerLabel(order.customer),
      detail: order.trackingUrl ? "Spårningslänken finns på ordern." : null,
      orderId: order.id,
    });
    const settings = noticeEmailSettings();
    // Går skyltarna till återförsäljaren är det den som tar emot paketet, och den har fått beskedet ovan.
    if (!settings || order.delivery?.to === "reseller") return;
    const [company, shop] = await Promise.all([getSellerProfile(order.resellerId), order.shopSlug ? getShop(order.shopSlug) : null]);
    const sent = await sendTransactional(
      composeShippedEmail(
        {
          orderNo: order.orderNo,
          customerName: order.customer.name,
          customerEmail: order.customer.email,
          trackingUrl: order.trackingUrl,
          orderUrl: `${settings.origin}/order/${order.customerToken}`,
        },
        {
          sellerName: shop?.profile.name || company.name,
          replyTo: company.email || settings.replyTo,
          fromAddress: settings.replyTo,
          brand: shop ? nameBrand(shop.profile.name, shop.profile.primaryColor) : await sellerBrand(company, settings.origin),
        },
      ),
    );
    if (sent) await requireDb()`update orders set shipping_emailed_at = now() where order_no = ${orderNo}`;
  } catch (error) {
    console.error("Beskedet om att ordern är skickad gick inte ut", error);
  }
}
