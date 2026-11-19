import "server-only";
import { badgeGroups, toOfferedDocument, type BadgeGroup } from "@/engine";
import { db } from "@/lib/db/client";
import { isErasedCustomer } from "@/lib/orders/erase-model";
import { getAccountOrder } from "@/lib/orders/repository";
import { accountView } from "./accounts";
import type { CustomerAccountView } from "./model";
import { currentCustomer } from "./session";
import { customerOrderNumber } from "@/lib/orders/model";

const ORDER_NO = /^NS-\d{1,9}$/;

export interface CustomerDesignerContext {
  /** Kundkonton finns: databasen är inkopplad. */
  accounts: boolean;
  /** Kunden som är inloggad på platsen, eller `null`. */
  customer: CustomerAccountView | null;
  /** Ordern som öppnas med "Beställ igen", med skyltarna som designer i varukorgen. */
  reorder?: { orderNo: string; groups: BadgeGroup[] };
}

/**
 * Det skyltmotorn behöver veta om kundens konto: vem som är inloggad på
 * namnskylt.com (`shop` är `null`) eller i butiken, och ordern som ska
 * beställas igen. Bara en order som hör till det inloggade kontot öppnas.
 */
export async function customerDesignerContext(shop: string | null, reorderNo: string | undefined): Promise<CustomerDesignerContext> {
  if (!db()) return { accounts: false, customer: null };
  const account = await currentCustomer(shop);
  if (!account) return { accounts: true, customer: null };
  const order = reorderNo && ORDER_NO.test(reorderNo) ? await getAccountOrder(account.id, reorderNo) : null;
  const reorder =
    order && order.badges.length > 0 && !isErasedCustomer(order.customer)
      ? // Äldre skyltar flyttas till dagens sortiment, som när en delad skylt öppnas.
        { orderNo: order.orderNo, label: customerOrderNumber(order).number, groups: badgeGroups(order.badges.map(toOfferedDocument)) }
      : undefined;
  return { accounts: true, customer: accountView(account), reorder };
}
