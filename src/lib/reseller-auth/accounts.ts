import "server-only";
import { requireDb } from "@/lib/db/client";
import { TENANT_ID } from "@/lib/tenants/model";
import { hashPassword, verifyPassword } from "./password";

export interface ResellerAccount {
  id: string;
  name: string;
  email: string;
}

/** Kontot för e-post och lösenord, eller `null` — samma svar oavsett vilket som var fel. */
export async function authenticate(email: string, password: string): Promise<ResellerAccount | null> {
  const sql = requireDb();
  const [row] = await sql<(ResellerAccount & { password_hash: string })[]>`
    select id, name, email, password_hash from reseller_accounts where email = ${email.trim().toLowerCase()}`;
  if (!row || !(await verifyPassword(password, row.password_hash))) return null;
  return { id: row.id, name: row.name, email: row.email };
}

export async function createAccount(input: { id: string; name: string; email: string; password: string }): Promise<void> {
  if (!TENANT_ID.test(input.id)) throw new Error("Ogiltigt id");
  const sql = requireDb();
  await sql`
    insert into reseller_accounts (id, name, email, password_hash)
    values (${input.id}, ${input.name}, ${input.email.trim().toLowerCase()}, ${await hashPassword(input.password)})`;
}

export async function accountExists(id: string): Promise<boolean> {
  const sql = requireDb();
  const [row] = await sql`select 1 from reseller_accounts where id = ${id}`;
  return Boolean(row);
}
