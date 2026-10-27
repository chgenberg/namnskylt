import type { Sql } from "postgres";

/** Körs i ordning, en gång var. Ändra aldrig en körd migrering — lägg till en ny. */
export const MIGRATIONS: readonly { id: string; sql: string }[] = [
  {
    id: "001_orders",
    sql: `
      create table customers (
        id uuid primary key default gen_random_uuid(),
        email text not null unique,
        name text not null,
        company text,
        created_at timestamptz not null default now()
      );

      create sequence order_number_seq start 1050;

      create table orders (
        id uuid primary key default gen_random_uuid(),
        order_no text not null unique default ('NS-' || nextval('order_number_seq')),
        customer_id uuid not null references customers(id),
        status text not null,
        badges jsonb not null,
        total_sek integer not null,
        total_incl_vat_sek integer not null,
        supplier_order_no text,
        partner_request_no text,
        tracking_url text,
        source text not null default 'web',
        repeat_of uuid references orders(id),
        placed_at timestamptz not null default now()
      );
      create index orders_placed_at on orders (placed_at desc);
      create index orders_customer on orders (customer_id);

      create table order_events (
        id bigserial primary key,
        order_id uuid not null references orders(id) on delete cascade,
        status text not null,
        note text,
        at timestamptz not null default now()
      );
      create index order_events_order on order_events (order_id, at);

      create table designs (
        id uuid primary key default gen_random_uuid(),
        customer_id uuid not null references customers(id) on delete cascade,
        name text not null,
        doc jsonb not null,
        created_at timestamptz not null default now()
      );
      create index designs_customer on designs (customer_id);

      create table proofs (
        token text primary key,
        order_id uuid not null references orders(id) on delete cascade,
        status text not null default 'pending',
        comment text,
        created_at timestamptz not null default now(),
        decided_at timestamptz
      );
      create index proofs_order on proofs (order_id);
    `,
  },
  {
    id: "002_demo_flag",
    sql: `
      alter table customers add column is_demo boolean not null default false;
      alter table orders add column is_demo boolean not null default false;
    `,
  },
];

export async function migrate(sql: Sql): Promise<string[]> {
  await sql`create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql<{ id: string }[]>`select id from schema_migrations`).map((row) => row.id));
  const applied: string[] = [];
  for (const migration of MIGRATIONS) {
    if (done.has(migration.id)) continue;
    await sql.begin(async (tx) => {
      await tx.unsafe(migration.sql);
      await tx`insert into schema_migrations (id) values (${migration.id})`;
    });
    applied.push(migration.id);
  }
  return applied;
}
