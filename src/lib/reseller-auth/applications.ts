import "server-only";
import { requireDb } from "@/lib/db/client";
import { notify } from "@/lib/notices/notify";
import { deliveryAddressSchema } from "@/lib/orders/delivery";
import { dropUnreadApplicationNotices } from "@/lib/notices/repository";
import { OWNER_TENANT } from "@/lib/tenants/model";
import type { ApplicationStatus, ResellerApplication, ResellerApplicationInput } from "./application-model";

interface ApplicationRow {
  id: string;
  company: string;
  org_number: string;
  contact_name: string;
  email: string;
  phone: string | null;
  address: string;
  invoice_email: string | null;
  delivery: unknown;
  website: string | null;
  message: string | null;
  status: ApplicationStatus;
  account_id: string | null;
  created_at: Date;
  decided_at: Date | null;
}

function toApplication(row: ApplicationRow): ResellerApplication {
  const delivery = deliveryAddressSchema.safeParse(row.delivery);
  return {
    id: row.id,
    company: row.company,
    orgNumber: row.org_number,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone ?? "",
    address: row.address,
    invoiceEmail: row.invoice_email ?? "",
    delivery: delivery.success ? delivery.data : null,
    website: row.website ?? "",
    message: row.message ?? "",
    status: row.status,
    accountId: row.account_id,
    createdAt: row.created_at.toISOString(),
    decidedAt: row.decided_at?.toISOString() ?? null,
  };
}

/**
 * Sparar ansökan och säger till namnskylt.com. Har samma e-post redan en ansökan
 * som väntar skrivs den över, så att en sökande inte ger flera rader eller flera besked.
 */
export async function saveApplication(input: ResellerApplicationInput): Promise<void> {
  const sql = requireDb();
  const [row] = await sql<{ id: string }[]>`
    insert into reseller_applications (company, org_number, contact_name, email, phone, address, invoice_email, delivery, website, message)
    values (${input.company}, ${input.orgNumber}, ${input.contactName}, ${input.email}, ${input.phone || null},
            ${input.address}, ${input.invoiceEmail || null}, ${input.delivery ? sql.json({ ...input.delivery }) : null},
            ${input.website || null}, ${input.message || null})
    on conflict (lower(email)) where status = 'pending' do update
      set company = excluded.company, org_number = excluded.org_number, contact_name = excluded.contact_name,
          phone = excluded.phone, address = excluded.address, invoice_email = excluded.invoice_email,
          delivery = excluded.delivery, website = excluded.website, message = excluded.message,
          created_at = now()
    returning id`;
  if (!row) return;
  await dropUnreadApplicationNotices(row.id);
  await notify({ tenant: OWNER_TENANT, kind: "application", who: input.company, applicationId: row.id });
}

/** Ansökningar som väntar på beslut — siffran i adminens meny. */
export async function countPendingApplications(): Promise<number> {
  const sql = requireDb();
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from reseller_applications where status = 'pending'`;
  return row?.count ?? 0;
}

/** Alla ansökningar: de som väntar först, sedan nyast först. */
export async function listApplications(): Promise<ResellerApplication[]> {
  const sql = requireDb();
  const rows = await sql<ApplicationRow[]>`
    select * from reseller_applications order by (status = 'pending') desc, created_at desc limit 200`;
  return rows.map(toApplication);
}

export async function getApplication(id: string): Promise<ResellerApplication | null> {
  const sql = requireDb();
  const [row] = await sql<ApplicationRow[]>`select * from reseller_applications where id = ${id}`;
  return row ? toApplication(row) : null;
}

/** Godkänner eller avslår en ansökan som väntar. `false` när den redan är avgjord. */
export async function decideApplication(id: string, status: "approved" | "rejected"): Promise<boolean> {
  const sql = requireDb();
  const [row] = await sql<{ id: string }[]>`
    update reseller_applications set status = ${status}, decided_at = now()
     where id = ${id} and status = 'pending'
    returning id`;
  return Boolean(row);
}

/** Kontot som skapades ur ansökan. */
export async function linkApplicationAccount(id: string, accountId: string): Promise<void> {
  const sql = requireDb();
  await sql`update reseller_applications set account_id = ${accountId} where id = ${id}`;
}

/** Antal ansökningar som väntar på beslut. */
export async function pendingApplications(): Promise<number> {
  const sql = requireDb();
  const [row] = await sql<{ count: number }[]>`select count(*)::int as count from reseller_applications where status = 'pending'`;
  return row?.count ?? 0;
}
