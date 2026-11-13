# 01 — Roots outreach-agentens arkitektur

Källa (läst, inte ändrad): `Roots/apps/api/src/routes/outreach.ts`, `lib/outreach/{template,excel}.ts`, `lib/email/{index,types,mock-sender,resend-sender}.ts`, `packages/db/src/schema/outreach.ts`, `routes/outreach-claim.integration.test.ts`. Routern monteras i `apps/api/src/app.ts` som `app.route("/v1/outreach", outreach)`.

## 1. Sammanfattning

Roots lead-mejl är en människa-i-loopen, inte en bakgrundsjobb-agent. En rad föds som `draft`, blir `approved` bara om den renderas utan saknade fält, och lämnar kön först när någon anropar `POST /senders/:id/send`. Själva utskicket claimar en rad i taget till `sending` med `FOR UPDATE SKIP LOCKED`, anropar Resend, och sätter `sent` bara om `isRealEmailSend` är sant. Mock räknas aldrig som skickat.

`getEmailSender()` är en process-singleton delad med all annan Roots-mejl. Outreach-routen har en egen, striktare grind, `emailEnabled()`, som vägrar skicka utan `RESEND_API_KEY`. Förhandsvisning (`GET /leads/:id/preview`) rör inte sändaren och fungerar utan nyckel. Det är vägen att bygga klart före Resend.

HTML:en för lead-mejlet byggs i `lib/outreach/template.ts` (`renderLeadMail`), inte i `lib/email/templates.ts`. Den senare är transaktionsmejl (order, inbjudan, juridisk footer för Ourroots AB) och ska inte portas. Namnskylt har redan motsvarande brev i `src/lib/outreach/shop-email.ts` och en förhandsvisning i `GET /api/admin/shops/[slug]/email`. Agenten ska återanvända det brevet och porta kön, claim och sändarvalet.

## 2. Vad vi återanvänder från Roots

### Dataflöde (behåll stegen, byt innehåll)

1. **Lead in.** `POST /senders/:id/import` (eller `?preview=1` utan skrivning). Excel → `parseLeads`. Kräver kolumnerna förening och e-post. Hoppar över rad utan e-post eller namn, och dubbletter i filen.
2. **Utkast.** Insert i `outreach_leads` med `status = draft` och en token (`randomBytes(12).toString("base64url").slice(0, 12)`). Upsert på `(sender_id, email)`.
3. **Granskning.** `GET /leads/:id/preview` renderar `from`, `to`, `subject`, `html`, `text`, `missing`. Ingen sändning.
4. **Godkännande.** `POST /leads/approve` med `{ ids }` (1–2000 uuid). Bara rader i `draft` eller `failed` där `render().missing.length === 0`. Sätter `approved`, `approved_at`, `approved_by`, rensar `last_error`.
5. **Claim.** `claimNextApproved(senderId)`: en UPDATE som väljer äldsta `approved` (`approved_at asc`) med `for update skip locked` och sätter `sending` i samma sats. Två samtidiga anrop får aldrig samma rad (testat i `outreach-claim.integration.test.ts`).
6. **Sändning.** Batch max `SEND_BATCH = 12`, tidsbudget `SEND_BUDGET_MS = 15_000`, 600 ms paus mellan mejl. Dagstak `daily_cap` (default 40) mot `sent_at` från midnatt `Europe/Stockholm`. Svar: `{ sent, failed, remainingToday, more, capReached }`. `more` betyder att klienten ska anropa igen.
7. **Status efter försök.** Riktigt Resend-svar (`success && !mocked` och ett id) → `sent`, `sent_at`, `provider_id`. Saknade fält, providerfel eller mock → `failed` + `last_error` (max 500 tecken). Fastnad `sending` äldre än 10 minuter sätts till `failed` med texten att en människa ska kolla om mejlet gick iväg innan nytt godkännande. Ingen automatisk omsändning.
8. **Eftermäle, manuellt.** `PATCH /leads/:id` får sätta `replied`, `meeting` eller `declined` bara om `sent_at` finns. Agenten läser inga inkorgar och tar emot inga Resend-webhooks.

### Tillstånd

| Status | Vem sätter | Får redigera innehåll | Får raderas |
|---|---|---|---|
| `draft` | import, återställning | ja | ja, om `sent_at` är null |
| `approved` | approve | ja, men raden faller tillbaka till `draft` och tappar godkännandet | ja |
| `sending` | claim | nej | nej om `sent_at` satts (den är null här, men innehållet är låst) |
| `sent` | lyckad Resend | nej | nej |
| `failed` | fel, mock, fastnad sending | ja; kan godkännas igen eller sättas till `draft` | ja om `sent_at` är null |
| `replied` / `meeting` / `declined` | människa via PATCH | nej | nej |

`sending` finns i `STATUS_LABELS` och i claim-koden men saknas i schemakommentaren (`draft | approved | sent | replied | meeting | declined | failed`). Kolumnen är `varchar(24)`, inte en Postgres-enum. Manuella statusar i `LeadPatchSchema`: bara `draft | replied | meeting | declined`. `approved`, `sending`, `sent` och `failed` går inte att sätta via PATCH.

Återställningar som nollställer godkännande (`status = draft`, `approved_at` och `approved_by` null):

- Ändrat lead-innehåll (allt utom `note` och `status`) på en `approved` rad.
- Ändrad avsändartext: ämne, brödtext, namn, titel, e-post eller telefon. Alla den avsändarens `approved` rader går tillbaka till `draft`.
- Omimport. `onConflictDoUpdate` med `setWhere status in ('draft', 'approved')`. Skickade, pågående, besvarade och `failed` rörs inte. `xmax = 0` skiljer insert från update.

### Idempotens (det som ska överleva porten)

- Unik `(sender_id, email)` plus villkorad upsert. Samma lista kan importeras om utan dubbletter och utan att skriva över ett skickat mejl.
- Claim är en sats: lås + statusbyte. Ingen separat SELECT som kan dubbelbokas.
- At-most-once mot Resend. En rad som dör i `sending` skickas inte om. Operatören godkänner igen efter att ha kollat leveransen. Det kan ge ett dubbelmejl om mejlet faktiskt gick iväg — det är ett medvetet val, inte ett glapp.
- `isRealEmailSend`: `success && !mocked`. Mock returnerar `{ success: true, id: "mock_…", mocked: true }` och blir `failed` / «Mejl är pausade».
- Inget Idempotency-Key-header. Säkerheten sitter i statusen, inte i klienten.
- `provider_id` sparas men används inte för avstämning i den här koden.

### Sändarval (två grindar, inte en)

`getEmailSender()` i `lib/email/index.ts`, cachad i `_sender`:

1. `FEATURE_EMAIL_DISABLED=true` → `MockEmailSender`, även om nyckel finns. Varning i loggen.
2. Annars `RESEND_API_KEY` → `ResendEmailSender(apiKey, RESEND_FROM_ADDRESS || "Roots <hej@roots.nu>")`.
3. Annars `NODE_ENV=production` → kastar. Tyst mock i prod är förbjuden.
4. Annars mock (lokal dev). `resetEmailSender()` nollar cachen (tester).

`ResendEmailSender.sendEmail`: `POST https://api.resend.com/emails`, Bearer, 15 s `AbortController`, `from` / `to[]` / `subject` / `html` / `text` / `reply_to`. Fel blir `{ success: false, error }` och kastar inte. `email/templates.ts` anropas inte här.

Outreach anropar inte sändaren om `emailEnabled()` är falsk: pausflaggan eller saknad `RESEND_API_KEY` → `409 { code: "EMAIL_PAUSED" }` innan någon rad claimas. Förhandsvisning och import går ändå. `validate-env.ts` kräver nyckel i prod om flaggan inte är `true` — det är API-boot, och det ska inte kopieras rakt av till Next-processen (se risker).

Avsändaradressen måste sluta på domänen som parsas ur `RESEND_FROM_ADDRESS` (`sendingDomain()`, fallback `roots.nu`). `from` på kuvertet är `"${sender.name} <${sender.email}>"`, `replyTo` är samma adress. Svar läses inte av agenten.

### Endpoints (Hono, session + roll)

Roller: `INTERNAL_ADMIN`, `SALES_ADMIN` ser alla avsändare. `SALES_REP` ser bara `outreach_senders.user_id = session.userId`. Okänd eller osynlig avsändare svarar 404, inte 403. Mutationer är stängda för `isDemoSession`. Bara manager skapar avsändare, byter avsändaradress och kopplar `userEmail` till `users`.

| Metod | Sökväg | Effekt |
|---|---|---|
| GET | `/v1/outreach/senders` | Lista, statusräknare, `sentToday`, `emailEnabled`, `canManage`, `statusLabels` |
| POST | `/v1/outreach/senders` | Skapa. Defaultmall + `dailyCap` 40 |
| PATCH | `/v1/outreach/senders/:id` | Uppdatera. Textändring ogiltigförklarar godkända |
| GET | `/v1/outreach/senders/:id/leads` | Filter `status`, `q` (max 80). Tak 500 rader, `total` är hela träffen |
| POST | `/v1/outreach/senders/:id/import` | Base64-xlsx, max ~14e6 tecken. `?preview=1` eller saknad sheet/mapping → bara bladförslag |
| PATCH | `/v1/outreach/leads/:id` | Fält + manuell status. 409 om låst |
| DELETE | `/v1/outreach/leads/:id` | 409 om `sent_at` |
| GET | `/v1/outreach/leads/:id/preview` | Render utan sändning |
| POST | `/v1/outreach/leads/approve` | `{ approved, skipped }` |
| POST | `/v1/outreach/senders/:id/send` | Batchen ovan |
| GET | `/v1/outreach/senders/:id/export` | xlsx |
| GET | `/v1/outreach/p/:token` | Publik. Ingen session |

Import har egen body-limit 15 MB i `app.ts`. Övriga outreach-rutter har ingen egen rate limit.

### Lämna (Roots-specifikt)

- Hono, Drizzle, `@roots/db`, `requireSession`, roller, `isDemoSession`, FK till `users`.
- `lib/email/templates.ts` helt (moms, locale, Ourroots AB).
- `template.ts`: Folkspel-copy, `calculateLead`, `LOCKED_MARGIN_PERCENT`, paket × 399 kr, platshållarna `[Antal säljande medlemmar]`, `[Framräknad behållning]`, footer `roots.nu/integritet`. Mönstret (saknade fält blockerar godkännande, HTML-escape, text + html) är värt att behålla i Namnskylts egen renderer.
- `excel.ts`: rubrikgissning för förening, medlemmar, «Korrigerat namn». Upsert-kontraktet är värt att behålla om en lista importeras.
- Lead-kolumnerna `member_count`, `packages_per_member`, `package_price_kr`.
- `GET /p/:token` som returnerar `{ orgName, website-host, goalKr }` och bot-filtret mot föreningens provsida `/f/:token`.
- Flera säljare (Niclas/Kent) och `user_id` på avsändaren, om Namnskylt körs av ägaren ensam.
- Launchd och `~/.roots/outreach-daily.mts`. De ligger utanför repot, godkänner och skickar själva, och anropar inte den här routern. Ingen kod i `apps/api/src/lib/scheduler.ts` eller `lib/jobs/` rör `outreach_leads`.

## 3. Förslag för Namnskylt

Logik i `src/lib/`, rutter tunna. SQL via `postgres` (`src/lib/db/client.ts`), ny migration `013_outreach` i `src/lib/db/migrations.ts` (senaste är `012_shop_editor`). Tester med `node:test` + `tsx`, inte Vitest. Ägarskydd som i `src/app/api/admin/shops/[slug]/email/route.ts`: `currentTenant()` + `isOwner` → 401.

### Tabeller

`outreach_senders`: `id uuid`, `name`, `title`, `phone`, `email`, `subject_template`, `body_template`, `daily_cap int default 40`, `created_at`, `updated_at`. Ingen `user_id` förrän beslut 1 säger flera avsändare.

`outreach_leads`: `id`, `sender_id` FK `on delete cascade`, `org_name`, `contact_name`, `email`, `website`, `token text unique`, `status text default 'draft'`, `subject_override`, `body_override`, `note`, `approved_at`, `approved_by text` (ägar-tenant, inte uuid mot `users`), `sent_at`, `provider_id`, `last_error`, `open_count int default 0`, `opened_at`, `created_at`, `updated_at`. Unik `(sender_id, email)`. Index `(sender_id, status)` och `(sent_at)`. Inga medlems- eller priskolumner. Butikskoppling (`shop_slug`) hör till lead-planen, inte till claim-mekaniken; lägg den som nullable text om den agenten behöver den, annars vänta.

### Filer att lägga till

- `src/lib/email/types.ts` — `EmailMessage`, `SendEmailResult` (`mocked?`), `EmailSender`.
- `src/lib/email/mock-sender.ts` — loggar, returnerar `mocked: true`.
- `src/lib/email/resend-sender.ts` — samma fetch, 15 s abort, `reply_to`.
- `src/lib/email/index.ts` — `getEmailSender`, `resetEmailSender`, `isRealEmailSend`. Samma fyra grenar. Fallback-avsändare ska vara en Namnskylt-adress, inte `Roots <hej@roots.nu>`.
- `src/lib/email/is-real-email-send.test.ts`.
- `src/lib/outreach/status.ts` — `STATUS_LABELS` (svenska som i Roots), tillåtna övergångar, låsregler.
- `src/lib/outreach/claim.ts` — `claimNextApproved` som en SQL-sats, inte två rundor.
- `src/lib/outreach/send-batch.ts` — dagstak, 10-minutersstädning, loop, `isRealEmailSend`. Routen bara autentiserar och anropar.
- `src/lib/outreach/claim.integration.test.ts` — `describe.skip` utan `DATABASE_URL`, åtta parallella claim mot fem `approved`.
- Befintliga `shop-email.ts` och `shop-mockup.ts` förblir renderern. Preview för en lead-rad anropar `buildShopEmail` när butiken finns. Saknas butik är `missing` icke-tom och approve vägrar — samma grind som Roots `missing[]`, annat villkor.

### Rutter under `src/app/api/admin/outreach/`

Alla `runtime = "nodejs"`, ägare, zod, svenska feltexter.

- `senders/route.ts` — GET lista, POST skapa.
- `senders/[id]/route.ts` — PATCH. Textändring nollställer `approved`.
- `senders/[id]/leads/route.ts` — GET `status` + `q`.
- `senders/[id]/send/route.ts` — POST batch. `409` + `EMAIL_PAUSED` när grinden är stängd.
- `leads/[id]/route.ts` — PATCH, DELETE.
- `leads/[id]/preview/route.ts` — GET. Får aldrig anropa `getEmailSender`.
- `leads/approve/route.ts` — POST `{ ids }`.

Import och export väntar på beslut 3. Ingen publik `/p/:token` i den här porten: klick går redan till butiks-URL med UTM i `buildShopEmail`. Öppningsräknare kan fyllas senare av spårningsplanen utan att claim ändras.

`emailEnabled()` kopieras oförändrad: sant bara när flaggan inte är `true` och `RESEND_API_KEY` är satt. Send-routen claimar inget när den är falsk.

## 4. Före Resend-kontot

Går att bygga och köra mot mock och mot preview:

- Migration, repository, statusmaskin, claim-test.
- `MockEmailSender` + enhetstest att mock inte är ett riktigt utskick.
- Preview-rutter (finns redan per butik; utöka till lead-rad) utan nyckel.
- Send-rutt som svarar `409 EMAIL_PAUSED` när nyckel saknas. Verifiera att ingen rad lämnar `approved`.
- `.env.example`: `RESEND_API_KEY=`, `RESEND_FROM_ADDRESS=`, `FEATURE_EMAIL_DISABLED=true`.

Gör inte: anropa Resend, verifiera domän, eller låta mock sätta `sent`. Sätt inte en boot-check som vägrar starta Next för att nyckeln saknas. Roots `validate-env` hör hemma i en dedikerad API-process; här räcker grinden i send-rutten.

## 5. Beslut som användaren måste ta

1. **En avsändare eller flera.** Roots har en rad per säljare med eget tak och egen mall. Namnskylt kan börja med en rad (namn, telefon och e-post från företagsprofilen) och `daily_cap` 40. Flera avsändare kräver `user_id` och synlighetsregler vi annars kan hoppa över.
2. **Fast brev eller redigerbar mall.** Rekommendation: `buildShopEmail` är brevet. `subject_override` / `body_override` kan vänta. Roots hakparentesmall är föreningskalkyl, inte en återförsäljarbutik.
3. **Hur leads kommer in i den här porten.** Upsert-kontraktet är redo. Excel-importen (`exceljs`, kolumngissning) portas bara om lead-planen vill ha xlsx. Annars matar den planen in rader som `draft` via repositoryt.
4. **Spårad token-länk eller befintlig butiks-URL.** Rekommendation: behåll `token` i tabellen men länka som idag (`/butik/[slug]` + UTM). Publik öppnings-endpoint är ett senare val.
5. **Får dev-mock markera rader som skickade för att öva UI:t.** Rekommendation: nej, följ Roots. Mock → `failed` eller, hellre, send-rutten öppnas inte alls utan nyckel. Preview täcker granskningen.

## 6. Risker och hur de hanteras

- **Dubbelmejl efter omgodkännande av `failed`.** Samma som Roots. `last_error` säger åt operatören att kolla leveransen. Ingen tyst retry.
- **Claim som två frågor.** `SKIP LOCKED` gäller bara om lås och statusbyte är samma sats. `claim.integration.test.ts` är grinden.
- **Mock som ser ut som succé.** `isRealEmailSend` är obligatorisk före `sent`. Enhetstestet från Roots porteras.
- **Prod utan nyckel kastar i `getEmailSender`.** Anropa den bara från `send-batch` efter `emailEnabled()`. Övriga rutter och sidrendering får inte importera den vid start.
- **`FEATURE_EMAIL_DISABLED` pausar all mejl som senare använder samma singleton** (orderbekräftelse, inbjudan). Flaggan ska förbli global, inte en outreach-only-switch.
- **Avsändardomän.** `sendingDomain()` måste läsa Namnskylts `RESEND_FROM_ADDRESS`. Fel domän ger Resend-4xx och `failed`, inte `sent`.
- **Serverless-timeout.** Budgeten 15 s är satt under Roots webbproxy (25 s). Sätt `maxDuration` på send-routen minst lika högt om hosten kapar tidigare. Klienten loopar på `more`.
- **Unik e-post per avsändare.** En andra kampanj till samma adress uppdaterar bara `draft`/`approved`. Skickat ligger kvar. En ny kampanj kräver ny avsändarrad eller ett senare kampanj-id — bygg inte det nu.
- **`sent` betyder accepterad av Resend, inte levererad.** Inga studsar i den här koden. Bounce-stopp hör till schemaläggningen, som i Roots ligger utanför routern.

## 7. Beroenden till andra planområden

Numreringen 02–16 är inte given i den här körningen. Kontraktet från 01 som de ska följa:

- **Operatörs-UI** (Roots `apps/web/.../lead-mejl/page.tsx`): anropa rutter och fältnamn ovan, inklusive `more` / `capReached` / `EMAIL_PAUSED` och att listan tar max 500.
- **Mejl-HTML och butiksbild:** `buildShopEmail` + `shop-mockup`. Ändra inte claim för att byta layout. `missing` ska vara tom när brevet är skickbart.
- **Leadlista** (`docs/leads` i Roots, urval av återförsäljare här): skriv `draft`-rader eller be om Excel. Respektera upserten. Rör inte `sending`/`sent`.
- **Resend-konto, DNS, env:** sätt de tre variablerna. Rör inte sändarvalet. `setup-resend.py` är Roots/Railway och ska skrivas om, inte kopieras.
- **Schemaläggning och tak över tid:** anropa `send-batch`, godkänn inte implicit. Bounce-stopp finns inte i routern.
- **Spårning, avregistrering, signerad länk:** `open_count` finns som kolumn. Avregistrering finns redan som `unsubscribeUrl` i `shop-email.ts`. En suppression-lista måste få send-batch att hoppa över adressen innan claim, annars markeras den `failed` i onödan — flagga det i den planen.
- **Admin-auth:** återanvänd `isOwner`. Ingen ny rollmodell.
