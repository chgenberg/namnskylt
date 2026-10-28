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
  {
    id: "003_pricing_quotes",
    sql: `
      alter table orders add column pricing jsonb;
      alter table customers add column phone text;
      alter table customers add column org_number text;
      alter table customers add column address text;

      create sequence quote_number_seq start 1001;

      create table quotes (
        id uuid primary key default gen_random_uuid(),
        quote_no text not null unique default ('OF-' || nextval('quote_number_seq')),
        customer_id uuid not null references customers(id),
        status text not null default 'draft',
        badges jsonb not null,
        pricing jsonb,
        total_sek integer not null,
        total_incl_vat_sek integer not null,
        message text,
        valid_until date not null,
        token text not null unique,
        order_id uuid references orders(id),
        decline_reason text,
        is_demo boolean not null default false,
        created_at timestamptz not null default now(),
        sent_at timestamptz,
        decided_at timestamptz
      );
      create index quotes_created on quotes (created_at desc);
      create index quotes_customer on quotes (customer_id);

      create table quote_events (
        id bigserial primary key,
        quote_id uuid not null references quotes(id) on delete cascade,
        status text not null,
        note text,
        at timestamptz not null default now()
      );
      create index quote_events_quote on quote_events (quote_id, at);
    `,
  },
  {
    id: "004_supplier_sync",
    sql: `
      alter table orders add column supplier_synced_at timestamptz;
      create index orders_supplier_order_no on orders (supplier_order_no);
    `,
  },
  {
    id: "005_settings",
    sql: `
      create table settings (
        key text primary key,
        value jsonb not null,
        updated_at timestamptz not null default now()
      );
    `,
  },
  {
    id: "006_badge_shots",
    sql: `
      alter table orders add column badge_shot text;
      alter table quotes add column badge_shot text;
    `,
  },
  {
    id: "007_shops",
    sql: `
      create table shops (
        slug text primary key,
        data jsonb not null,
        created_at timestamptz not null default now()
      );
      alter table orders add column shop_slug text references shops(slug) on delete set null;
    `,
  },
  {
    id: "008_quote_project",
    sql: `alter table quotes add column project text;`,
  },
  {
    id: "009_tenants",
    sql: `
      create table reseller_accounts (
        id text primary key,
        name text not null,
        email text not null unique,
        password_hash text not null,
        created_at timestamptz not null default now()
      );
      alter table customers add column reseller_id text not null default 'namnskylt';
      alter table orders add column reseller_id text not null default 'namnskylt';
      alter table quotes add column reseller_id text not null default 'namnskylt';
      alter table customers drop constraint customers_email_key;
      create unique index customers_reseller_email on customers (reseller_id, email);
      create index orders_reseller on orders (reseller_id, placed_at desc);
      create index quotes_reseller on quotes (reseller_id, created_at desc);
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
