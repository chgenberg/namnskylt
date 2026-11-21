import "server-only";
import { requireDb } from "@/lib/db/client";
import { sellerBrand } from "@/lib/email/seller-brand";
import { sendTransactional } from "@/lib/email/transactional";
import { noticeEmailSettings } from "@/lib/notices/email";
import { customerLabel } from "@/lib/notices/model";
import { notify } from "@/lib/notices/notify";
import { getShop } from "@/lib/shops/repository";
import { composeShippedEmail } from "./confirmation-email";
import { customerGetsSiteMail } from "./model";
import { databaseConfigured, getOrderForDispatch, getSellerProfile } from "./repository";

/**
 * Verkstaden har skickat ordern. Den som äger ordern får ett besked i panelen. Kunden får ett
 * mejl med spårningslänken när den själv har beställt i en återförsäljares butik
 * (`customerGetsSiteMail`), i butikens utseende, och mejlen är påslagna. En direktorder hos
 * namnskylt.com aviseras av Skylt & Gravyrtekniks system. Kastar aldrig: statusen är redan sparad.
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
    if (!settings || order.delivery?.to === "reseller" || !customerGetsSiteMail(order)) return;
    const [company, shop] = await Promise.all([getSellerProfile(order.resellerId), order.shopSlug ? getShop(order.shopSlug) : null]);
    const face = shop ? shop.profile : company;
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
          sellerName: face.name || company.name,
          replyTo: face.email || company.email || settings.replyTo,
          fromAddress: settings.replyTo,
          brand: await sellerBrand(face, settings.origin, `${settings.origin}/order/${order.customerToken}/logga.png`),
        },
      ),
      settings,
    );
    if (sent) await requireDb()`update orders set shipping_emailed_at = now() where order_no = ${orderNo}`;
  } catch (error) {
    console.error("Beskedet om att ordern är skickad gick inte ut", error);
  }
}
