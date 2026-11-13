# 15 — Agent: orkestrering, schemaläggning och spärrar

## 1. Sammanfattning

Namnskylt har ingen jobbkö. `Dockerfile` kör `pnpm start` (`scripts/db-migrate.ts` och sedan `next start -p 3100`). Det finns ingen cron-route, ingen Redis och ingen worker. Hastighetsgränsen i `src/lib/ai/rate-limit.ts` ligger i minnet och gäller en process.

Roots skickar inte lead-mejl från en demon. En människa anropar `POST /v1/outreach/senders/:id/send`. Raderna tas med `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)` i `claimNextApproved`. Taket är `daily_cap` (standard 40) per avsändare och Stockholmsdygn. `ResendEmailSender` skickar ingen `Idempotency-Key`. En rad som fastnat i `sending` i mer än tio minuter blir `failed` och kräver nytt godkännande, eftersom mejlet kan ha gått iväg.

Kopiera claim-mönstret, spärrarna och att automation aldrig häver paus. Inför inte pg-boss, Redis eller Roots orkestrator. En funktion, `runOutreachTick`, körs av `POST /api/outreach/tick` (hemlighet) och av en knapp i admin. Postgres är kön, låset och taket.

## 2. Vad vi återanvänder från Roots

| Roots | Ta med | Ändra |
|---|---|---|
| `routes/outreach.ts` `claimNextApproved` + `outreach-claim.integration.test.ts` | Ett uttalande: `UPDATE` där `id` är en `SELECT … ORDER BY … LIMIT 1 FOR UPDATE SKIP LOCKED`. Åtta parallella anrop mot fem rader ger fem unika id. | `node:test` via tsx, hoppa över utan `DATABASE_URL`. Tabell `outreach_steps`, inte `outreach_leads`. |
| `sentToday` + `startOfStockholmDay` | Räkna skickat i SQL, tidszon `Europe/Stockholm`. | Även rullande timme. Tak som env, inte kolumn per avsändare. |
| `emailEnabled` / `FEATURE_EMAIL_DISABLED` | Hård paus läses varje tick. Saknad nyckel betyder att inget riktigt mejl går. | Namn: `OUTREACH_DISABLED`. Dessutom en rad i databasen som admin kan slå om utan omstart. |
| `isRealEmailSend` | Bara `success && !mocked` får sätta `sent` och `provider_id`. | Dry-run anropar inte ens avsändaren. |
| `SEND_BATCH` 12, 600 ms, `SEND_BUDGET_MS` 15 s | Kort tick, paus mellan anrop. | Högst 5 per tick så en cron var femte minut inte rusar. |
| `scheduler.ts` | Lärdomen: ett jobb som bara finns som route och ingen cron körs aldrig (GDPR-radering). | Ingen `setInterval` i `next start`. Ingen Redis-`NX`. Synlighet i admin i stället. |
| `jobs/` (pg-boss) | Inte för mejl. Av som standard (`WORKERS_ENABLED`). Köer har tappat jobb tyst. | Ingen ny kö. |
| `orchestrator/heartbeat.ts`, `hands.ts`, `probes.ts` | `email-paused` öppnar ett kort. `tryFixKey("email-paused")` returnerar `null`. | Porta inte orkestratorn. Appen kan sätta paus, aldrig häva `OUTREACH_DISABLED`. |
| `resend-sender.ts` | `POST https://api.resend.com/emails`, timeout 15 s, `AbortController`. | Lägg `Idempotency-Key: outreach-step-{uuid}`. Cacha inte avsändaren: Roots `getEmailSender` låser första valet tills omstart. |

Roots har ingen uppföljningssekvens i koden. Status där är `draft → approved → sending → sent`, plus manuellt `replied` / `meeting` / `declined` / `failed`. Uppföljning är ett kalkylblad. Sekvensen nedan är ny.

## 3. Förslag för Namnskylt

### Filer

- `src/lib/outreach/tick.ts` — `runOutreachTick(trigger: "cron" \| "admin")`.
- `src/lib/outreach/claim.ts` — `claimNextReady(sql)`.
- `src/lib/outreach/policy.ts` — paus, läge, tak, backoff, fel som får försöka igen.
- `src/lib/outreach/window.ts` — rena funktioner, `Intl` med `Europe/Stockholm`. Inget datumbibliotek.
- `src/lib/outreach/cancel.ts` — avbryt steg innan något claimas.
- `src/lib/outreach/secret.ts` — `timingSafeEqual` på `Authorization: Bearer`. Saknas hemligheten: 503, samma idé som `SUPPLIER_WEBHOOK_SECRET`.
- `src/app/api/outreach/tick/route.ts` — `runtime = "nodejs"`.
- `src/app/api/admin/outreach/control/route.ts` — paus, läge, status. Bara `isOwner` (`currentTenant`), som `src/app/api/admin/shops/[slug]/email/route.ts`.
- `src/app/api/admin/outreach/tick/route.ts` — samma `runOutreachTick`, session i stället för hemlighet.
- `src/middleware.ts` — släpp `POST /api/outreach/tick` förbi sajtkakan. Cron har ingen kaka. Övriga `/api/admin/outreach/*` ligger kvar bakom kakan och ägarkollen.
- Ny migration i `src/lib/db/migrations.ts` (nästa id efter `012_shop_editor`; döp om ifall ett annat planområde hinner före).
- Tester: `src/lib/outreach/{window,policy,tick,claim}.test.ts`. `package.json` kör redan `src/lib/**/*.test.ts`.

`buildShopEmail` i `src/lib/outreach/shop-email.ts` är det som renderas. Den här planen äger inte mallen.

### Körning

Extern cron var femte minut mot `POST /api/outreach/tick` med `Authorization: Bearer $OUTREACH_TICK_SECRET`. På Railway (proxyn nämns i `middleware.ts`) är det en schemalagd `curl`. Ingen sidoprocess i `Dockerfile`.

Varför inte en loop i containern: `next start` kan få flera instanser, dev-servern skulle annars kunna skicka, och det finns ingen Redis att låsa med. Glömd cron syns: admin visar senaste raden i `outreach_ticks` och varnar om den är äldre än 15 minuter inne i fönstret. Knappen «Kör ett tick» anropar samma funktion.

Hela ticken håller en reserverad anslutning (`sql.reserve()` i postgres.js, poolen är `max: 5`). På den:

```sql
select pg_try_advisory_lock(4815162342) as locked
```

`locked = false` → avsluta med `skipped: "busy"`. Alla claim körs på samma anslutning. `pg_advisory_unlock` och `release()` i `finally`. Dör processen släpper Postgres låset.

Ordning inuti låset: skriv tick-start → aktivering → avbryt → återta fastnade `sending` → räkna tak → skicka eller dry-run → skriv resultat.

### Spärrar, i den ordningen

1. `OUTREACH_DISABLED=true` → inget skickas. UI kan inte slå av den.
2. `outreach_control.paused` (default `true`) → inget skickas. Knappen «Pausa utskick» sätter den.
3. Utanför fönstret → inget claimas. Avbryt och aktiveringskoll körs ändå.
4. `mode <> 'live'` eller saknad `RESEND_API_KEY` → dry-run.
5. Mottagaren saknar `approved_at` → steg 0 claimas inte.
6. Tim- eller dygnstak nått → sluta claima.
7. Precis före `fetch`: läs `suppress_reason` igen. Sätts den under ticken avbryts steget och Resend anropas inte.

### Tak, fönster, retry

- `OUTREACH_HOURLY_CAP` default 15, `OUTREACH_DAILY_CAP` default 40.
- Räkna `outreach_steps` med `status = 'sent'`. Timme: `sent_at >= now() - interval '1 hour'`. Dygn: samma `date_trunc` som Roots, `Europe/Stockholm`.
- Fönster: vardagar 09:00–16:00 Stockholm. `OUTREACH_WINDOW=09:00-16:00`. Lördag, söndag och tider utanför: tick returnerar `outside_window`.
- Per tick: `min(5, kvar_i_timmen, kvar_i_dagen)`, 600 ms mellan anrop, budget 20 s.
- Försök: högst 3. Backoff 15 min, 1 timme, 4 timmar, sedan `needs_review`. `next_attempt_at` flyttas in i nästa öppna fönster (`snapToWindow`).
- Försök igen: timeout, 408, 429, 5xx. Vid 429: vänta minst `Retry-After`, räkna inte som förbrukat försök.
- Försök inte igen: övriga 4xx (ogiltig adress). `failed` permanent, `suppress_reason = 'bounced'` om Resend säger bounce/complaint.

### Idempotens

`idempotency_key` är `outreach-step-{id}`, unik, stabil, utan försöksnummer. Headern är `Idempotency-Key`. Resend sparar nyckeln i 24 timmar; samma nyckel och samma kropp ger samma svar. Efter 24 timmar kan samma nyckel skicka ett nytt mejl.

- `provider_id` satt → skicka aldrig igen.
- `sending`, `provider_id` null, `claimed_at` mellan 10 minuter och 24 timmar → tillbaka till `ready`, samma nyckel, öka inte `attempts`.
- `sending` äldre än 24 timmar → `needs_review`. En människa kollar Resend innan något godkänns igen. Det ersätter Roots tysta «failed + godkänn igen» med en gräns som matchar Resends fönster.
- Krasch innan HTTP räknas inte som ett försök. Ett riktigt fel svar gör det.

### Dry-run och godkännande

`outreach_control.mode` är `dry_run` eller `live`, default `dry_run`. Dry-run väljer samma kandidater med `SELECT` utan lås på raden, renderar, skriver listan i tick-resultatet och ändrar inte stegstatus. Avsändaren anropas inte.

`POST /api/admin/outreach/control` med `mode: "live"` avvisas om `OUTREACH_DISABLED` är satt eller `RESEND_API_KEY` saknas. Att släppa paus sätter inte `live`.

Steg 0 kräver `approved_at` på mottagaren. Import lämnar `draft`. Godkännande är per mottagare, inte per uppföljning: när en människa godkänner skapas steg 0 som `ready` och steg 1–2 som `waiting`.

### Tillstånd

Mottagare (`outreach_recipients.status`): `draft` → `approved` → `in_sequence` → `completed` eller `suppressed`.

`suppress_reason`: `clicked`, `replied`, `activated`, `unsubscribed`, `bounced`, `complained`, `manual`.

Steg (`outreach_steps.status`):

| Från | Händelse | Till |
|---|---|---|
| — | import | inga steg |
| — | människa godkänner | steg 0 `ready`; steg 1–2 `waiting` |
| `waiting` | föregående är `sent` och `not_before <= now()` och mottagaren inte spärrad | `ready` |
| `ready` eller retry-bar `failed` | claim | `sending` (`claimed_at = now()`) |
| `sending` | Resend 2xx | `sent`, `provider_id`, `sent_at`. Mottagare `in_sequence`. Nästa stegs `not_before = addBusinessDays(sent_at, 4 eller 7)` |
| `sending` | tillfälligt fel, försök kvar | `failed`, `next_attempt_at` |
| `sending` | permanent fel, eller försök slut | `needs_review` |
| `sending` | krasch 10 min–24 h | `ready` (samma nyckel) |
| `sending` | krasch > 24 h | `needs_review` |
| `waiting` / `ready` / `failed` | spärr på mottagaren | `cancelled` + `cancel_reason` |
| `sent` | sista steget, ingen spärr | mottagare `completed` |

`cancelled`, `needs_review` och permanent `failed` skickas inte. Bara en människa kan lägga tillbaka ett `needs_review`-steg till `ready`.

Förslag på avstånd, inte hårdkodat i spridda konstanter: `STEP_GAP_BUSINESS_DAYS = [0, 4, 7]` (steg 1 fyra vardagar efter steg 0, steg 2 sju vardagar efter steg 1). `addBusinessDays` hoppar lördag och söndag. Helgdagar är ett beslut.

Varje tick, före claim:

```sql
update outreach_recipients r
set activated_at = coalesce(r.activated_at, now()),
    suppress_reason = coalesce(r.suppress_reason, 'activated'),
    status = 'suppressed'
where r.suppress_reason is null
  and r.status in ('approved', 'in_sequence')
  and (
    exists (select 1 from reseller_accounts a where lower(a.email) = lower(r.email))
    or exists (select 1 from shop_invites i where lower(i.email) = lower(r.email) and i.used_at is not null)
  );
```

Därefter: om `clicked_at`, `replied_at`, `activated_at` eller `unsubscribed_at` är satt och `suppress_reason` är null, fyll reason i den ordningen avregistrering, svar, aktivering, klick. Avbryt sedan alla steg i `waiting`, `ready`, `failed`. Ett `sending` som redan väntar på HTTP får avslutas om anropet hunnit iväg; nästa steg skapas inte när reason är satt (kollen precis före `fetch`, och promote kräver att mottagaren inte är spärrad).

`accountIdByEmail` i `src/lib/reseller-auth/accounts.ts` är samma träff. Tick använder SQL ovan så den inte gör ett anrop per rad.

### Tabeller

`outreach_control` — en rad, `id boolean primary key check (id)`, `paused boolean not null default true`, `mode text not null default 'dry_run'`, `updated_at`.

`outreach_recipients` — `id uuid`, `email text not null unique`, `org_name`, `contact_name`, `shop_slug`, `status`, `approved_at`, `approved_by`, `clicked_at`, `replied_at`, `activated_at`, `unsubscribed_at`, `suppress_reason`, `created_at`.

`outreach_steps` — `id uuid`, `recipient_id` fk, `step_no smallint`, `status`, `idempotency_key text not null unique`, `not_before`, `next_attempt_at`, `attempts smallint not null default 0`, `claimed_at`, `sent_at`, `provider_id`, `last_error`, `cancel_reason`. Unik `(recipient_id, step_no)`. Index på `(status, next_attempt_at)` där status är `ready`, `failed` eller `sending`.

`outreach_ticks` — `started_at`, `finished_at`, `trigger`, `result jsonb`.

Claim:

```sql
update outreach_steps set status = 'sending', claimed_at = now()
where id = (
  select id from outreach_steps
  where next_attempt_at <= now()
    and (status = 'ready' or (status = 'failed' and attempts < 3))
  order by next_attempt_at, id
  limit 1
  for update skip locked
)
returning *;
```

`attempts` ökar bara när Resend svarat med ett fel som får försöka igen. Claim och kraschåtertag rör den inte. Då bränner en död process inte de tre försöken.

### Env

`OUTREACH_TICK_SECRET`, `OUTREACH_DISABLED`, `OUTREACH_HOURLY_CAP`, `OUTREACH_DAILY_CAP`, `OUTREACH_WINDOW`, `OUTREACH_TZ` (default `Europe/Stockholm`), `OUTREACH_MAX_ATTEMPTS` (default 3). `RESEND_API_KEY` ägs av mejltransporten. Saknas den tvingas dry-run även om någon satt `live`.

## 4. Före Resend-kontot

Allt utom riktigt `live` kan byggas nu.

- Migration, policy, fönster, backoff och tillstånd som rena funktioner med test. Inkludera sommar- och vintertid (2026-03-29, 2026-10-25), fredag 15:59, lördag, och `addBusinessDays` från en fredag.
- Claim-test mot lokal Postgres: åtta parallella `claimNextReady`, fem `ready`-rader, fem unika id, sjätte anropet `null`.
- Tick med fejkad avsändare som kastar om den anropas: dry-run, paus, `OUTREACH_DISABLED`, utanför fönster, saknad `approved_at`, tak 0.
- `scripts/outreach-tick.ts` och `pnpm outreach:tick` som anropar `runOutreachTick("admin")` med `.env.local`. Ingen hemlighet krävs lokalt när scriptet kör funktionen direkt.
- Admin-status som visar paus, läge, senaste tick och antal per status. Knappen kör dry-run.
- Lämna `paused = true` och `mode = dry_run` i migrationen.

## 5. Beslut

1. Cron var femte minut mot routen (rekommendation), inte en loop i containern. Bekräfta att den läggs som Railway scheduled task.
2. Tak från start: 15 per timme och 40 per dag, eller en uppvärmning (till exempel 10, sedan 20, sedan 40) första två veckorna.
3. Två uppföljningar utan nytt godkännande, fyra och sju vardagar. Annan rytm om du vill det.
4. Tills inkommande svar finns: en knapp «Har svarat» sätter `replied_at`. Inget IMAP i den här planen.
5. Fönstret stängt bara lördag–söndag, eller även svenska helgdagar.

## 6. Risker

| Risk | Hantering |
|---|---|
| Cron glöms, som Roots radering | Default paus. Admin varnar när senaste tick inne i fönstret är > 15 min. Knapp kör samma funktion. |
| Två tick skickar dubbelt | Advisory lock för taket. `SKIP LOCKED` för raden. Stabil Idempotency-Key. Aldrig skicka om `provider_id` finns. |
| Samma nyckel efter 24 h kan skapa ett nytt mejl | `needs_review`, inte automatiskt omskick. |
| Mock eller dry-run räknas som skickat | Bara riktigt 2xx med id sätter `sent`. Dry-run rör inte status. |
| Automation häver paus | `OUTREACH_DISABLED` läses bara. UI sätter paus, och `live` kräver nyckel. Default är paus och dry-run. |
| Sajtkakan stoppar cron | Undantag i `middleware.ts` enbart för tick-routen. Fel hemlighet: 401. Saknad hemlighet: 503. Tio fel per IP och 15 min via `createRateLimiter` (minnet räcker; hemligheten är lång). |
| Lock på fel anslutning i poolen | Hela ticken på `sql.reserve()`. |
| Klick mitt under en tick | Ny läsning av `suppress_reason` efter claim, före `fetch`. |
| Uppföljning efter klick om skrivaren är sen | Avbryt varje tick. Tills klick-routen finns gör en manuell spärr samma sak. |
| Flera repliker senare | Låset ligger i Postgres, inte i processen. |

## 7. Beroenden

Område 15 äger loopen, låset, taket, fönstret, retry, paus, dry-run och tillståndsmaskinen. `00-KONTEXT.md` numrerar inte 01–14, så ämnet står här i stället för ett påhittat nummer.

- **Tabeller och import.** Om ett annat område äger `outreach_recipients` måste kolumnerna ovan finnas. Claim och status byter inte namn.
- **Resend-klienten** ska ta emot `idempotencyKey` och returnera `{ success, id, mocked, error, status }`. Den här planen anropar den bara i `live`.
- **Mallen** är `buildShopEmail`. Loopen behöver `subject`, `html`, `text`, avsändare och mottagaradress. Förhandsvisningen `GET /api/admin/shops/[slug]/email` finns redan.
- **Klick** skriver `clicked_at`. **Avregistrering** skriver `unsubscribed_at` (länken i mallen pekar redan på `/avregistrera`). **Svar** skriver `replied_at`. Loopen läser och avbryter; den tar inte emot webhooks.
- **Aktivering** är `reseller_accounts.email` eller `shop_invites.used_at`. Ingen ny skrivväg.
- **Admin-ytan** ritar knapparna Pausa, Dry-run/Live, Godkänn och Kör ett tick. Route och regler ligger här.
- **Domän och API-nyckel** blockerar bara `mode = live`. Dry-run och tester väntar inte på dem.
- **16** bör läsa den här filen innan loopen byggs, så att inget annat område inför pg-boss eller en `setInterval` i `next start`.
