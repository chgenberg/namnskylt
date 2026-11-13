# Masterplan — återförsäljarutskick via Resend

Förenar delplanerna 01–16 med `01-KUNDLISTA.md`. Där en delplan säger emot den här filen gäller den här filen.
Påståenden om koden är kontrollerade mot repot 2026-11-10 (läs avsnitt 2, kolumnen *Verifierat*).

## 1. TL;DR

Vi bygger en mejlagent i `src/lib/outreach/` som skickar ett personligt mejl till **befintliga United Profile-återförsäljare**:
531 rader, varav 374 i Sverige och 157 i Norge. De är redan kunder, så budskapet är "en ny kanal för er", inte "hej, vi finns".
Mejlet visar en graverad namnskylt med kontaktpersonens namn och återförsäljarens logga. Skylten ritas av vår egen motor på ett material som
Skylt & Gravyrteknik tillverkar automatiskt. Varje länk går till en personlig landningssida, `/for/[token]`. Där finns samma skylt,
en färdig demobutik och knappen **Aktivera min butik**, som återanvänder det befintliga inbjudningsflödet.
Budskapet styrs av de fyra relationssegmenten i listan (aktiverat sortiment × känd). Branschen från varumärkesskrapningen är bara berikning.
Avsändarryktet skyddas av en separat sändningsdomän (`mail.namnskylt.com`), en enda uppvärmningstabell, automatisk paus vid klagomål och
studsar, och ingen öppnings- eller klickspårning hos Resend. Mottagarna skyddas av en spärrlista, en avregistrering i ett klick (även
`List-Unsubscribe`), en juridisk sidfot och en intresseavvägning. Inget lämnar servern förrän en människa har godkänt raden, `RESEND_API_KEY`
är satt och kontrollraden står på `live`. Allt i Fas 0 körs mot en mock-sändare och förhandsvisning.

## 2. Konfliktbeslut

| # | Fråga | Delplanernas förslag | Beslut | Motivering |
|---|---|---|---|---|
| 1 | Målgrupp | 05: 40 kalla bolag ur SPA/allabolag. 07: bara funktionsadresser, inga namngivna anställda | **531 befintliga kunder ur `PROFIL KUNDER 2026.xlsx`, namngiven kontaktperson.** Inget poängsystem, ingen källsökning | 01-KUNDLISTA. 05:s urval och `scoreReseller` byggs inte. 05:s förbud mot enskild firma ersätts av en manuell granskning av de rader som saknar bolagsform |
| 2 | Rättslig grund | 07: berättigat intresse för kall B2B, stopp för fysiska personer | Berättigat intresse (art. 6.1 f) **plus befintlig kundrelation**. Mejlet går till kontaktpersonen i tjänsten hos en juridisk person. MFL 19 § andra stycket (befintlig kund, egna likartade produkter, avböjande i varje mejl) är reserven om en mottagare räknas som fysisk person. **[Bekräfta]** | Starkare grund än kall B2B. Från 07 gäller fortfarande: avregistrering, spärrlista, sidfot, List-Unsubscribe, intresseavvägning och `/integritet` |
| 3 | Segment | 05: sex branscher. 06: åtta koder i `check`. 11: fyra branscher. 13: fem AI-segment | **Relationssegmentet styr budskapet.** Det härleds ur `activated` och `known` på leadet och lagras inte. Branschen hamnar i `brand.industry` och används bara som filter för operatören | Listan har redan segmenten. Branschen blir ofta fel på profilbolag (05 skriver själv det) |
| 4 | Leadidentitet | 02: domän. 06: `lower(email)` | Unik `lower(email)`. Två rader på samma domän får `check_reason = 'shared-domain'` och granskas | Det är kontaktpersonen som får mejlet. Listan har 2 dubbletter som ska slås ihop, inte en per domän |
| 5 | Sajt för berikning | 02/13: `website`, annars mejldomänen | **Mejldomänen först.** `Hemsida` används bara om den ligger på samma registrerbara domän. Annars sparas den som `up_shop_url` och skrapas inte | Kundlistan: `Hemsida` pekar ofta på United Profile-butiker |
| 6 | Fripost | 07: spärra alltid | Tillåts efter manuell granskning (3 rader). Ingen sajt skrapas för dem | De är kunder, inte kalla adresser. Bara varumärkesbilden saknas |
| 7 | Sändningsdomän | 03: `utskick.`. 08: `mail.`. Kontexten nämnde också `hej.` | **`mail.namnskylt.com`**, avsändare `<förnamn>@mail.namnskylt.com` | Verifierat: `mail` finns i `RESERVED` i `src/lib/shops/host.ts`. `utskick` och `hej` matchar `SHOP_SLUG` och blir butiksunderadresser |
| 8 | Tokenformat | 02/06: slump-token på leadet. 07: `v1.{email}.{exp}.{sig}`. 12: `v1.{exp}.{messageId}.{sig}`. 14: slump-token i `/r/` | **Ett HMAC-system**, `src/lib/outreach/link-token.ts`: `v1.{purpose}.{messageId}.{exp}.{sig}`, där purpose är `l` (landning) eller `u` (avregistrering). En hemlighet, `OUTREACH_LINK_SECRET`, plus `_PREVIOUS` vid rotation. Landning gäller 60 dygn, avregistrering 730 dygn. Ingen `token`-kolumn, ingen `/r/` | Ingen e-post i URL:en. Purpose skiljer avregistrering från klick, så en länkskanner avregistrerar ingen. Den befintliga inbjudningstoken (`shop_invites`) skapas först vid aktivering |
| 9 | CTA | 11: "Svara ja". 04: butiken först och övertagande som tvåa. 12: `/for/[token]` | **`/for/[token]`** är den enda länkmålet. "Svara på mejlet" är en textrad | Den personliga skylten och demobutiken gör mer än ett svar. Svaret fungerar ändå eftersom `reply_to` är en riktig inkorg |
| 10 | Klickmätning | 14: redirect via `/r/`. 12: räkna på sidan | Sidan räknar (`landed_at`, med filter på `BOT_UA`). `/for/[token]/butik` räknar `demo_opened_at` och svarar 302. Resends pixel och klickomskrivning är av | Ett hopp färre, en domän. Apple MPP gör öppningar meningslösa |
| 11 | Sekvens | 11: dag 0/4/10. 15: 0/4/7 vardagar. 07: ingen påminnelse. 06: ett steg | **Två steg:** huvudmejl dag 0, påminnelse efter 5 vardagar. Påminnelsen går bara om steg 1 levererats och mottagaren varken landat, svarat eller avregistrerat. Steg 2 ligger bakom `campaign.steps` (av tills beslut 4) | Befintliga kunder tål ett andra mejl, inte tre |
| 12 | Takvolym | 01/03: 20–40/dygn. 08: ramp 8→80. 15: 15/h och 40/dygn. 16: 10, sedan 25, sedan 40 | **En tabell, avsnitt 7.** Koden tar `min(campaign.daily_cap, uppvärmning, kvar i timmen)` | Enda tabellen som både värmer domänen och når 374 mottagare på ungefär sex veckor |
| 13 | Sändmekanism | 01/03: knapp som loopar på `more`. 15: `runOutreachTick` med cron | `runOutreachTick(trigger)` med advisory lock. Fas 0: knappen **Kör ett tick** i admin. Fas 2: Railway-cron var 5:e minut mot `POST /api/outreach/tick` | Samma kod för båda. Ingen kö, ingen Redis, ingen `setInterval` |
| 14 | Statusmaskin | 01: på leadet. 06: på `outreach_messages`. 15: `recipients` + `steps` | 06:s tabeller med 15:s retry-fält (`attempts`, `next_attempt_at`, `needs_review`) och 15:s `outreach_control`/`outreach_ticks`. Se avsnitt 3 | En rad per mejl ger påminnelse och webhook utan att leadet blir en soptunna |
| 15 | Mock | 01/16: `failed`. 03: `simulated`. 16: skriv utbox | Dry-run anropar `MockEmailSender`. Den skriver `tmp/outreach-outbox/` och **status ändras inte**. `sent` sätts bara när `isRealEmailSend` är sant | En övning kan inte se ut som ett utskick, och kön töms inte |
| 16 | Avstängning och läge | 16: `FEATURE_EMAIL_DISABLED` och `OUTREACH_ROLLOUT`. 03: `OUTREACH_DRY_RUN`. 15: `OUTREACH_DISABLED` plus databasrad | Tom `RESEND_API_KEY` ger mock. `OUTREACH_DISABLED=true` är nödstoppet. `outreach_control.paused` och `.mode` (`dry_run`/`live`) styrs i admin. `OUTREACH_ALLOWLIST` gäller interna tester. Vågor ligger på leadet (`wave`), inte i env | En nödbroms i env, vardagsreglaget i databasen. Inga överlappande flaggor |
| 17 | Webhook-sökväg | 03: `/api/outreach/resend`. 14: `/api/outreach/webhook` | `POST /api/outreach/webhook`, Svix-verifiering i `node:crypto`. Undantag i `src/middleware.ts` | Verifierat: middleware släpper idag bara de fem sökvägar som står i koden |
| 18 | Migrering | 06: `013_outreach`. 10: `014_outreach_badges`. 13: `013_outreach_enrichment` | **En migrering, `013_outreach`**, med alla tabeller i avsnitt 3 | Verifierat: den senaste är `012_shop_editor` |
| 19 | Skyltbild | 09: mässing, PNG 1200. 10: PNG 1104 plus GIF. 08: JPEG under 80 kB. 12: plast svart/vit | **JPEG 1200×600 på täckande papper `#f4f2ec`, ≤ 100 kB, visas i 600 px.** Material `plastic-2-layer` med `matchColorCombo` mot logans färger, annars `black-white`. Ingen GIF i v1 | Mässing, akryl och epoxy är `producer: "quickbutton"` (verifierat i `src/engine/catalog.ts`). Mejlet visar bara det som går automatiskt till Skylt & Gravyrteknik |
| 20 | Mall | 09: handskrivna tabeller. Idag: `shop-email.ts` | `src/lib/outreach/reseller-email.ts` (`buildResellerEmail`) och `email-layout.ts` ersätter `shop-email.ts`. Dagens `GET /api/admin/shops/[slug]/email` tas bort | Dagens brev lovar "kunderna ser aldrig vårt namn", "på en dag" och "ordrarna går direkt till er", och länkar till en `/avregistrera?butik=` som inte finns (verifierat) |
| 21 | Länkar i mejlet | 08: högst 2 unika `href`. 10: 2×2 klickbara materialrutor | Alla `href` är https på `namnskylt.com`, med högst två unika sökvägar: landningen och avregistreringen. Rutorna skiljs med `?m=` | Vi behåller interaktiviteten och tar bort det som ser ut som spam (flera värdar, kortlänkar) |
| 22 | AI-personalisering | 13: egen textmodell, öppningsmening | **Byggs inte i v1.** Segmentcopy och kontaktnamn räcker. Ingen `outreach_enrichment` | Kunder känner oss redan. En AI-mening kostar en granskning per rad och lägger till risk |
| 23 | Demobutik | 12: byggs lat vid första klicket. 04: `prepareResellerDemo` | **Förbyggs per våg** med `scripts/outreach-prepare.ts`. Kassan i en ägarlös outreach-butik spärras | Safe Links och andra skannrar kan inte starta Playwright. Skylten i mejlet kräver ändå loggan i förväg |
| 24 | Kalkylark | 02: `readTable` med högre tak | `readTable(name, bytes, { sheet, maxBytes, maxRows })` med oförändrad default | Verifierat: `readTable` läser första bladet, och det är `Blad2` (strategin) |
| 25 | Norge och Åland | — | Inte med i första utrullningen. Separat våg `NO` efter beslut 3 | Språket är inte den enda frågan: butikerna har priser i SEK med svensk moms, och Norge och Åland ligger utanför EU:s momsområde |
| 26 | Lagring | 07: 365 dygn, spärren raderas aldrig | Samma. **[Bekräfta]** | — |
| 27 | AMP, checkbox-flikar, öppningspixel | 10/08: nej | Nej | De når inte Outlook och Gmail-appen, och pixeln mäter fel |

## 3. Arkitekturöversikt

**Testregel.** `pnpm test` kör `src/lib/**/*.test.ts` utan `globstar`, alltså bara en katalognivå. Testerna ska därför ligga direkt i
`src/lib/outreach/` och `src/lib/email/`, utan underkataloger. Moduler som testas får inte importera `server-only`. Det får bara
`repository.ts` och skripten, som körs med `--conditions=react-server`.

### Moduler

| Fil | Ansvar | Ren |
|---|---|---|
| `src/lib/email/types.ts` | `EmailMessage` (`from`, `to`, `replyTo`, `subject`, `html`, `text`, `headers`, `idempotencyKey`), `SendEmailResult` (`success`, `id`, `mocked`, `status`, `error`) | ja |
| `src/lib/email/mock-sender.ts` | Skriver `{OUTREACH_OUTBOX_DIR}/<iso>-<id>.{json,html}`. Returnerar `mocked: true` | fs |
| `src/lib/email/resend-sender.ts` | `POST https://api.resend.com/emails`, 15 s abort, `headers`, `Idempotency-Key`. `fetch` injiceras | ja |
| `src/lib/email/index.ts` | `emailMode(env)` (`mock`/`live`), `getEmailSender(env)` utan cache, `isRealEmailSend` | ja |
| `src/lib/outreach/model.ts` | Konstanter, zod, `relationSegment`, `canTransitionMessage`, `idempotencyKey`, `normalizeEmail` | ja |
| `src/lib/outreach/link-token.ts` | `signLinkToken`, `verifyLinkToken`, `timingSafeEqual` | ja |
| `src/lib/outreach/customer-import.ts` | Läser blad och kolumner ur kundlistan, normaliserar, slår ihop dubbletter, väljer webbplats, flaggar | ja |
| `src/lib/outreach/warmup.ts` | Stockholmsdygn, fönster, helgdagar, uppvärmningstak, `retryAfterSeconds`, pausregler | ja |
| `src/lib/outreach/send-gate.ts` | `outreachBlockers(lead, message, ctx)`: skäl som blockerar godkännande och sändning | ja |
| `src/lib/outreach/badge-asset.ts` | Bygger `BadgeDocument` för leadet, väljer material och färg, JPEG-komposit | sharp |
| `src/lib/outreach/trace-logo-server.ts` | Logga till mask med sharp raw och `traceLogoMask` (`src/engine/logo.ts`) | sharp |
| `src/lib/outreach/copy.ts` | Ämnen, preheader och stycken per segment och steg. Lista över förbjudna fraser | ja |
| `src/lib/outreach/email-layout.ts` | `emailDocument`, `bulletproofButton`, `heroImage`, `tileGrid`, `stepRow`, tema-hex | ja |
| `src/lib/outreach/reseller-email.ts` | `buildResellerEmail(input)` ger `{ subject, preheader, html, text, missing }` | ja |
| `src/lib/outreach/webhook.ts` | `verifyResendWebhook` (Svix), `planOutreachEvent` (ren effektplan) | ja |
| `src/lib/outreach/tick.ts` | `runOutreachTick(deps)`: spärrar, avbokning, återtag, claim, sändning. Databas och sändare injiceras | ja |
| `src/lib/outreach/funnel.ts` | `funnelFromRows` | ja |
| `src/lib/outreach/repository.ts` | All SQL, `server-only` | nej |
| `src/lib/outreach/prepare-demo.ts` | `prepareDemo(lead)`: hitta eller bygg butiken, rendera skylten, spara asset | nej |

### Routes

| Route | Typ | Skydd |
|---|---|---|
| `src/app/for/[token]/page.tsx` + `src/features/outreach-landing/` | Landning | `OPEN_PATHS` får `"/for/"`, `noindex` |
| `src/app/for/[token]/butik/route.ts` | Sätter `demo_opened_at`, svarar 302 till `/butik/{slug}` | token |
| `src/app/avregistrera/[token]/route.ts` | GET-sida och POST med `List-Unsubscribe=One-Click` | token (`u`) |
| `src/app/utskick/bild/[id]/route.ts` | Bildtillgång, `immutable`, utan rate limit | ogissbart id |
| `src/app/integritet/page.tsx` | Statisk sida (art. 13/14) | `OPEN_PATHS` får `"/integritet"` |
| `src/app/robots.ts` | `Disallow` för `/for/`, `/butik/`, `/aterforsaljare/`, `/admin/`, `/utskick/`, `/api/` | — |
| `src/app/admin/utskick/page.tsx`, `[leadId]/page.tsx` | Operatörsvy | `adminTenant()` och `isOwner` |
| `src/app/api/admin/outreach/{leads,approve,control,tick,preview/[messageId]}/route.ts` | Admin-API | `currentTenant()` och `isOwner`, zod |
| `src/app/api/outreach/webhook/route.ts` | Resend-händelser | Svix. Tom hemlighet ger 503 |
| `src/app/api/outreach/tick/route.ts` | Cron (Fas 2) | Bearer `OUTREACH_TICK_SECRET`. Tom ger 503 |

Middleware-undantag (`src/middleware.ts`, kör på Edge): `/api/outreach/webhook` och `/api/outreach/tick`. Sidor och route handlers
utanför `/api/` passerar redan.

### Migrering `013_outreach` (i `src/lib/db/migrations.ts`)

- `outreach_campaigns`: `id uuid`, `slug unique` (blir `utm_campaign`), `name`, `status` (`draft|active|paused|done`), `paused_reason`, `from_name`, `from_email`, `reply_to`, `daily_cap int default 40 check 1–200`, `steps jsonb` (`[{step, delayBusinessDays, template, enabled}]`), tidsstämplar.
- `outreach_leads`: `id uuid`, `email` (unik på `lower(email)`), `contact_name`, `company_name`, `phone`, `city`, `country` (`se|no|ax`), `customer_since date`, `activated bool`, `known bool`, `website`, `up_shop_url`, `brand jsonb` (inga `data:`), `wave` (`internal|A|B|C|NO`), `status` (`draft|blocked|approved|in_sequence|completed|converted|suppressed|expired`), `check_reason`, `stop_reason` (`landed|replied|activated|unsubscribed|bounced|complained|manual`), `approved_at`, `approved_by`, `shop_slug` (fk, unik), `invite_token` (fk), `reseller_id` (fk), `landed_at`, `demo_opened_at`, `replied_at`, `attributed_at`, `first_order_at`, `note`, tidsstämplar.
- `outreach_messages`: `id uuid`, `campaign_id`, `lead_id`, `step smallint`, `status` (`scheduled|ready|sending|sent|delivered|bounced|complained|failed|needs_review|cancelled|skipped`), `idempotency_key unique` (`outreach:{campaign}:{lead}:{step}`), `subject`, `not_before`, `next_attempt_at`, `attempts`, `claimed_at`, `sent_at`, `resend_id` (unik), `last_error`, `cancel_reason`, `expires_at`. Unik `(campaign_id, lead_id, step)`.
- `outreach_events`: `provider_event_id unique` (Svix-id), `message_id`, `resend_id`, `type`, `payload`, `occurred_at`.
- `outreach_suppressions`: `email` som primärnyckel (normaliserad), `reason` (`unsubscribe|bounce|complaint|manual|erasure`), `source` (`link|one_click|webhook|operator|import`), `message_id`, `created_at`. Ingen radering från UI.
- `outreach_assets`: `id text` (`randomBytes(12)`), `lead_id` (cascade), `kind` (`hero|tile`), `material_id`, `mime`, `bytes`, `width`, `height`, `badge jsonb`, `logo_status` (`logo|text-only`).
- `outreach_control`: en rad (`id boolean primary key check (id)`), `paused default true`, `mode default 'dry_run'`.
- `outreach_ticks`: `started_at`, `finished_at`, `trigger`, `result jsonb`.

Meddelandeövergångar: `scheduled→ready|cancelled`, `ready→sending|cancelled|skipped`, `sending→sent|failed|needs_review|ready` (`ready` bara vid återtag efter krasch, 10 min–24 h), `failed→ready` (backoff, högst 3 försök), `sent→delivered|bounced|complained`, `delivered→bounced|complained`.
Slutlägen: `bounced`, `complained`, `cancelled`, `skipped`, `needs_review`. Det sista kan bara en människa lägga tillbaka.

### Env (tomt värde = mock eller av)

```
RESEND_API_KEY=                 # tom = mock, inget mejl lämnar servern
RESEND_WEBHOOK_SECRET=          # whsec_… ; tom = /api/outreach/webhook svarar 503
OUTREACH_SENDING_DOMAIN=mail.namnskylt.com   # campaign.from_email måste sluta här
OUTREACH_LINK_SECRET=           # ≥ 32 tecken; tom = inga länkar utfärdas, sändning blockeras
OUTREACH_LINK_SECRET_PREVIOUS=  # verifierar bara
OUTREACH_DISABLED=              # true = nödstopp, läses varje tick
OUTREACH_ALLOWLIST=             # kommaseparerad; satt = bara dessa adresser får skickas
OUTREACH_TICK_SECRET=           # tom = cron-routen svarar 503
OUTREACH_OUTBOX_DIR=tmp/outreach-outbox
OUTREACH_LEADS_FILE=            # sökväg till xlsx i iCloud, bara i .env.local
CALENDLY_URL=                   # tom = "Boka 15 min" visas inte
```

### Flöde från import till första order

1. `pnpm outreach:import` läser `OUTREACH_LEADS_FILE` (bladen `SWE` och `Norge`). Raderna skrivs som `draft` eller `blocked` med `check_reason`.
2. Operatören granskar, sätter `wave` och godkänner (`approved`). `outreachBlockers` måste vara tom.
3. `pnpm outreach:prepare --wave A` bygger eller hittar demobutiken (`shop_slug`), spårar loggan och renderar hjälte och rutor till `outreach_assets`.
4. Kampanjen aktiveras och `ensureMessages` skapar steg 1 som `ready` och steg 2 som `scheduled`.
5. `runOutreachTick` kontrollerar spärrar, avbokar, återtar fastnade rader, räknar tak, tar en rad med `FOR UPDATE SKIP LOCKED`, läser spärrlistan igen, renderar och skickar. Därefter sätts `sent` eller `failed`.
6. Webhooken sätter `delivered`, `bounced` eller `complained`, skriver spärr och pausar kampanjen enligt reglerna i avsnitt 7.
7. Mottagaren landar på `/for/[token]` (`landed_at`), öppnar butiken (`demo_opened_at`) och väljer **Aktivera**. Då skapas `createInvite`, sedan körs `ClaimForm` och `claimInviteAction`, och `attributed_at` sätts. Steg 2 avbokas.
8. Den första riktiga butiksordern (`source` `shop` eller `web`, inte `is_demo`) sätter `first_order_at`.

## 4. Mejlet

**Sekvens.** Steg 1 skickas dag 0. Steg 2 skickas efter 5 vardagar, bara om steg 1 är `delivered` och `stop_reason` är tom. Helger och
svenska helgdagar räknas inte som vardagar. Fönstret är vardagar 08:30–16:00 Europe/Stockholm.

**Struktur, 600 px, bara tabeller, en kolumn:**
1. Preheader, dold, olika per segment.
2. Mast: Namnskylt-logotyp som PNG till vänster. Till höger i mono: `Till {företag}`.
3. Hälsning `Hej {förnamn}!`. Saknas ett riktigt namn blir det `Hej!`. Därefter två meningar segmentintro ur `copy.ts`.
4. **Hjälte:** den personliga skylten (JPEG, `width="600"`, alt-text `Graverad namnskylt med {namn} och {företag}s logga, gravyrplast`) som länk till landningen. Under den en bildtext i mono: `Fig. 1 — gravyrplast {färg}, 70 × 25 mm`.
5. Knapp (VML plus ankare, bläck `#0a0a0b`): **Se er skylt och butik**.
6. Tre rader "Det här får ni": egen butik med er logga och era priser, kunden ser skylten i 3D innan beställning, Skylt & Gravyrteknik tillverkar och ni har inget lager.
7. **Materialrutor 2×2:** gravyrplast i två färger, borstad aluminium och rostfritt. Varje ruta är en `<a>` till `/for/{token}?m={materialId}` med synligt materialnamn under bilden.
8. Avslutning: "Svara på mejlet om ni hellre vill att jag ringer." Därefter signatur med namn, titel, telefon och e-post från kampanjen.
9. Sidfot (kan inte redigeras): juridiskt namn, org.nr, postadress, "Ni får det här för att {företag} är kund hos oss sedan {år}", länk till `/integritet` och **Avregistrera** med token `u`.

**Personlig skylt.** `createBadgeDocument([kontaktnamn, företagsnamn])`, form `rounded`, 70×25 mm. Om `Kontaktperson` är en e-postadress
eller kortare än 2 tecken graveras bara företagsnamnet. Loggan spåras server-side till en gravyrmask. Om spårningen misslyckas blir
`logo_status = 'text-only'`, och copyn säger då inte "er logga". Färgen är närmaste katalogfärg från `matchColorCombo(colors, "plastic-2-layer")`,
och copyn säger "närmaste färg vi graverar". Dokumentet valideras med `badgeDocumentSchema` innan det sparas.

**Interaktivitet som fungerar i alla klienter:** klickbar hjältebild, en knapp, fyra klickbara materialrutor och en landningssida med
den riktiga 3D-motorn, förifylld via `/butik/{slug}/skapa?f={assetId}`. Ingen AMP, inga checkbox-flikar, ingen GIF och inga webbtypsnitt.
Mörkt läge följer 09: rubriker i Georgia, ytan bakom bilden är låst till ljust papper, och återförsäljarens färg används bara i skylten.

**Ämnesrader (steg 1 / steg 2):**

| Segment | Steg 1 | Steg 2 |
|---|---|---|
| Aktiverat, känd | `{förnamn}, en namnskyltsbutik åt {företag}` | `Skylten med {företag}s logga ligger kvar` |
| Aktiverat, ej känd | `Nytt för er med vårt sortiment: graverade namnskyltar` | `{företag}s namnskyltsbutik är klar att prova` |
| Ej aktiverat, känd | `{förnamn}, jag graverade en skylt åt {företag}` | `Vill ni se skylten innan jag stänger butiken?` |
| Ej aktiverat, ej känd | `En graverad namnskylt med {företag}s logga` | `Er butik för namnskyltar finns redan` |

**Får inte stå** (`copy.ts` exporterar `FORBIDDEN_PHRASES`, och ett test spärrar dem): kronbelopp, marginalprocent, "på en dag", "kunderna ser aldrig vårt namn",
"ordrarna går direkt till er", "kunden betalar i butiken", egen domän som färdig funktion, mässing eller akryl som automatisk gravyr, och
"fem arbetsdagar" tills Skylt & Gravyrteknik har bekräftat det.

## 5. Fas 0 — förberedelser före Resend-kontot

Varje steg avslutas med att `pnpm typecheck && pnpm lint && pnpm test && pnpm build` går grönt. Inget steg kräver API-nyckel eller domän.
`RESEND_API_KEY` sätts inte i `.env.local` under Fas 0.

### Steg 1 — Migrering och domänmodell
- Ändra `src/lib/db/migrations.ts`: lägg till `013_outreach` med tabellerna i avsnitt 3.
- Skapa `src/lib/outreach/model.ts` med `LEAD_STATUSES`, `MESSAGE_STATUSES`, `SUPPRESSION_REASONS`, `WAVES`, `relationSegment(lead)`, `canTransitionMessage(from, to)`, `idempotencyKey()`, `normalizeEmail()` och `outreachBrandSchema` (som vägrar `data:`).
- Test `src/lib/outreach/model.test.ts`: hela övergångstabellen, både tillåtna och förbjudna övergångar. Varje status i TypeScript finns i migreringens `check`. Segmentet härleds för alla fyra kombinationer.
- Klart när: `pnpm db:migrate` kör lokalt och `schema_migrations` innehåller `013_outreach`.

### Steg 2 — Transport och mock-sändare
- Skapa `src/lib/email/{types,mock-sender,resend-sender,index}.ts`. Lägg till `tmp/` i `.gitignore`.
- `emailMode` ger `live` bara när nyckeln finns och `OUTREACH_DISABLED` inte är satt. `getEmailSender` cachar inte. `ResendEmailSender` skickar `headers` och `Idempotency-Key` och klassar svaren: 429/5xx/timeout kan försökas igen, övriga 4xx är permanenta.
- Test `src/lib/email/email.test.ts`: `isRealEmailSend` (mock, fel och `success` utan id ger alla `false`), lägesmatrisen, att mock-utboxen innehåller `List-Unsubscribe-Post`, och att Resend-kroppen och headrarna stämmer med injicerad `fetch`. Ingen riktig HTTP.
- Klart när: en mock-sändning ger en `.json` och en `.html` under `tmp/outreach-outbox/` med `mocked: true`.

### Steg 3 — Signerade länkar
- Skapa `src/lib/outreach/link-token.ts` med `signLinkToken({ purpose, messageId, expUnix }, secret)` och `verifyLinkToken(token, secrets, now)`.
- Test `link-token.test.ts` med `withEnv` som i `signed-pass.test.ts`: giltig token, ändrad signatur, fel purpose (`u` som `l`), utgången, verifiering med `_PREVIOUS`, för kort hemlighet som vägrar utfärda, och att tokenet inte innehåller `@`.
- Klart när: testerna är gröna och tokenet är kortare än 120 tecken.

### Steg 4 — Import av kundlistan
- Ändra `src/lib/spreadsheet/read-table.ts`: lägg till valfria `{ sheet?: string; maxBytes?: number; maxRows?: number }` med oförändrad default. Designerns anrop ändras inte.
- Skapa `src/lib/outreach/customer-import.ts` med `parseCustomerSheet(table, country)`. Den trimmar `&nbsp;`, läser "Har aktiverat er" och "JA"/"Ja", gör om Excel-datum till `customer_since`, flyttar en `Kontaktperson` som är en e-postadress till `check_reason = 'contact-is-email'`, sätter `Land = ax` till `ax`, slår ihop dubbletter på `lower(email)` och flaggar fripost. Webbplatsen väljs med `websiteFor(email, hemsida)` enligt beslut 5.
- Skapa `scripts/outreach-import.ts` och lägg till `pnpm outreach:import` i `package.json`. Utan `--write` skrivs bara räknare per land och segment ut, aldrig namn eller adresser. Med `--write` görs `upsertLead`, och en befintlig `reseller_accounts.email` ger `blocked` med `already-reseller`.
- Test `customer-import.test.ts` på påhittade rader: alla fällor i 01-KUNDLISTA, en United Profile-hemsida som ger mejldomänen, och fripost utan webbplats.
- Klart när: en torrkörning mot riktiga filen visar SE 374 (180/194), NO 157 (52/105), 2 dubbletter och 3 fripost.

### Steg 5 — Repository och claim
- Skapa `src/lib/outreach/repository.ts`: `upsertLead` (skriver aldrig över `approved` och senare), `approveLeads`, `ensureMessages`, `claimNextReady` (en sats med `SKIP LOCKED`), `markSent`, `markFailed`, `reclaimStale`, `suppress`, `isSuppressed`, `getControl`, `setControl`, `recordTick`.
- Test `claim.integration.test.ts` med `{ skip: !process.env.DATABASE_URL }`: åtta parallella claim mot fem rader ger fem unika id och sedan `null`. En upsert på en `sent` rad ändrar ingenting.
- Klart när: testet är grönt lokalt med databas och hoppas över utan.

### Steg 6 — Spärrar, uppvärmning och fönster
- Skapa `src/lib/outreach/warmup.ts` med `stockholmDayStart`, `isInSendWindow`, `nextWindowOpen`, `warmupCap(firstRealSentAt, now)` (tabellen i avsnitt 7), `addBusinessDays` och `pauseDecision(events)`.
- Skapa `src/lib/outreach/send-gate.ts`. `outreachBlockers` ger ett skäl om något av följande gäller:
  - avsändarprofilen saknar juridiskt namn, org.nr eller adress
  - `from_email` slutar inte på `OUTREACH_SENDING_DOMAIN`
  - `reply_to` är tom eller ligger på sändningsdomänen
  - adressen är spärrad, eller allowlist är satt och adressen saknas i den
  - `country` är inte `se`, eller `wave` saknas
  - `shop_slug` eller hjältebilden saknas
  - `mode = live` och `supplierApiConfigured()` är falsk
- Test `warmup.test.ts` och `send-gate.test.ts`: sommar- och vintertid (2026-03-29, 2026-10-25), fredag 15:59, lördag, trettondagen, dag 1/8/29 i rampen, 1 klagomål ger paus, 2 hårda studsar samma dygn ger paus, och tom `DEFAULT_COMPANY` blockerar.
- Klart när: varje blockerare har ett namngivet skäl på svenska som admin kan visa.

### Steg 7 — Personlig skylt och bildroute
- Skapa `src/lib/outreach/trace-logo-server.ts` (sharp raw till Otsu till `traceLogoMask`) och `badge-asset.ts`: `badgeForLead`, `heroJpeg` (1200×600, papper, kvalitet 75, ≤ 100 kB, annars 1000 px) och `tileJpeg` för de fyra materialen.
- Skapa `src/app/utskick/bild/[id]/route.ts` med `cache-control: public, max-age=31536000, immutable` och `X-Robots-Tag: noindex`.
- Test `badge-asset.test.ts`: dokumentet klarar `badgeDocumentSchema`, `colorId` finns för materialet, materialet har alltid `producer: "skylt-gravyr"`, en e-postadress som namn graveras inte, och en enkel PNG spåras till en bana. Ett test ser till att JPEG-taket hålls för en fixtur.
- Klart när: fixturen ger en JPEG som öppnas och ligger under 100 kB.

### Steg 8 — Demobutik per lead
- Skapa `src/lib/outreach/prepare-demo.ts`. `prepareDemo` letar upp butiken på `data->>'sourceUrl'`, annars körs `buildShop(website, { name })`. Utan webbplats eller vid fel skapas en skalbutik med `createShop` utan logga. Sedan renderas och sparas assets och `shop_slug` sätts.
- Skapa `scripts/outreach-prepare.ts` och `pnpm outreach:prepare` (`tsx --conditions=react-server`, concurrency 2, kan återupptas).
- Ändra `src/app/api/orders/route.ts`: en butik med `owner_id` null som har ett `outreach_leads.shop_slug` svarar 409 "Butiken är en förhandsvisning". Ordern skapas inte.
- Test `prepare-demo.test.ts` för den rena delen (`pickDemoSource`) och `orders`-spärren som en ren funktion (`isOutreachPreviewShop`).
- Klart när: två körningar på samma lead ger en butik, inte två.

### Steg 9 — Mejlmallen och förhandsvisning
- Skapa `src/lib/outreach/copy.ts`, `email-layout.ts` och `reseller-email.ts`. Ta bort `shop-email.ts` och `shop-email.test.ts` och flytta deras fall till det nya testet. Ta bort `src/app/api/admin/shops/[slug]/email/route.ts` och knappen som anropar den.
- Skapa `scripts/outreach-preview.ts` och `pnpm outreach:preview`. Skriptet skriver `tmp/outreach-preview/{index.html, <segment>-<steg>.html, .eml}` från fixturer, utan databas och utan nät.
- Test `reseller-email.test.ts`:
  - escaping (`Profil & <Co>`)
  - `missing` för tomt företag, saknad bild och saknad avregistrering
  - ingen `src="data:"` och ingen `.webp`
  - alla `href` ligger på `namnskylt.com`, med högst två unika sökvägar
  - texten är minst 200 tecken utan taggar och innehåller båda URL:erna
  - sidfoten har org.nr och `/integritet`
  - ingen `FORBIDDEN_PHRASES`
  - HTML:en är under 80 kB
  - "er logga" står inte med när `logo_status = 'text-only'`
- Klart när: 4 segment × 2 steg öppnas i Apple Mail och Outlook från `.eml` och granskas mot avsnitt 4.

### Steg 10 — Avregistrering och integritet
- Skapa `src/app/avregistrera/[token]/route.ts` och `src/lib/outreach/unsubscribe.ts` (`handleUnsubscribe(token, deps)`). GET visar en sida med knappen **Avregistrera** (ett klick, ett formulär med POST) och spärrar inte själv, eftersom länkskannrar hämtar GET. POST spärrar, både från formuläret och från `List-Unsubscribe=One-Click`. Anropet är idempotent och en ogiltig token förklaras på sidan.
- Skapa `src/app/integritet/page.tsx`, lägg `/integritet` i `OPEN_PATHS` och skriv mallen `docs/aterforsaljar-utskick/intresseavvagning.md` med hakparenteser.
- Test `unsubscribe.test.ts`: giltig token skriver en spärr en gång, ett landningstoken vägras, och POST utan rätt kropp ger 400.
- Klart när: ett klick i förhandsvisningens `.eml` lokalt ger en rad i `outreach_suppressions` och nästa `outreachBlockers` svarar `suppressed`.

### Steg 11 — Landningssidan och aktivering
- Lägg `/for/` i `OPEN_PATHS` i `src/app/layout.tsx`. Skapa `src/app/for/[token]/page.tsx`, `src/features/outreach-landing/{landing,activate-panel}.tsx` och `landing.module.css` (bara tokens), samt `src/app/for/[token]/butik/route.ts`.
- `activateOutreachAction` återanvänder en oanvänd inbjudan eller anropar `createInvite`. `ClaimForm` får en valfri `submitLabel`. `claimInviteAction` kräver att e-postadressen är inbjudans och anropar `attributeLead`.
- Skapa `src/app/robots.ts`. `X-Robots-Tag` sätts i middleware för `/for/`, `/butik/` och `/aterforsaljare/`.
- Test `landing.test.ts` för `recordLandingDecision(ua, isOwnerSession)` (BOT_UA och ägarsession räknas inte). Testet visar också att ogiltig, utgången och fel purpose ger samma sida.
- Klart när: en lokal lead-rad med token visar skylten och butiken, och aktiveringen landar i `/admin/butiker/{slug}` med `attributed_at` satt.

### Steg 12 — Tick, dry-run och webhook
- Skapa `src/lib/outreach/tick.ts` med `runOutreachTick({ db, sender, clock, env })` och ordningen från plan 15. Under uppvärmningsvecka 1–4 skickas högst 1 per tick, därefter högst 3. Dry-run renderar kandidaterna till utboxen utan att ändra status.
- Skapa `src/app/api/admin/outreach/tick/route.ts`.
- Skapa `src/lib/outreach/webhook.ts` (Svix över `${id}.${ts}.${body}`, 300 s tolerans, flera `v1,` i headern) och `src/app/api/outreach/webhook/route.ts`, och lägg undantaget i middleware.
- Test `tick.test.ts` och `webhook.test.ts`:
  - en fejkad sändare som kastar om den anropas i paus, dry-run, `OUTREACH_DISABLED`, utanför fönstret och vid tak 0
  - en spärr som sätts mellan claim och fetch hindrar sändningen
  - en leverantörssignatur godkänns inte
  - Permanent bounce spärrar och Transient gör det inte
  - en dubblett av `svix-id` gör ingenting
- Klart när: **Kör ett tick** i dry-run fyller utboxen för godkända rader och alla `outreach_messages` står kvar som `ready`.

### Steg 13 — Operatörsvyn
- Skapa `src/app/admin/utskick/page.tsx` och `[leadId]/page.tsx`. Lägg till `{ href: "/admin/utskick", label: "Utskick", ownerOnly: true }` i `src/features/admin/admin-shell.tsx`.
- Skapa `src/features/outreach/{lead-table,lead-drawer,control-bar,funnel-kpis}.tsx` och `outreach.module.css`.
- Vyn har filter (våg, segment, land, status, `check_reason`), förhandsvisning i en `iframe sandbox=""` via `GET /api/admin/outreach/preview/[messageId]`, godkänn och sätt våg, paus och läge (`live` kan inte väljas utan nyckel), **Kör ett tick**, senaste tick, och tratten från `funnelFromRows`.
- Test `funnel.test.ts`: `is_demo` och `source = 'reseller'` räknas inte som första order, och vågen `internal` hålls utanför.
- Klart när: hela flödet från import via förbyggd butik, godkännande och dry-run till förhandsvisning kan göras i vyn utan terminal, förutom import och prepare.

## 6. Fas 1 — Resend-uppsättning

Användaren gör:
1. Skapa ett Resend-konto och godkänn biträdesavtalet (DPA) i kontot.
2. Skapa en API-nyckel `namnskylt-setup` med **Full access** och spara den i `~/.namnskylt/resend_key` (chmod 600).
3. Kör `pnpm resend:setup --domain mail.namnskylt.com`. Skriptet skapar domänen i **eu-west-1** eller återanvänder den, och skriver ut posterna.
4. Lägg in posterna hos den som har DNS för `namnskylt.com` (DNS-only om det är Cloudflare):
   - DKIM: det Resend anger
   - MX 10 på `send.mail` mot `feedback-smtp.eu-west-1.amazonses.com`
   - TXT på `send.mail` med `v=spf1 include:amazonses.com ~all`
   - TXT på `_dmarc.mail` med `v=DMARC1; p=none; rua=mailto:<inkorg>; fo=1; adkim=s; aspf=r`
   - **Ingen** `rsend`-CNAME och ingen A-post på `mail`. Läs apex-zonen först och skriv inte över befintlig DMARC.
5. Klicka Verify i Resend och vänta på status **Verified**. Stäng av open och click tracking för domänen.
6. Skapa en nyckel `namnskylt-prod` med **Sending access**. Den blir `RESEND_API_KEY` i Railway.
7. Lägg till webhooken `https://namnskylt.com/api/outreach/webhook` med händelserna `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced` och `email.complained`. Kopiera `whsec_…` till `RESEND_WEBHOOK_SECRET`. Spara endpointen först när routen är deployad och svarar 401 på en osignerad POST.
8. Sätt i Railway: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `OUTREACH_LINK_SECRET`, `OUTREACH_SENDING_DOMAIN` och `OUTREACH_ALLOWLIST` (de egna testadresserna).

Koden gör:
- `scripts/setup-resend.ts` (`pnpm resend:setup`) avslutar utan nyckelfil, skriver aldrig ut nyckeln, sätter inga driftvariabler och pollar verify högst 40 × 15 s.
- `runOutreachTick` vägrar `live` om domänen inte är verifierad. Den kontrolleras med `GET /domains` en gång per tick i live, cachat i 10 minuter.
- En `403` som gäller domänen pausar kampanjen med `paused_reason`.

## 7. Fas 2 — utrullning

**Uppvärmningstabell** (den enda; räknas från första riktiga `sent_at`, alla steg medräknade, bara vardagar inom fönstret):

| Vecka | Tak per vardag | Tak per timme | Högst per tick | Våg som får skickas |
|---|---|---|---|---|
| 0 | bara allowlist | 4 | 1 | `internal` (4 egna inkorgar + mail-tester.com) |
| 1 | 8 | 4 | 1 | `A`: de 15 svenska kända (segment 1 och 3) |
| 2 | 15 | 6 | 1 | `B`: SE aktiverat, ej kända (ca 170) |
| 3 | 25 | 8 | 1 | `B` |
| 4 | 40 | 12 | 1 | `B`, sedan `C`: SE ej aktiverat, ej kända (ca 190) |
| 5–6 | 60 | 15 | 3 | `C` och påminnelser |
| 7 och framåt | 80 (hårt tak) | 20 | 3 | `NO` efter beslut 3 |

`campaign.daily_cap` kan sänka taket men inte höja det. Cron (Railway, var 5:e minut, `POST /api/outreach/tick`) slås på först i vecka 1.

**Automatisk paus** (bara ägaren kan häva den, och orsaken visas):
- 1 `email.complained`.
- 2 hårda studsar samma dygn, eller 3 på 7 dygn.
- 5 `delivery_delayed` utan `delivered` efter 12 h.
- Domänfel från Resend.
- Efter 200 riktiga utskick gäller procentgränser i stället: hård studs ≥ 2 % på 7 dygn eller klagomål ≥ 0,1 %.

| Steg | Gå vidare när | Stoppa när |
|---|---|---|
| Vecka 0, internt | mail-tester ≥ 9/10. SPF, DKIM och DMARC passerar. Gmail, Outlook, Apple Mail och iOS visar bild, knapp och mörkt läge utan skräppost. Avregistrering och One-Click spärrar. Webhooken ger 401 på fel signatur. En testbounce spärrar | Poäng under 9, DKIM-fel, skräppost i någon klient, eller en webhook som godtar fel signatur |
| Våg A, 15 | 7 dygn efter sista sändningen: 0 klagomål, högst 1 hård studs, inget kvar i `sending`, och svaren är inte negativa till formen | 1 klagomål eller en domänvarning |
| Våg B | Löpande: 0 klagomål, studsar under 2 %, landning ≥ 10 % av levererade efter 100 mejl | Pausregel utlöst, eller landning under 3 % efter 100 (mejlet ses över innan våg C) |
| Våg C | Samma som B, plus minst 1 aktiverad butik från A eller B | Samma som B |
| `NO` | Beslut 3 är taget och norsk copy är granskad | — |

Målbild 14 dygn efter våg B: levererat ≥ 97 %, landning ≥ 10 %, demobutik öppnad ≥ 6 %, aktiverat konto ≥ 2 % och minst en första order inom 45 dygn.
Målen är högre än i 14 eftersom mottagarna redan är kunder.

## 8. Beslut som användaren måste ta

1. **Vem skickar och vem äger kundrelationen?** Vilken juridisk person står i "Blev kund", och vem signerar mejlet? *Rekommendation:* samma bolag som har kundrelationen. Fyll i org.nr, postadress och e-post i företagsprofilen (de är tomma i `DEFAULT_COMPANY`). En namngiven person signerar, med sin riktiga inkorg som `reply_to`. Bekräfta också vad "aktiverat sortiment" och "känd" betyder i texten. Ligger relationen hos ett annat bolag, till exempel Skylt & Gravyrteknik, ska de stå som avsändare eller ge sitt ja.
2. **Rättslig grund [Bekräfta med jurist].** *Rekommendation:* berättigat intresse plus befintlig kundrelation, mejl till kontaktpersonen i tjänsten, avregistrering i varje mejl, lagring i 365 dagar för den som inte blir kund, och en spärr som aldrig raderas. Intresseavvägningen fylls i och dateras före vecka 0.
3. **Norge och Åland.** *Rekommendation:* inte med i första utrullningen. Ta upp det igen när prissättningen (SEK, moms, tull) och leveransen till Norge är lösta. Skriv då copyn på bokmål.
4. **Påminnelse.** *Rekommendation:* ja, en påminnelse efter 5 vardagar, bara till den som inte har landat, svarat eller avregistrerat sig.
5. **Inköpspris och marginal.** *Rekommendation:* inga siffror i mejlet. Landningssidan visar inget räkneexempel förrän ett inköpspris är avtalat. Fram till dess står det bara "ni sätter kundpriset".
6. **Demobutiker.** *Rekommendation:* bygg dem i förväg per våg. Spärra kassan tills butiken är övertagen. Lova inte egen domän i mejlet.
7. **Domän och inkorg.** *Rekommendation:* `mail.namnskylt.com`, `reply_to` till den signerande personens riktiga låda, och samma låda för DMARC-rapporter (`rua`). Ange vem som har DNS för `namnskylt.com`.
8. **Text på skylten.** *Rekommendation:* kontaktpersonens namn på rad 1 och företaget på rad 2. Ser fältet inte ut som ett namn graveras bara företaget. "Anna Lindqvist" används inte.

## 9. Måste vara sant innan första skarpa mejlet (utanför allowlist)

- [ ] Beslut 1, 2 och 7 är tagna. Intresseavvägningen är ifylld, daterad och namngiven.
- [ ] Företagsprofilen har juridiskt namn, org.nr, postadress, telefon och e-post. `outreachBlockers` ger inga avsändarskäl.
- [ ] `/integritet` och `/avregistrera/[token]` är deployade. One-Click-POST är provad mot produktion.
- [ ] `mail.namnskylt.com` är Verified i eu-west-1, DMARC `p=none` finns, tracking är av och biträdesavtalet med Resend är godkänt.
- [ ] Webhooken är provad: fel signatur ger 401, en testbounce spärrar, och `RESEND_WEBHOOK_SECRET` är satt.
- [ ] `supplierApiConfigured()` är sann i produktion och en testorder har gått till Skylt & Gravyrteknik på riktigt.
- [ ] Skylt & Gravyrteknik har bekräftat leveranstiden, annars nämns ingen tid. Mallar och FAQ i `src/lib/shops/page-templates.ts` lovar inget som orderflödet inte gör (korrektur före gravyr, fem dagar, "graveras i Sverige" för alla material).
- [ ] Kassan i ägarlösa outreach-butiker är spärrad och e-postadressen är låst till inbjudan.
- [ ] Varje lead i våg A har förhandsgranskats i admin: rätt logga, rätt namn, rätt butik och `logo_status`.
- [ ] Vecka 0 är grön (avsnitt 7). `outreach_control` står på `paused`/`dry_run` tills ägaren byter.
- [ ] `OUTREACH_DISABLED=true` är provat och stoppar före nästa claim.
- [ ] Kundlistan ligger bara i iCloud. `tmp/` och utboxen är gitignorerade och inga personuppgifter syns i loggarna.

## 10. Risker

| # | Risk | Motåtgärd |
|---|---|---|
| 1 | Mock eller dry-run räknas som skickat, eller tvärtom tyst mock i drift | `isRealEmailSend` är enda vägen till `sent`. Dry-run ändrar ingen status. `live` kräver nyckel och verifierad domän. Allt är låst i test |
| 2 | Den nya domänen bränns | Uppvärmningstabellen, de kända kunderna först, en paus vid första klagomålet, ingen tracking-domän och en underdomän skild från apex |
| 3 | En återförsäljare säljer och ordern blir en tyst mock | `outreachBlockers` vägrar `live` när `supplierApiConfigured()` är falsk. Kontrollen finns i checklistan |
| 4 | Överlöften om leveranstid, material, betalning eller domän | `FORBIDDEN_PHRASES` med test, bara material med `skylt-gravyr` i bilder och rutor, och demobutikens texter granskade |
| 5 | Fel varumärke, eftersom `Hemsida` pekar på en United Profile-butik | Mejldomänen först. Hjälten förhandsgranskas per lead innan godkännande. Skalbutik och `text-only` som reserv |
| 6 | Länkskannrar (Safe Links med flera) blåser upp tratten eller triggar arbete | Förbyggda butiker och `BOT_UA`-filter. Avregistrering sker bara via POST (formulär eller One-Click), aldrig via GET. Purpose i tokenet gör att en landningslänk aldrig kan avregistrera |
| 7 | Juridiken bygger på fel bolag eller fel land | Beslut 1–3 blockerar. Våg `NO` är spärrad i `outreachBlockers` tills den låses upp |
| 8 | Dubbelutskick vid krasch eller två tick | Advisory lock, `SKIP LOCKED`, unik `(campaign, lead, step)`, `Idempotency-Key` och `needs_review` efter 24 h i `sending`. Ingen automatisk omsändning |
