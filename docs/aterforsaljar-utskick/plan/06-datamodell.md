# 06 — Datamodell

## 1. Sammanfattning

Namnskylt har ingen Drizzle och inga `.sql`-filer. Schema är en array i `src/lib/db/migrations.ts` (`MIGRATIONS`), körd av `scripts/db-migrate.ts` via `postgres`. Nästa id är `013_outreach`. En körd migrering ändras aldrig.

Roots (`packages/db/src/schema/outreach.ts`, `drizzle/0027_outreach.sql`) har bara `outreach_senders` och `outreach_leads`. Status, `provider_id` och öppningsräknare sitter på leadet. Det räcker inte när ett utskick har flera steg, webhookar och avregistrering. Vi behåller Roots fält som betyder något (e-post, webbplats, token, godkännande, leverantörs-id, dagsbudget) och lägger statusmaskinen på `outreach_messages`.

Det finns ingen `tenants`-tabell. Hyresgästen är `reseller_accounts.id` (`text`, `TENANT_ID`). Butiken pekar dit via `shops.owner_id`, inbjudan är `shop_invites.token`. Registrering är `claimInviteAction`: `createAccount` sedan `acceptInvite`. Attribution hakas på där. Loggans data-URL (upp till 600 000 tecken) stannar i `shops.data`; leadet får en liten `brand`. `shop-email.ts` äger inte persistens.

## 2. Vad vi återanvänder från Roots

| Roots | Namnskylt |
|---|---|
| `outreach_senders` (kopplad till `users`) | Ingen egen tabell. Avsändare ligger på kampanjen. Namnskylt har inga säljarkonton. |
| `outreach_leads.email` unik per avsändare | Unik `lower(email)` globalt. Samma bolag är en rad; nya utskick är nya meddelanden. |
| `token` i förslagslänken | `outreach_leads.token`, `randomBytes(18).toString("base64url")` som offerter och inbjudningar. |
| Status `draft → approved → sending → sent \| failed` plus manuellt `replied`, `meeting`, `declined` | Samma skick-lås (`sending`) på meddelandet. Pipeline (`replied`/`meeting`/`declined`) på leadet. |
| `provider_id` | Kolumnen heter `resend_id`. |
| `daily_cap` default 40, batch med `for update` | `outreach_campaigns.daily_cap`. Kö: `for update skip locked`. |
| `proposal_open_count` | `link_open_count` / `link_opened_at` på leadet. Förstapartsklick är inte en Resend-webhook. |

## 3. Förslag för Namnskylt

Ny migrering `013_outreach` i `src/lib/db/migrations.ts`. Typer som resten av schemat: `text`, `timestamptz`, `jsonb`, `uuid`, `bigserial`. Inga Postgres-enum (en ny migrering kan utöka en `check`, ett enum kan den inte). Statusgrafen valideras i TypeScript; `check` spärrar bara okända värden.

### `outreach_leads`

```sql
create table outreach_leads (
  id uuid primary key default gen_random_uuid(),
  org_name text not null,
  org_number text,
  city text,
  website text,
  segment text not null default 'ovrigt',
  contact_name text,
  contact_role text,
  email text not null,
  phone text,
  brand jsonb not null default '{}'::jsonb,
  status text not null default 'imported',
  token text not null unique,
  shop_slug text references shops(slug) on delete set null,
  invite_token text references shop_invites(token) on delete set null,
  reseller_id text references reseller_accounts(id) on delete set null,
  attributed_at timestamptz,
  link_open_count integer not null default 0,
  link_opened_at timestamptz,
  source text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_leads_segment_chk check (segment in (
    'profilprodukter','merch','reklam','tryck','foretagsklader','gravyr','present','ovrigt'
  )),
  constraint outreach_leads_status_chk check (status in (
    'imported','enriched','ready','active','replied','meeting','declined','converted','suppressed'
  ))
);
create unique index outreach_leads_email on outreach_leads (lower(email));
create unique index outreach_leads_shop on outreach_leads (shop_slug) where shop_slug is not null;
create unique index outreach_leads_invite on outreach_leads (invite_token) where invite_token is not null;
create index outreach_leads_status on outreach_leads (status, created_at desc);
create index outreach_leads_reseller on outreach_leads (reseller_id) where reseller_id is not null;
```

`reseller_id` är inte unik: `claimInviteAction` kan koppla ett befintligt konto. `shop_slug` och `invite_token` är unika — en butik och en inbjudan hör till ett lead.

Lead-status: `imported` (rad inlagd) → `enriched` (`brand` ifylld) → `ready` (butik + inbjudan + meddelande i utkast) → `active` (minst ett mejl skickat) → `replied` / `meeting` (manuellt, som Roots) → `converted` när `reseller_id` sätts. `declined` är manuellt från `ready`/`active`. `suppressed` sätts av spärrlistan och blockerar nya meddelanden; ett redan `converted` lead lämnas som `converted`.

`brand` är en ögonblicksbild, inte butiken. Tillåtna nycklar: `siteName`, `primaryColor`, `accentColor`, `fontFamily`, `bodyFontFamily`, `logoUrl` (http(s), max 500 tecken — aldrig data-URL), `industry`, `reader` (`browser` \| `html`), `scrapedAt`. Loggans bytes stannar i `shops.data` / `shop_images` när butiken byggs. Segmentet är vårt urval (profilprodukter m.m.), inte `CompanyDescription.industry` från skrapningen — den hamnar i `brand.industry`.

### `outreach_campaigns`

```sql
create table outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'draft',
  from_name text not null,
  from_email text not null,
  reply_to text not null,
  daily_cap integer not null default 40,
  steps jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_campaigns_status_chk check (status in ('draft','active','paused','done')),
  constraint outreach_campaigns_cap_chk check (daily_cap between 1 and 500)
);
```

`steps` är `[{ "step": 1, "delayDays": 0, "template": "intro" }]`. `template` är `intro` eller `reminder`. `slug` blir `utm_campaign` (idag hårdkodat `demobutik` i `shop-email.ts`). Kampanjer raderas inte (`on delete restrict` från meddelanden); de sätts till `done`.

### `outreach_messages`

```sql
create table outreach_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references outreach_campaigns(id) on delete restrict,
  lead_id uuid not null references outreach_leads(id) on delete restrict,
  step smallint not null,
  status text not null default 'draft',
  subject text,
  idempotency_key text not null unique,
  resend_id text,
  scheduled_for timestamptz not null default now(),
  approved_at timestamptz,
  sent_at timestamptz,
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_messages_step_chk check (step between 1 and 5),
  constraint outreach_messages_status_chk check (status in (
    'draft','approved','sending','sent','delivered','opened','clicked',
    'bounced','complained','failed','skipped','cancelled'
  )),
  unique (campaign_id, lead_id, step)
);
create unique index outreach_messages_resend on outreach_messages (resend_id) where resend_id is not null;
create index outreach_messages_queue on outreach_messages (scheduled_for) where status in ('approved','sending');
create index outreach_messages_campaign on outreach_messages (campaign_id, status);
```

`idempotency_key` = `outreach:{campaignId}:{leadId}:{step}` (stabil, under Resends gräns på 256 tecken). Samma sträng skickas som Resend-headern `Idempotency-Key`. Nyckel byts inte vid omförsök — då är det samma mejl.

Övergångar: `draft→approved|cancelled`, `approved→sending|cancelled|skipped`, `sending→sent|failed`, `failed→approved` (`attempt_count++`), `sent|delivered→opened|clicked|bounced|complained`, `opened→clicked|complained`, `clicked→complained`. `bounced`, `complained`, `skipped` och `cancelled` är slut. `clicked` får komma utan `opened`. Bounce efter `opened` blir event men flyttar inte status bakåt. Uttag ur kön, samma lås som Roots `sending`:

```sql
update outreach_messages set status = 'sending', updated_at = now()
 where id in (
   select id from outreach_messages
    where status = 'approved' and scheduled_for <= now()
    order by scheduled_for
    for update skip locked
    limit 12
 ) returning id;
```

Dagsbudget i samma transaktion: `count(*)` för kampanjen där `sent_at` är idag i `Europe/Stockholm` och status inte är `failed`.

### `outreach_events`

Bara leverantörens webhookar. Förstapartsklick ligger på leadet.

```sql
create table outreach_events (
  id bigserial primary key,
  message_id uuid references outreach_messages(id) on delete set null,
  lead_id uuid references outreach_leads(id) on delete set null,
  resend_id text,
  type text not null,
  provider_event_id text not null unique,
  payload jsonb not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index outreach_events_message on outreach_events (message_id, received_at desc);
create index outreach_events_resend on outreach_events (resend_id);
```

`provider_event_id` är Svix-id. `insert … on conflict do nothing` — bara en ny rad applicerar status. `type`: `email.sent|delivered|delivery_delayed|opened|clicked|bounced|complained`. Okänd typ och `delivery_delayed` sparas utan statusbyte. Matchning via `resend_id`. Webhook före commit lämnar `message_id` null tills `markSent`.

### `outreach_suppressions`

```sql
create table outreach_suppressions (
  email text primary key,
  reason text not null,
  source text not null,
  message_id uuid references outreach_messages(id) on delete set null,
  detail text,
  created_at timestamptz not null default now(),
  constraint outreach_suppressions_reason_chk check (reason in ('unsubscribe','bounce','complaint','manual')),
  constraint outreach_suppressions_source_chk check (source in ('webhook','operator','import'))
);
```

E-post lagras `trim` + `lower`, samma regel som `reseller_accounts`. `insert … on conflict (email) do nothing`. Anledning som skriver en rad: avregistrering, hård bounce (`payload` har `bounce.type = 'Permanent'`), klagomål. Mjuk bounce och `failed` skriver ingen spärr. Innan `approved → sending` slår kön upp listan; träff ger `skipped` och lead-status `suppressed` om leadet inte redan är `converted`.

### Attribution

Efter lyckad `acceptInvite` i `claimInviteAction`:

```sql
update outreach_leads
   set reseller_id = $tenant, attributed_at = now(), status = 'converted', updated_at = now()
 where reseller_id is null and invite_token = $token
returning id;
```

Token väger tyngst. Bara om den gav noll rader:

```sql
update outreach_leads
   set reseller_id = $tenant, attributed_at = now(), status = 'converted', updated_at = now()
 where reseller_id is null and lower(email) = lower($email);
```

Inbjudan löper ut efter 14 dagar (`INVITE_DAYS`) men raden ligger kvar; en ny token måste skrivas tillbaka på leadet. E-postmatchningen fångar senare inbjudan med samma adress. `customers` / `orders` / `quotes.reseller_id` ärvs via `shops.owner_id` och rörs inte här.

### Zod och repository

`src/lib/outreach/model.ts` — speglar `quotes/model.ts`:

- `SEGMENTS`, `LEAD_STATUSES`, `CAMPAIGN_STATUSES`, `MESSAGE_STATUSES`, `SUPPRESSION_REASONS` som `as const`.
- `outreachBrandSchema` med hex `^#[0-9a-f]{6}$`, `logoUrl` som `z.url().max(500)` och förbud mot `data:`.
- `campaignStepSchema`: `step` 1–5, `delayDays` 0–90, `template` `intro` \| `reminder`.
- `normalizeEmail`, `idempotencyKey(campaignId, leadId, step)`, `canTransitionMessage(from, to)`.

`src/lib/outreach/repository.ts` — enda nya repository-filen. `import "server-only"`, `requireDb()`, `sql` från `postgres`, zod vid skrivning. Funktioner: `upsertLead`, `getLead`, `getLeadByToken`, `listLeads`, `createCampaign`, `getCampaign`, `ensureMessage`, `claimApproved`, `markSent`, `markFailed`, `insertEvent`, `suppress`, `isSuppressed`, `attributeLead`. `shop-email.ts` och `shop-mockup.ts` lämnas.

`src/lib/outreach/model.test.ts` täcker övergångstabellen, nyckeln och e-postnormalisering (`node:test`). SQL körs inte i test utan databas; `pnpm db:migrate` (eller scriptet `scripts/db-migrate.ts`) är grinden mot Postgres. `db-seed.ts` ska inte så utskicksrader.

## 4. Före Resend-kontot

Migrering, zod, repository och `model.test.ts` kan mergas utan nyckel. Mocken sätter `resend_id` till `mock_<uuid>`; webhook-insert matas med fixture-JSON.

## 5. Beslut

1. En avsändare per kampanj, inte en `outreach_senders`-tabell. Säg till om flera avsändare ska väljas per lead som i Roots.
2. Samma e-post är en lead-rad för alltid och får nya meddelanden i nästa kampanj. Säg till om en adress ska kunna ligga två gånger.
3. Första kampanjen: ett steg (`intro`, `delayDays` 0) tills påminnelsemallen finns. Schemat tål fem.
4. Spärr efter avregistrering, hård bounce och klagomål ligger kvar tills en operatör raderar raden. Mjuk bounce spärrar inte.
5. Segmentkoderna ovan. Fler koder är en ny migrering som byter `check`.

## 6. Risker

- Data-URL i `brand` gör listfrågor tunga. Schemat vägrar `data:`; butikens logga stannar i `shops`.
- Dubbla skick. Unik `(campaign_id, lead_id, step)`, unik `idempotency_key`, `skip locked` och Resends nyckel ska alla fyra finnas. En av dem räcker inte.
- Webhook före commit. Eventet sparas på `resend_id` med `message_id` null och kopplas när `markSent` satt id:t.
- Versaler. `reseller_accounts` sparar redan lower. Lead och spärr gör likadant, plus unikt index på `lower(email)`, så import av `Anna@Firma.se` inte blir en andra rad.
- Utgången inbjudan. Token-raden finns kvar men `getInvite` vägrar den efter 14 dagar. Nytt utskick måste skriva ny `invite_token`, annars attribuerar bara e-postmatchningen.
- `check` som glömmer en status gör att skrivningen kastar. Övergångstabellen i `model.test.ts` är listan som migreringen måste rymma.

## 7. Beroenden

- Övriga planområden läser repositoryt och äger inte tabellerna.
- `createShop` sätter `shop_slug` innan `ready`. `createInvite` sätter `invite_token`; raderad inbjudan nollar den via FK.
- Utskicksjobbet äger `claimApproved` och dagsbudgeten. Webhook-routen äger signaturen och anropar `insertEvent`.
- Mock-sändaren sätter `resend_id` med prefix `mock_`. `shop-email.ts` tar `utm_campaign` från `outreach_campaigns.slug` i stället för hårdkodad `demobutik`.
