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
  {
    id: "010_order_project",
    sql: `alter table orders add column project text;`,
  },
  {
    id: "011_shop_options_events_domains",
    sql: `
      alter table shops add column options jsonb;
      create unique index shops_domain on shops ((lower(data->>'domain'))) where data->>'domain' is not null;
      create table shop_events (
        id bigserial primary key,
        shop_slug text not null references shops(slug) on delete cascade,
        kind text not null,
        at timestamptz not null default now()
      );
      create index shop_events_shop on shop_events (shop_slug, at desc);
    `,
  },
  {
    id: "012_shop_editor",
    sql: `
      alter table shops add column owner_id text references reseller_accounts(id) on delete set null;
      alter table shops add column content jsonb;
      alter table shops add column draft jsonb;
      create index shops_owner on shops (owner_id);
      create table shop_content_versions (
        id bigserial primary key,
        shop_slug text not null references shops(slug) on delete cascade,
        content jsonb not null,
        published_by text,
        published_at timestamptz not null default now()
      );
      create index shop_content_versions_shop on shop_content_versions (shop_slug, published_at desc);
      create table shop_images (
        id text primary key,
        shop_slug text not null references shops(slug) on delete cascade,
        mime text not null,
        bytes bytea not null,
        width int not null,
        height int not null,
        created_at timestamptz not null default now()
      );
      create index shop_images_shop on shop_images (shop_slug, created_at desc);
      create table shop_invites (
        token text primary key,
        shop_slug text not null references shops(slug) on delete cascade,
        email text not null,
        created_at timestamptz not null default now(),
        expires_at timestamptz not null,
        used_at timestamptz
      );
    `,
  },
  {
    id: "013_outreach",
    sql: `
      create table outreach_campaigns (
        id uuid primary key default gen_random_uuid(),
        slug text not null unique,
        name text not null,
        status text not null default 'draft' check (status in ('draft','active','paused','done')),
        paused_reason text,
        from_name text not null,
        from_email text not null,
        reply_to text not null,
        signature jsonb not null default '{}'::jsonb,
        daily_cap int not null default 40 check (daily_cap between 1 and 200),
        steps jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table outreach_leads (
        id uuid primary key default gen_random_uuid(),
        email text not null,
        contact_name text,
        company_name text not null,
        phone text,
        city text,
        country text not null check (country in ('se','no','ax')),
        customer_since date,
        activated boolean not null default false,
        known boolean not null default false,
        website text,
        up_shop_url text,
        brand jsonb,
        wave text check (wave in ('internal','A','B','C','NO')),
        status text not null default 'draft'
          check (status in ('draft','blocked','approved','in_sequence','completed','converted','suppressed','expired')),
        check_reason text,
        stop_reason text check (stop_reason in ('landed','replied','activated','unsubscribed','bounced','complained','manual')),
        approved_at timestamptz,
        approved_by text,
        shop_slug text unique references shops(slug) on delete set null,
        invite_token text references shop_invites(token) on delete set null,
        reseller_id text references reseller_accounts(id) on delete set null,
        landed_at timestamptz,
        demo_opened_at timestamptz,
        replied_at timestamptz,
        attributed_at timestamptz,
        first_order_at timestamptz,
        note text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create unique index outreach_leads_email on outreach_leads (lower(email));
      create index outreach_leads_wave_status on outreach_leads (wave, status);

      create table outreach_messages (
        id uuid primary key default gen_random_uuid(),
        campaign_id uuid not null references outreach_campaigns(id) on delete cascade,
        lead_id uuid not null references outreach_leads(id) on delete cascade,
        step smallint not null check (step >= 1),
        status text not null default 'scheduled'
          check (status in ('scheduled','ready','sending','sent','delivered','bounced','complained','failed','needs_review','cancelled','skipped')),
        idempotency_key text not null unique,
        subject text,
        not_before timestamptz not null default now(),
        next_attempt_at timestamptz,
        attempts int not null default 0,
        claimed_at timestamptz,
        sent_at timestamptz,
        resend_id text,
        last_error text,
        cancel_reason text,
        expires_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (campaign_id, lead_id, step)
      );
      create unique index outreach_messages_resend_id on outreach_messages (resend_id) where resend_id is not null;
      create index outreach_messages_queue on outreach_messages (status, not_before);
      create index outreach_messages_lead on outreach_messages (lead_id);

      create table outreach_events (
        id bigserial primary key,
        provider_event_id text not null unique,
        message_id uuid references outreach_messages(id) on delete set null,
        resend_id text,
        type text not null,
        payload jsonb not null,
        occurred_at timestamptz not null,
        received_at timestamptz not null default now()
      );
      create index outreach_events_message on outreach_events (message_id, occurred_at);

      create table outreach_suppressions (
        email text primary key,
        reason text not null check (reason in ('unsubscribe','bounce','complaint','manual','erasure')),
        source text not null check (source in ('link','one_click','webhook','operator','import')),
        message_id uuid references outreach_messages(id) on delete set null,
        created_at timestamptz not null default now()
      );

      create table outreach_assets (
        id text primary key,
        lead_id uuid not null references outreach_leads(id) on delete cascade,
        kind text not null check (kind in ('hero','tile')),
        material_id text not null,
        mime text not null,
        bytes bytea not null,
        width int not null,
        height int not null,
        badge jsonb not null,
        logo_status text not null check (logo_status in ('logo','text-only')),
        created_at timestamptz not null default now()
      );
      create index outreach_assets_lead on outreach_assets (lead_id, kind);

      create table outreach_control (
        id boolean primary key default true check (id),
        paused boolean not null default true,
        mode text not null default 'dry_run' check (mode in ('dry_run','live')),
        updated_by text,
        updated_at timestamptz not null default now()
      );
      insert into outreach_control (id) values (true);

      create table outreach_ticks (
        id bigserial primary key,
        trigger text not null,
        started_at timestamptz not null default now(),
        finished_at timestamptz,
        result jsonb
      );
      create index outreach_ticks_started on outreach_ticks (started_at desc);
    `,
  },
  {
    id: "014_outreach_persona",
    sql: `
      alter table outreach_assets drop constraint outreach_assets_kind_check;
      alter table outreach_assets add constraint outreach_assets_kind_check check (kind in ('hero','tile','persona'));
    `,
  },
  {
    id: "015_outreach_asset_review",
    sql: `
      alter table outreach_assets add column review text not null default 'pending'
        check (review in ('pending','approved','rejected'));
    `,
  },
  {
    // Prismodellen som gällde när ordern eller offerten skapades. Tom = skapad före modellen.
    id: "016_price_model",
    sql: `
      alter table orders add column price_model jsonb;
      alter table quotes add column price_model jsonb;
    `,
  },
  {
    // Startkostnaden börjar på 200 kr i den sparade prismodellen. Modeller på ordrar och
    // offerter rörs inte: de saknar fältet och läses som 0, så deras priser står kvar.
    id: "017_price_model_start_cost",
    sql: `
      update settings
         set value = jsonb_set(value, '{startSek}', '200'::jsonb), updated_at = now()
       where key = 'price_model' and not (value ? 'startSek');
    `,
  },
  {
    // Loggor i färg. En bild sparas en gång och pekas ut av skyltarna med sitt id (bildens SHA-256).
    id: "018_logo_images",
    sql: `
      create table logo_images (
        id text primary key check (id ~ '^[0-9a-f]{64}$'),
        png bytea not null,
        created_at timestamptz not null default now()
      );
    `,
  },
  {
    // Frakten, Skylt & Gravyrtekniks prislista rakt av. Ordrar och offerter behåller sin sparade modell utan frakt.
    id: "019_price_model_shipping",
    sql: `
      update settings
         set value = jsonb_set(value, '{shipping}', '{"letterSek": 75, "parcelSek": 159, "letterMaxSek": 500}'::jsonb), updated_at = now()
       where key = 'price_model' and not (value ? 'shipping');
    `,
  },
  {
    // Leveransadress på order och offert, och orderns väg till verkstaden: när den skickades,
    // senaste felet och antalet försök. En order utan supplier_sent_at väntar på att skickas.
    id: "020_delivery_and_dispatch",
    sql: `
      alter table orders add column delivery jsonb;
      alter table orders add column supplier_sent_at timestamptz;
      alter table orders add column supplier_claimed_at timestamptz;
      alter table orders add column supplier_error text;
      alter table orders add column supplier_attempts integer not null default 0;
      alter table quotes add column delivery jsonb;
    `,
  },
  {
    // Ansökan om att bli återförsäljare, som admin godkänner eller avslår, och hemliga länkar
    // för att välja lösenord: en vid godkänd ansökan och en när admin återställer ett konto.
    // Bara länkens SHA-256 sparas.
    id: "021_reseller_applications",
    sql: `
      create table reseller_applications (
        id uuid primary key default gen_random_uuid(),
        company text not null,
        org_number text not null,
        contact_name text not null,
        email text not null,
        phone text,
        address text not null,
        website text,
        message text,
        status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
        account_id text references reseller_accounts(id) on delete set null,
        created_at timestamptz not null default now(),
        decided_at timestamptz
      );
      create index reseller_applications_status on reseller_applications (status, created_at desc);
      create unique index reseller_applications_pending_email on reseller_applications (lower(email)) where status = 'pending';

      create table reseller_access_links (
        token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
        kind text not null check (kind in ('activate', 'reset')),
        application_id uuid references reseller_applications(id) on delete cascade,
        account_id text references reseller_accounts(id) on delete cascade,
        created_at timestamptz not null default now(),
        expires_at timestamptz not null,
        used_at timestamptz,
        check ((kind = 'activate' and application_id is not null) or (kind = 'reset' and account_id is not null))
      );
    `,
  },
  {
    // Besked till den som äger panelen när någon annan har gjort något: kunden har svarat på en
    // offert eller ett korrektur, lagt en order själv, eller ett företag har ansökt om konto.
    // Beskedet försvinner med ordern, offerten eller ansökan det gäller.
    id: "022_notices",
    sql: `
      create table notices (
        id uuid primary key default gen_random_uuid(),
        reseller_id text not null,
        kind text not null,
        who text not null,
        detail text,
        quote_id uuid references quotes(id) on delete cascade,
        order_id uuid references orders(id) on delete cascade,
        application_id uuid references reseller_applications(id) on delete cascade,
        created_at timestamptz not null default now(),
        read_at timestamptz,
        emailed_at timestamptz
      );
      create index notices_unread on notices (reseller_id, created_at desc) where read_at is null;
    `,
  },
  {
    // Formuläret för att skapa konto har samma fält som hos Skylt & Gravyrteknik: en egen
    // e-postadress för fakturor och en leveransadress. Äldre ansökningar saknar båda.
    id: "023_application_invoice_email_and_delivery",
    sql: `
      alter table reseller_applications add column invoice_email text;
      alter table reseller_applications add column delivery jsonb;
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
