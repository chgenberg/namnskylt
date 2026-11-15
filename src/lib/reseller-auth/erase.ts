import "server-only";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { customerErasurePlan, eraseCustomerIn } from "@/lib/orders/erase";
import type { AccountErasure } from "@/lib/orders/erase-model";
import { isOwner, TENANT_ID } from "@/lib/tenants/model";

const NOTHING: AccountErasure = { customers: 0, quotes: 0, designs: 0, ordersRemoved: 0, ordersKept: 0, shops: 0 };

/** Ägarens id är admin-inlogget och går aldrig att ta bort. */
function erasable(accountId: string): boolean {
  return TENANT_ID.test(accountId) && !isOwner(accountId);
}

/**
 * Vad som tas bort och behålls om kontot raderas nu, utan att något ändras.
 * `null` när kontot inte finns eller är ägarens.
 */
export async function accountErasurePlan(accountId: string): Promise<AccountErasure | null> {
  if (!erasable(accountId)) return null;
  const sql = requireDb();
  const [account] = await sql<{ shops: number }[]>`
    select (select count(*)::int from shops s where s.owner_id = a.id) as shops
      from reseller_accounts a where a.id = ${accountId}`;
  if (!account) return null;
  const customers = await sql<{ id: string }[]>`select id from customers where reseller_id = ${accountId}`;
  const plan: AccountErasure = { ...NOTHING, customers: customers.length, shops: account.shops };
  for (const customer of customers) {
    const part = await customerErasurePlan(accountId, customer.id);
    if (!part) continue;
    plan.quotes += part.quotes;
    plan.designs += part.designs;
    plan.ordersRemoved += part.ordersRemoved;
    plan.ordersKept += part.ordersKept;
  }
  return plan;
}

/**
 * Tar bort ett återförsäljarkonto för gott, i en transaktion.
 *
 * Varje kund under kontot tas bort som i `eraseCustomerIn`. Kontots besked,
 * sparade inställningar (företagsuppgifter, leveransadress), butiker,
 * ansökningar och inloggningen raderas. Butikerna raderas i stället för att
 * tappa sin ägare, eftersom en butik utan ägare är namnskylt.coms och skulle
 * ligga kvar publikt. Ordrar som hör till bokföringen står kvar under kontots
 * id, utan personuppgifter. `null` när kontot inte finns eller är ägarens.
 */
export async function eraseAccount(accountId: string): Promise<AccountErasure | null> {
  if (!erasable(accountId)) return null;
  const sql = requireDb();
  return sql.begin(async (tx) => {
    const [account] = await tx<{ id: string }[]>`select id from reseller_accounts where id = ${accountId} for update`;
    if (!account) return null;
    const customers = await tx<{ id: string }[]>`select id from customers where reseller_id = ${accountId}`;
    const result: AccountErasure = { ...NOTHING, customers: customers.length };
    for (const customer of customers) {
      const part = await eraseCustomerIn(tx, accountId, customer.id);
      if (!part) continue;
      result.quotes += part.quotes;
      result.designs += part.designs;
      result.ordersRemoved += part.ordersRemoved;
      result.ordersKept += part.ordersKept;
    }
    // Alla offerter hör till en kund och är redan borta; raden fångar en offert vars kund ligger fel.
    await tx`delete from quotes where reseller_id = ${accountId}`;
    await tx`delete from notices where reseller_id = ${accountId}`;
    // Inställningarna nycklas `<nyckel>:<konto>`. Ett konto-id har varken `%` eller `_`, så mönstret träffar bara kontots egna.
    await tx`delete from settings where key like ${`%:${accountId}`}`;
    const shops = await tx`delete from shops where owner_id = ${accountId} returning slug`;
    result.shops = shops.length;
    await tx`delete from reseller_applications where account_id = ${accountId}`;
    // Länkarna för att välja lösenord följer med kontot.
    await tx`delete from reseller_accounts where id = ${accountId}`;
    return result;
  });
}

/** Tar bort en ansökan för gott. Länken för att välja lösenord och beskedet följer med. Ett konto som redan skapats rörs inte. */
export async function eraseApplication(applicationId: string): Promise<boolean> {
  if (!z.uuid().safeParse(applicationId).success) return false;
  const sql = requireDb();
  const rows = await sql`delete from reseller_applications where id = ${applicationId} returning id`;
  return rows.length > 0;
}
