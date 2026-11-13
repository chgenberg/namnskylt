# 16 — Test, kvalitetssäkring och utrullning

## 1. Sammanfattning

All ny logik i `src/lib/outreach/` testas med `node:test` via tsx, samma grind som resten av Namnskylt: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. `pnpm test` är redan `tsx --test src/engine/*.test.ts src/lib/**/*.test.ts`, så filer måste heta `src/lib/**/*.test.ts` och använda `node:assert/strict` — inte Vitest.

Inget anrop till Resend får finnas förrän ett eget steg säger det. Mock-sändaren skriver HTML och metadata till disk (och en utbox-rad om `DATABASE_URL` finns) och returnerar `mocked: true`. `isRealEmailSend` är den enda grinden som får sätta status `sent`.

Förhandsvisning sker först med `scripts/preview-outreach.ts` (HTML + `.eml`). Admin-sidan `/admin/utskick/forhandsvisning` är ett tunt skal för ägaren, utan skickaknapp. Utrullningen är fyra steg med env-spärr: intern mock → egna inkorgar → 10 vänliga → 50 → hela listan. Varje steg har mätbara stopp.

## 2. Vad vi återanvänder från Roots

Kopiera beteendet, byt Vitest mot `node:test` och Drizzle mot `postgres`.

| Roots | Beteende att behålla | Ändring i Namnskylt |
|---|---|---|
| `apps/api/src/lib/email/is-real-email-send.test.ts`, `isRealEmailSend` i `email/index.ts` | `success && !mocked`. Saknad rad, `success: false` och mock är inte ett utskick. | `src/lib/outreach/sender.ts`. Prod utan `RESEND_API_KEY` kastar, utom när `FEATURE_EMAIL_DISABLED=true`. |
| `apps/api/src/lib/email/mock-sender.ts` | `EmailSender`, id `mock_…`, `mocked: true`. | Skriv även filer under `tmp/outreach-outbox/`. Roots mock håller bara en array i minnet och loggar. |
| `apps/api/src/lib/email/types.ts` | `EmailMessage`, `SendEmailResult`, `EmailSender`. | Lägg till `headers` (List-Unsubscribe) och `tags` om mallen behöver dem. |
| `apps/api/src/routes/outreach.ts` | `claimNextApproved` med `FOR UPDATE SKIP LOCKED`. `sending` äldre än 10 min → `failed`, aldrig omskick. `SEND_BATCH = 12`, `SEND_BUDGET_MS = 15_000`, 600 ms mellan utskick. `dailyCap` default 40. `sentToday` räknas från midnatt `Europe/Stockholm`. Mock → `failed` med ”Mejl är pausade”, inte `sent`. | Ren funktion `assertCanSend` + SQL i repository. Konstantnamn: `OUTREACH_SEND_BATCH`, `OUTREACH_SEND_GAP_MS`, `OUTREACH_SEND_BUDGET_MS`, `OUTREACH_SENDING_STALE_MS`. |
| `apps/api/src/routes/outreach-claim.integration.test.ts` | Åtta samtidiga claim mot fem `approved` ger fem unika id och sedan `null`. Hoppas över utan `DATABASE_URL`. | `src/lib/outreach/claim.integration.test.ts`. Städa rader med avsändare `claim-test@namnskylt.invalid`. `describe(namn, { skip: !process.env.DATABASE_URL }, …)`. |
| `apps/api/src/lib/outreach/template.test.ts` | Saknade fält stoppar mejlet (`missing`). HTML får inte innehålla rå `<script>`. | Utöka befintliga `src/lib/outreach/shop-email.test.ts` om utskicket fortsätter på `buildShopEmail`. Annars `render.test.ts` och behåll den gamla filen som regression. |
| `apps/api/src/lib/email/resend-sender.ts` | `fetch` mot `https://api.resend.com/emails`, 15 s timeout, felkropp trunkerad till 200 tecken. | Injicera `fetch` i testet. Ingen riktig HTTP i `pnpm test`. |

Roots har ingen suppressionslista och ingen Resend-webhook. De testas ändå här. Signaturmönstret tas från Namnskylt `src/lib/supplier/status.ts` (`signWebhook` / `verifyWebhookSignature`, test i `status.test.ts`): rätt signatur, fel nyckel, ändrad kropp, för gammal tid, saknad header. Resend/Svix är ett annat format (`svix-id.svix-timestamp.body`, hemlighet `whsec_`). Återanvänd inte `verifyWebhookSignature` rakt av. Ett test ska visa att en leverantörs-header inte godkänns som Resend-header.

## 3. Förslag för Namnskylt

### Enhetstester

Gemensam fixtur: butik `Profil & <Co>` som i `shop-email.test.ts`, plus `javascript:`-länk, citattecken i namn, tomt telefonnummer och 80 tecken långt namn. Klocka och hemligheter injiceras. Mönster för env: `withEnv` i `src/lib/auth/signed-pass.test.ts`.

| Fil | Funktioner | Fall som måste faila bygget |
|---|---|---|
| `src/lib/outreach/render.test.ts` (eller utökad `shop-email.test.ts`) | `buildShopEmail` / `renderOutreachEmail` | Ämne oförändrat (`Profil & <Co>`, inte `&amp;`). HTML: `Hej Profil &amp; &lt;Co&gt;!`, inget rått `<Co>` eller `<script>`. Attribut `href` och `alt` escapar `"`. Textversion utan HTML-taggar och med samma avregistrerings-URL. `missing` när namn, butiks-URL eller avregistrerings-URL saknas. Ingen `src="data:"`. `v:roundrect` och `prefers-color-scheme:dark` finns kvar. UTM `utm_campaign=demobutik` och `utm_content=<slug>-knapp`. |
| `src/lib/outreach/token.test.ts` | `signOutreachToken`, `verifyOutreachToken` i `token.ts` | HMAC-SHA256, syfte i payload (`unsubscribe` ≠ `shop`). Fel `OUTREACH_UNSUBSCRIBE_SECRET`, utgången `exp`, ändrad payload och för kort signatur ger `false`. Två butiker ger olika token. Jämförelse längdskyddad (`timingSafeEqual`), som `src/lib/reseller-auth/session.ts`. |
| `src/lib/outreach/suppression.test.ts` | `normalizeOutreachEmail`, `suppressionReason`, `assertCanSend` | Trim och gemener. `Bounce@Firma.se` = `bounce@firma.se`. Skäl `unsubscribe`, `bounce`, `complaint`, `manual` blockerar alla. Okänd adress släpps. Upprepad avregistrering är idempotent. Complaint blockerar även om raden redan är `approved`. |
| `src/lib/outreach/status.test.ts` | `outreachTransition(from, event)` | Tillåtna: `draft→approved`, `approved→sending`, `sending→sent` bara vid `isRealEmailSend`, `sending→failed` vid mock, fel eller `missing`. Förbjudna: `sent→sending`, `failed→sent` utan ny `approved`, `draft→sent`. `sending` äldre än `OUTREACH_SENDING_STALE_MS` blir `failed` med texten att en människa måste kolla om mejlet gick — inte en ny claim. |
| `src/lib/outreach/rate-limit.test.ts` | `stockholmDayStart`, `remainingToday`, `nextBatchSize` | 2026-11-10 23:30 UTC är redan 2026-11-11 i Stockholm (CET). Tak 40, 40 skickade → `remainingToday = 0`, `capReached`. Batch = `min(12, remaining)`. Gap 600 ms och budget 15 s är exporterade konstanter. |
| `src/lib/outreach/webhook.test.ts` | `verifyResendWebhook`, `applyOutreachEvent` | Tolerans 300 s. Fel `RESEND_WEBHOOK_SECRET`, ändrad kropp, återspelning och saknade `svix-*` avvisas. `email.delivered` sätter `delivered` en gång. `email.bounced` och `email.complained` lägger suppression och räknas inte dubbelt. Okänd `providerId` ignoreras. |
| `src/lib/outreach/sender.test.ts` | `getOutreachSender`, `isRealEmailSend`, `MockOutreachSender` | Tabellen från Roots test plus: prod utan nyckel kastar; `FEATURE_EMAIL_DISABLED=true` ger mock även om nyckel finns; `OUTREACH_ROLLOUT=off` skickar inget; `internal` vägrar adress utanför `OUTREACH_ALLOWLIST`. |
| `src/lib/outreach/claim.integration.test.ts` | `claimNextApproved` | Som Roots. Körs bara när `DATABASE_URL` är satt. Får inte fälla `pnpm test` i en miljö utan databas. |

`assertCanSend(lead, ctx)` är den enda porten ut. Den tar suppression, dagens antal, tak, `OUTREACH_ROLLOUT`, allowlist och `FEATURE_EMAIL_DISABLED`, och returnerar ett skäl (`ok`, `paused`, `suppressed`, `cap`, `allowlist`, `wave`, `missing`). Både test och utskick anropar den.

Föreslagna tabeller (ägs av datamodell-planen, kontraktet testas här): `outreach_leads` (`status`, `sent_at`, `provider_id`, `last_error`, `wave`), `outreach_suppressions` (`email` unik, `reason`, `created_at`), `outreach_events` (`provider_id`, `type`, unik på `svix-id`).

### Förhandsvisning

`scripts/preview-outreach.ts`, körs med `pnpm exec tsx scripts/preview-outreach.ts`. Ingen databas och ingen nätverksåtkomst. Läser fixturer från `src/lib/outreach/preview-fixtures.ts` (samma som testerna) och skriver:

- `tmp/outreach-preview/index.html` — lista med ämne och länk
- `tmp/outreach-preview/<slug>.html`
- `tmp/outreach-preview/<slug>.eml` med `Subject`, `From`, `To: preview@namnskylt.invalid`, `text/plain` och `text/html`

`.eml` öppnas i Apple Mail och Outlook utan Resend. Katalogen gitignoreras. Skriptet loggar antal filer och avslutar med kod 1 om `missing` inte är tom.

`src/app/admin/utskick/forhandsvisning/page.tsx` är en serverkomponent bakom befintlig admin-layout (`RESELLER_PASSWORD`, `robots: noindex`). Bara `isOwner` (`src/lib/tenants/model.ts`). Query `?slug=`. Iframe med HTML från samma render-funktion. Ingen knapp som anropar sändaren.

### Mock-sändare

`src/lib/outreach/mock-sender.ts` implementerar `EmailSender`.

- Skriver `tmp/outreach-outbox/<iso>-<id>.json` och `.html`. JSON innehåller `to`, `subject`, `mocked: true`, inte API-nycklar.
- Om `DATABASE_URL` finns: rad i `outreach_outbox` med `mocked = true`. Aldrig `outreach_leads.status = sent`.
- Retur: `{ success: true, id: "mock_<uuid>", mocked: true }`.
- `OUTREACH_OUTBOX_DIR` default `tmp/outreach-outbox`.

`getOutreachSender()`:

1. `FEATURE_EMAIL_DISABLED=true` → mock, varning i loggen.
2. `NODE_ENV=production` och saknad `RESEND_API_KEY` → kast.
3. Nyckel finns och `OUTREACH_ROLLOUT` är inte `off` → `ResendOutreachSender`.
4. Annars mock.

### Inkorgar och mail-tester.com

Det här är en manuell checklista i steg 1, inte ett enhetstest. Gmail, Outlook på webben och iOS kräver ett riktigt utskick. Före Resend räcker `.eml` i Apple Mail och Outlook desktop, plus att enhetstesterna låser VML, mörkt läge och bild-URL:er.

| Klient | Vad som ska synas |
|---|---|
| Gmail (webb) | Bilden laddas via https, inte data-URI. Knappen går att klicka. Ämnet klipps inte mitt i butiksnamnet. |
| Outlook (webb eller desktop) | VML-knappen har butikens färg och rätt höjd. Inget extra radavstånd som spräcker kortet. |
| Apple Mail (macOS) | Mörkt läge byter bakgrund utan att texten blir mörk på mörkt. |
| iOS Mail | 600 px-mallen blir en kolumn. Knappen är minst 44 px hög. Avregistrering syns utan att zooma. |

Ett utskick till mail-tester.com (deras tillfälliga seed-adress, inte en rad i leadlistan). Krav innan steg 2: poäng minst 9/10, SPF, DKIM och DMARC pass, `List-Unsubscribe` och textversion närvarande. Seed-adressen raderas efteråt. Under 8 är stopp. 8 till 8,9 är stopp tills ämne, från-namn eller länkdomän är ändrad och testet körts om.

### Utrullning

Spärren är `OUTREACH_ROLLOUT=off|internal|friendly10|fifty|all` (default `off`) plus `FEATURE_EMAIL_DISABLED`. Allowlist är obligatorisk i `internal`. `friendly10` och `fifty` får bara rader med `wave` satt av en människa. `all` lyder fortfarande `dailyCap` och suppression. En människa godkänner rader (`approved`) och trycker skicka, som i Roots. Inget steg körs om grinden är röd.

| Steg | Env | Gå | Stopp |
|---|---|---|---|
| 0. Intern, mock | `off` eller `FEATURE_EMAIL_DISABLED=true`. Ingen nyckel krävs. | Grinden grön. Förhandsvisning läst. Outbox-filer har `mocked: true` och noll anrop till `api.resend.com`. | Oescaperad HTML, saknad avregistrering, data-URI, eller ett test som sätter `sent` på mock. |
| 1. Egna inkorgar | `internal`. `OUTREACH_ALLOWLIST` = de fyra klienternas adresser. | mail-tester ≥ 9. SPF/DKIM/DMARC pass. Alla fyra klienter: bild, knapp, mörkt läge, inte i skräppost. Avregistrering skapar suppression och nästa `assertCanSend` är `suppressed`. Webhook med fel signatur ger 401. Bounce på en testadress suppressar. | Poäng under 9, DKIM-fel, skräppost i någon klient, död Outlook-knapp, webhook som godtar fel signatur eller återspelning. |
| 2. Tio vänliga | `friendly10`. `dailyCap` 10. En våg. Vänta 7 dygn. | 10 `delivered`. 0 `complained`. Hård studs ≤ 1. Inga rader kvar i `sending` efter 10 min. Resend varnar inte om domänen. | En enda complaint, studs ≥ 3/10, domänvarning, eller svar som säger att mejlet upplevs som spam. |
| 3. Femtio | `fifty`, tidigast 7 dygn efter att steg 2 är grönt. Högst 25 per dygn i två dygn. | Complaint 0. Hård studs ≤ 1/50 (2 %). Varje studs finns i `outreach_suppressions` innan nästa dygn. | Complaint ≥ 1, studs över 2 %, deferrals som Resend flaggar, eller samma fel i klienterna som stoppade steg 1. |
| 4. Hela listan | `all`, tidigast 7 dygn efter steg 3. `dailyCap` 40, batch 12, 600 ms, som Roots. Höj taket bara om studs < 1 % och complaint är 0 under en vecka. | Samma tak som steg 3, räknat på rullande 7 dygn: complaint 0, studs ≤ 2 %. Kill switch provad en gång i mock: `FEATURE_EMAIL_DISABLED=true` stoppar före nästa claim. | Complaint > 0,1 % den dagen, studs > 2 %, eller att Resend pausar domänen. Sätt `OUTREACH_ROLLOUT=off` samma dag. Skicka inte om `sending`. |

## 4. Förberedelser före Resend-kontot

Allt i avsnitt 3 utom `ResendOutreachSender`s riktiga anrop, steg 1–4 och mail-tester.com.

- Testerna ovan, grinden grön, utan nätverk.
- `preview-outreach.ts`, fixturer och gitignore av `tmp/outreach-preview/` och `tmp/outreach-outbox/`.
- `MockOutreachSender`, `assertCanSend`, `outreachTransition`, `verifyResendWebhook` med fixturhemlighet `whsec_test`.
- `getOutreachSender` som kastar i prod utan nyckel.
- Manuell titt på `.eml` i Apple Mail och Outlook desktop.
- Integrationsstestet lokalt om `DATABASE_URL` redan finns. Det är inte ett krav för grinden.

`RESEND_API_KEY` ska inte sättas i `.env.local` under det här arbetet. En nyckel i dev gör att `getOutreachSender` lämnar mocken.

## 5. Beslut som användaren måste ta

1. Vilka fyra interna adresser som står i `OUTREACH_ALLOWLIST` (Gmail, Outlook, Apple Mail, iOS), och vem som läser dem i steg 1.
2. Vilka tio återförsäljare som är `wave=friendly10`, och att de redan har en relation till Namnskylt. Listan är ett mänskligt beslut, inte ett testutfall.
3. Tak i steg 4: 40 per dygn som Roots `dailyCap`, tills en vecka med studs under 1 % och noll complaints. Höjning kräver ett nytt beslut.
4. Om `/admin/utskick/forhandsvisning` ska byggas i samma svep som skriptet. Förslag: skriptet före Resend, admin-sidan när ägar-grinden i admin-planen är fast.
5. Egna hemligheter `OUTREACH_UNSUBSCRIBE_SECRET` och `RESEND_WEBHOOK_SECRET`. Inte `RESELLER_PASSWORD` och inte leverantörens webhook-hemlighet.

## 6. Risker och hur de hanteras

- Mock markerad som skickad, så mottagaren aldrig får mejlet och raden inte kan skickas om. `isRealEmailSend` och `sender.test.ts` låser att `mocked` ger `failed`, inte `sent`. Samma fälla som Roots stängde 2026-05-26.
- Tyst mock i prod när nyckeln saknas. `getOutreachSender` kastar. `FEATURE_EMAIL_DISABLED` är den enda avstängningen.
- Dubbel claim vid två klick. `FOR UPDATE SKIP LOCKED` och integrationsstestet. Fastnad `sending` skickas inte om.
- Webhook-återspelning eller fel format. Egen Svix-verifierare, tolerans 300 s, unik `svix-id` i `outreach_events`. Leverantörens `t=,v1=` godkänns inte.
- För snabb uppvärmning av en ny domän. Stegvis env, 7 dygn mellan 10, 50 och hela listan, tak 25/dygn i steg 3 och 40 i steg 4.
- Gmail strippar bilder som är data-URI. Redan låst i `shop-email.test.ts`. Riktig Gmail-koll sker först i steg 1.
- Förhandsvisning läcker hela listan till en återförsäljare som är inloggad i admin. Sidan kräver `isOwner`. Skriptet skriver bara till `tmp/`.
- Avregistreringstoken går att gissa och tysta andras adresser. Egen HMAC-hemlighet, syfte och `exp`, testat i `token.test.ts`.
- Juridik (samtycke, berättigat intresse, fysisk avsändaradress, avregistrering) avgörs i den planen. Utan avregistrerings-URL i både HTML och text är `missing` satt och utskick omöjligt.

## 7. Beroenden till andra planområden

Testplanen äger inga andras filer. Den låser kontrakten nedan. Numreringen är okänd här; kopplingen är på ämne.

- Mall och HTML — exakt funktionsnamn (`buildShopEmail` eller ny `renderOutreachEmail`) och vilka fält som ger `missing`. Utan det kan `render.test.ts` inte skrivas mot rätt API.
- Personalisering och escaping — butiksnamn, färger, logga. Fixturen `Profil & <Co>` ska fortsätta vara ett fall.
- Signerade länkar — om avregistrering återanvänder `signedPass` eller får `signOutreachToken`. Förslag här: egen hemlighet och eget syfte, samma HMAC-idé som `src/lib/auth/signed-pass.ts`.
- Suppression och avregistreringssida — tabellen `outreach_suppressions` och att klicket anropar samma `normalizeOutreachEmail`.
- Tillståndsmaskin och claim — statussträngarna och `claimNextApproved`. Tester importerar den funktionen, de skriver inte om den.
- Hastighetsgräns — `dailyCap` och Stockholm-dygn. Ingen Redis (Roots `checkRateLimit` hör inte hemma här; Namnskylt har ingen Redis).
- Webhook-route — `src/app/api/.../webhook/route.ts` ska anropa `verifyResendWebhook` innan JSON tolkas. Route-testet kan vänta; signaturen testas rent.
- Avsändare och env — `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `RESEND_WEBHOOK_SECRET`, `FEATURE_EMAIL_DISABLED`, `OUTREACH_ROLLOUT`, `OUTREACH_ALLOWLIST`, `OUTREACH_DAILY_CAP`, `OUTREACH_UNSUBSCRIBE_SECRET`, `OUTREACH_OUTBOX_DIR`.
- Admin — `isOwner` och layout. Förhandsvisningssidan länkas bara där.
- Leadlista — `wave` på raden (`internal`, `friendly10`, `fifty`, `all`) och vilka tio som är vänliga.
- Domän och DNS — SPF, DKIM, DMARC innan steg 1. mail-tester.com är meningslöst före det.
- Juridik — fysisk adress och avregistrering i mallen innan `OUTREACH_ROLLOUT` lämnar `off`.

Den här planen blockerar inte enhetstester, skript eller mock. Den blockerar steg 1 tills Resend-konto, domän och webhook-hemlighet finns, och steg 2 tills de tio namnen är valda.
