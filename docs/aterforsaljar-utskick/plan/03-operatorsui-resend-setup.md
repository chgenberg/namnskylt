# 03 — Operatörsgränssnitt och Resend-uppsättning

## 1. Sammanfattning

Operatören (bara ägaren, `isOwner` / tenanten `namnskylt`) granskar en kampanj, öppnar varje mottagare, ser det färdiga mejlet, rättar texten, godkänner och skickar först efter en bekräftelse. Inget lämnar huset förrän `RESEND_API_KEY` är satt och `OUTREACH_DRY_RUN` inte är `true`.

Roots gör samma grind i `/portal/lead-mejl`, men där är mejl påslaget om inte `FEATURE_EMAIL_DISABLED=true`, och en saknad nyckel fäller prod-boot. Namnskylt följer i stället mönstret i `.env.example` och `src/lib/supplier/client.ts`: tomt värde betyder mock, och appen startar ändå.

Domän, DNS och webhook skapas när kontot finns, via `scripts/setup-resend.ts` plus några klick i Resend som skriptet inte kan göra. Fram till dess byggs hela vyn mot mock.

## 2. Vad vi återanvänder från Roots

Operatörsflödet sitter i `apps/web/src/app/(portal)/portal/lead-mejl/`. Sidan är en klientvy mot `/v1/outreach/*`. Det som ska överleva, med andra namn:

| Roots | Beteende att behålla | Ändras till |
| --- | --- | --- |
| `page.tsx` | Filter, sök (250 ms), kryssrutor, KPI, bekräftelse, sedan en loop som anropar send tills `more` är falskt (max 20 varv) | En kampanj, inte flera säljare. Svenska statusar. Knappen av när läget inte är `live`. |
| `LeadDrawer.tsx` | `GET …/preview` → iframe `srcDoc` med `sandbox=""`. Redigera bara i `draft` / `approved` / `failed`. Spara override, eller återställ mallen. Godkänn en rad. Gör om godkänd till utkast. Anteckning på blur. | Mottagare i stället för förening. Förhandsvisningen är `buildShopEmail`, med dator / mobil / text som i `ShopEmailPreview`. |
| `SenderForm.tsx` | Mall + dagstak på avsändaren. Platshållare visas som koder. | En mall per kampanj. Inget säljarkonto, ingen telefon. Dagstak default 20, max 200. |
| `ImportDialog.tsx` | Förhandsgranskning innan något sparas. Dubblett uppdaterar, skickad rad rörs inte. | Tunn CSV (`namn,epost,webbplats,butik`). Excel-mappningen väntar på leadplanens filformat. |
| `types.ts` | Status `draft → approved → sending → sent / failed`. Bara `draft` och `failed` utan `missing` går att kryssa i. | Lägg till `delivered`, `bounced`, `complained`, `simulated`. Ta bort `meeting`. `replied` och `declined` blir manuella märken efter utskick. |

Sändningen i `apps/api/src/routes/outreach.ts` (`emailEnabled`, `claimNextApproved`, `POST /senders/:id/send`):

- `emailEnabled()` är `RESEND_API_KEY` satt och `FEATURE_EMAIL_DISABLED` inte `true`. Annars 409 `EMAIL_PAUSED` och knappen är av. Granskning och godkännande fungerar ändå. Bannern säger det.
- Varje anrop tar högst `SEND_BATCH` (12) inom `SEND_BUDGET_MS` (15 s), 600 ms mellan mejl, och stoppar vid `dailyCap` (default 40, Stockholm-dygn).
- Raden låses till `sending` innan anropet. Bara `isRealEmailSend` (success och inte `mocked`) sätter `sent` + `providerId`. Mock blir `failed` med texten "Mejl är pausade", så en övning inte ser ut som ett riktigt utskick.
- En rad som fastnat i `sending` längre än 10 minuter blir `failed` och skickas inte om av sig själv.

Resend i Roots, att inte kopiera rakt av:

- `scripts/setup-resend.py` läser `~/.roots/resend_key`, skapar `roots.nu` i `eu-west-1`, skriver DNS i Cloudflare, pollar verify, och `--railway` sätter `RESEND_API_KEY`, `RESEND_FROM_ADDRESS=Roots <hej@roots.nu>` och `FEATURE_EMAIL_DISABLED=false`. Idempotent. Nyckeln skrivs aldrig ut.
- `.env.example` och `validate-env.ts`: `RESEND_API_KEY` krävs i prod om mejl inte är explicit av. `RESEND_FROM_ADDRESS` är valfri. Testet i `validate-env.test.ts` låser båda fallen. Det finns ingen `RESEND_WEBHOOK_SECRET`.
- `docs/runbooks/deploy.md`: före deploy, kolla att domänen fortfarande är `verified`. Roterade `RESEND_*` uppdateras i drift, verifieras, och den gamla nyckeln dras tillbaka först därefter.
- `apps/api/src/lib/email/index.ts`: nyckel → `ResendEmailSender` mot `POST https://api.resend.com/emails` (15 s timeout). Saknad nyckel i dev → `MockEmailSender`. `from` på meddelandet vinner över kontots default. Avsändaradressen måste sluta på domänen i `RESEND_FROM_ADDRESS` (`sendingDomain()`).

## 3. Förslag för Namnskylt

### Vyn

Ägar-only, samma grind som `src/app/admin/butiker/page.tsx`: `adminTenant()` och `isOwner`, annars `null`. API svarar 401 som `src/app/api/admin/shops/[slug]/email/route.ts`.

`src/components/dashboard/dashboard.module.css` används av produktionskön (`src/features/production/`), med egen inloggning. Utskicket hör hemma i admin. Sidhuvud, KPI och paneler tar klasserna `pageHead`, `pageTitle`, `kpis`, `panel` ur `src/features/admin/admin.module.css`. Tabell, låda och bekräftelse ligger i `src/features/outreach/outreach.module.css` och använder bara tokens. Förhandsvisningen återanvänder mönstret i `ShopEmailPreview` (dialog, från/till/ämne, iframe, dator/mobil/text), men med `sandbox=""` så mejlet inte kan köra skript.

Nav i `src/features/admin/admin-shell.tsx`: `{ href: "/admin/utskick", label: "Utskick", ownerOnly: true }`. Badge = antal rader i `approved`.

Sidor, tunna serverkomponenter:

- `src/app/admin/utskick/page.tsx` — kampanjer: namn, antal utkast / godkända / skickade, läge (`mock` / `dry-run` / `live`).
- `src/app/admin/utskick/[campaignId]/page.tsx` — mottagarlista.

Klientlöv i `src/features/outreach/`:

- `recipient-table.tsx` — filter, sök, kryssrutor, "Godkänn valda".
- `recipient-drawer.tsx` — preview, redigera override, godkänn, återställ mall, anteckning.
- `send-bar.tsx` — räknare "skickade i dag / tak", bekräftelse med avsändaradressen, sedan loopen.
- `import-csv.tsx` — rubrikrad `namn,epost,webbplats,butik`.

### Flöde

1. Operatören öppnar kampanjen. Saknas mottagare visas tomt tillstånd, ingen sändningsknapp.
2. Rad öppnas. `GET /api/admin/outreach/recipients/[id]/preview` returnerar `{ from, to, replyTo, subject, html, text, missing }`. `from` är `RESEND_FROM` (eller "Namnskylt \<mock@namnskylt.test\>" i mock). `replyTo` är e-posten i `getCompanyProfile`. Saknas den: samma ledtext som butiksmejlet, "Ställ in e-post under Inställningar".
3. `missing` (ogiltig e-post, tomt namn, tom mall) blockerar godkännande, i listan och i lådan.
4. Text som bara gäller en mottagare sparas som `subjectOverride` / `bodyOverride`. "Använd kampanjens mall igen" nollar dem. Kampanjmallen ändras på kampanjsidan och rör inte rader som redan har override.
5. Godkänn en eller många: `POST /api/admin/outreach/approve` med `{ ids }`. Svar `{ approved, skipped }`. Bara `draft` och `failed` utan `missing`.
6. "Skicka godkända (N)" kräver läge `live`, minst en godkänd rad och kvarvarande dagsutrymme. Bekräftelsen visar antal och `Från`. `POST /api/admin/outreach/campaigns/[id]/send` gör en batch och returnerar `{ sent, failed, more, capReached }`. Klienten loopar, som Roots. `maxDuration` sätts på routen.
7. Efter utskick kan operatören märka raden `replied` eller `declined`. Webhooken får sätta `delivered` / `bounced` / `complained`. En människa skickar inte om en `sending`-rad.

I mock och dry-run är sändningsknappen av. En separat "Öva utskick" får finnas: den anropar samma route, mock-sändaren returnerar `mocked: true`, och raden blir `simulated` — aldrig `sent`. Övningen kan nollställas till `draft`.

### API

Alla under `src/app/api/admin/outreach/`, `runtime = "nodejs"`, zod på kroppen, `currentTenant` + `isOwner`.

- `GET/POST /campaigns`, `PATCH /campaigns/[id]` (namn, ämne, brödtext, `dailyCap`)
- `GET /campaigns/[id]/recipients?status&q`
- `PATCH /recipients/[id]`, `DELETE` bara om inte skickad
- `GET /recipients/[id]/preview`
- `POST /approve`
- `POST /campaigns/[id]/send`
- `GET /mode` → `{ mode, from }` så bannern inte gissar

`POST /api/outreach/resend` är webhooken (ingen admin-cookie). Tom `RESEND_WEBHOOK_SECRET` → 503, samma som `src/app/api/supplier/webhook/route.ts`. Signatur: Svix-huvudena `svix-id`, `svix-timestamp`, `svix-signature`. Ogiltig signatur → 401. Själva statusskrivningen beror på datamodellen; routen ska finnas så hemligheten kan provas.

### Miljö

Namnskylt har ingen `validate-env.ts` och ska inte få en boot-spärr för det här. Ren funktion `emailMode(env)` i `src/lib/email/mode.ts`, test `src/lib/email/mode.test.ts`:

| Villkor | Läge |
| --- | --- |
| `RESEND_API_KEY` tom | `mock` |
| nyckel satt och `OUTREACH_DRY_RUN=true` | `dry-run` (anropa inte Resend) |
| nyckel satt och dry-run tom / `false` | `live` |

`getEmailSender()` i `src/lib/email/index.ts` väljer mock eller `ResendEmailSender`. Mock returnerar `{ success: true, mocked: true }` och loggar mottagare och ämne, aldrig HTML. `isRealEmailSend` är `success && !mocked && !dryRun`.

I `.env.example`, bredvid leverantörsnycklarna:

```
# Resend. Tom RESEND_API_KEY = mock, inget mejl lämnar servern.
RESEND_API_KEY=
# Visningsnamn och adress på den verifierade domänen.
RESEND_FROM=Namnskylt <hej@utskick.namnskylt.com>
# Svix-hemlighet för POST /api/outreach/resend. Tomt = webhooken svarar 503.
RESEND_WEBHOOK_SECRET=
# true = nyckeln används inte. Tomt = riktigt utskick när nyckeln finns.
OUTREACH_DRY_RUN=
```

`RESEND_FROM` motsvarar Roots `RESEND_FROM_ADDRESS`. `OUTREACH_DRY_RUN` motsvarar pausen, men bara för utskicket — det finns inga andra transaktionsmejl att slå av. Prod bootar med tom nyckel.

### `scripts/setup-resend.ts`

Körs med `pnpm resend:setup` → `tsx --env-file-if-exists=.env.local scripts/setup-resend.ts`. Typescript, som `scripts/db-migrate.ts`. Inte Python.

- Läser `~/.namnskylt/resend_key` (en rad, full-access). Saknas filen: avsluta med sökvägen, inga anrop. Skriv aldrig ut nyckeln.
- `GET https://api.resend.com/domains`. Finns domänen, återanvänd den. Annars `POST` med `{ name, region: "eu-west-1" }`. Regionen kan inte bytas efteråt.
- Skriv ut DNS-posterna Resend svarar med, plus ett förslag på DMARC: `TXT _dmarc` = `v=DMARC1; p=none; rua=mailto:<reply-to>`.
- Skriv inte DNS själv. Cloudflare-grenen i Roots (`~/.roots/cloudflare_token`) kopieras inte förrän DNS-värden är känd.
- `POST /domains/:id/verify`, polla status var 15:e sekund, högst 40 gånger. `verified` → klart. `failed` → avsluta med "kolla posterna". Annars: kör igen om en stund.
- Sätter inga driftvariabler. Avslutar med de fyra namnen som ska in i miljön, utan värden. Nyckeln i appen ska vara en **Sending access**-nyckel, inte setup-nyckeln.
- Flaggor: `--domain utskick.namnskylt.com` (krävs), `--from "Namnskylt <hej@utskick.namnskylt.com>"`.

### Steg i Resend-dashboarden

Skriptet skapar domänen. Det här kan bara en människa göra:

1. Skapa konto på https://resend.com/signup och bekräfta mejlet.
2. **API Keys → Create API Key.** Namn `namnskylt-setup`. Behörighet **Full access** (Sending access får inte skapa domän). Kopiera `re_…` direkt — den visas en gång — och lägg den i `~/.namnskylt/resend_key`.
3. Kör `pnpm resend:setup --domain <beslutad domän>`. Skriptet skapar domänen i **eu-west-1** eller återanvänder den.
4. **Domains → domänen.** Kopiera posterna exakt som de står (värdena är unika; gissa inte). Roots verifierade uppsättning hade den här formen: TXT `resend._domainkey` (DKIM), MX `send` mot `feedback-smtp.eu-west-1.amazonses.com` prioritet 10, TXT `send` med SPF `v=spf1 include:amazonses.com ~all`, och CNAME `rsend` om klickspårning är på. Lägg dessutom TXT `_dmarc` om skriptet skrev ut den.
5. Lägg posterna hos den som äger DNS för namnskylt.com. Står zonen i Cloudflare: proxyn av (grå moln). MX och TXT får inte proxas.
6. Tillbaka på domänsidan: **Verify DNS Records.** Vänta tills status är **Verified**. Pending: vänta och verifiera igen. Failed: jämför post för post.
7. **API Keys → Create API Key** igen. Namn `namnskylt-prod`, behörighet **Sending access**. Det är värdet som blir `RESEND_API_KEY` i drift. Setup-nyckeln stannar i `~/.namnskylt/`.
8. **Webhooks → Add Webhook.** URL `https://<produktionsvärd>/api/outreach/resend`. Händelser: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`. `email.opened` och `email.clicked` bara om spårning är beslutad. Kopiera signing secret (`whsec_…`, visas en gång) till `RESEND_WEBHOOK_SECRET`.
9. Sätt de fyra variablerna i driftmiljön. `OUTREACH_DRY_RUN=true` på den första deployen med nyckel. Skicka ett mejl till en egen adress, ta bort dry-run, kontrollera att domänen fortfarande är Verified.
10. Vid rotation: ny Sending-nyckel, uppdatera miljön, se att ett testmejl går fram, radera sedan den gamla nyckeln under API Keys. Samma ordning som Roots deploy-runbook.

Resend skapar ingen inkorg. Svar måste landa på en riktig adress (`replyTo` från Inställningar). En adress på den verifierade domänen behöver inte skapas i dashboarden.

## 4. Före Resend-kontot

Allt i avsnitt 3 utom dashboardstegen och anropen inuti setup-skriptet. Skriptet ska kunna köras och avsluta på saknad nyckelfil. Vyn, godkännande, förhandsvisning och "Öva utskick" körs mot mock med tom `.env.local`. Inget konto, ingen domän, ingen nyckel i repot.

## 5. Beslut som användaren måste ta

1. **Avsändardomän.** Förslag: `utskick.namnskylt.com`, inte apex. Ett kallmejlsrykte ska inte dela domän med butiken. Reply-To måste vara en inkorg som tar emot svar, till exempel adressen i Inställningar.
2. **Var DNS sköts.** Utan det skriver skriptet bara ut poster. Cloudflare-skrivning byggs bara om zonen faktiskt ligger där.
3. **Var driftvariablerna sätts** (tjänstens namn). Skriptet skriver inte dit förrän det är sagt.
4. **Öppning och klick.** Av från start (ingen `rsend`-CNAME, inga öppningspixlar). På kräver ett eget beslut.
5. **Dagstak.** Förslag 20 godkända mejl per Stockholm-dygn och kampanj, tills första riktiga sändningen är gjord.

## 6. Risker

- **Mock som ser ut som skickat.** `sent` sätts bara av `isRealEmailSend`. Övriga lägen ger `simulated` eller `failed`. Test som låser det.
- **Full-access-nyckel i prod.** Appen får bara Sending access. Setup-nyckeln ligger i `~/.namnskylt/`, chmod 600, aldrig i git eller logg.
- **Apex-domänens rykte** om beslut 1 blir `namnskylt.com`. Då blandas utskicket med framtida ordermejl.
- **Proxade DNS-poster** gör att Verify stannar på Failed. MX/TXT ska vara DNS-only.
- **Webhook utan hemlighet** svarar 503 och Resend slutar leverera händelser. Sätt hemligheten innan endpointen sparas, eller spara endpointen först när routen är ute.
- **Dubbelklick på Skicka.** Bekräftelse plus att sändningen claimar raden innan anropet (datamodellens ansvar, samma `skip locked` som Roots).
- **Regionfel.** `eu-west-1` väljs vid skapandet. Fel region kräver en ny domän i Resend.

## 7. Beroenden

- **Datamodell (kampanj, mottagare, status, override, dagsräknare).** Listan, godkännandet och claim-före-send är oanvändbara utan den. Statusnamnen ovan är kontraktet den planen ska träffa.
- **Mejlmall.** Förhandsvisningen anropar befintliga `buildShopEmail` i `src/lib/outreach/shop-email.ts`. Saknas butik för en rad behöver mallen en enklare variant; det äger mallplanen.
- **Leadlista.** CSV-importen är en nödväg. Den riktiga mottagarlistan kommer från leadplanen och ska landa som rader i `draft`.
- **Sändningskö.** Den här planen äger knappen och batch-svaret. Tak, claim och 600 ms-mellanrum äger sändningsplanen, med Roots `SEND_BATCH` / `SEND_BUDGET_MS` som förebild.
- **Webhook → status.** Routen och hemligheten ligger här. Vilken händelse som skriver `bounced` mot vilken rad ligger hos datamodellen.
- **Drift.** Variabelnamnen är låsta här. Vem som klistrar in dem i miljön väntar på beslut 3.
