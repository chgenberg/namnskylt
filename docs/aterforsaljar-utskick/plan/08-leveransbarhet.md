# 08 — Leveransbarhet (Resend)

## 1. Sammanfattning

Publika sajten är `namnskylt.com`. Det står i `src/lib/shops/host.ts` (`SHOP_ROOT_DOMAIN`), `src/middleware.ts` (`SITE_HOSTS`, default `namnskylt.com,www.namnskylt.com,localhost`), `src/app/layout.tsx` och testet som behandlar `namnskylt-production.up.railway.app` som huvudvärd. `next.config.ts`, `Dockerfile` och `.env.example` nämner ingen mejldomän och ingen Resend-nyckel.

Kallmejl ska gå från `hej@mail.namnskylt.com`, inte från apex. `mail` finns redan i `RESERVED` i `host.ts`, så adressen blir aldrig en butik. Roots gör tvärtom: `Roots <hej@roots.nu>` på apex, med SPF/MX bara på underadressen `send`. Det skyddar inte avsändardomänens rykte.

Öppningspixel och klickspårning är av. Intresse mäts när mottagaren öppnar butikslänken (`link_open_count` i plan 06). De första fyra veckorna är volymen 8–40 mejl per vardag, inom svenska kontorstider, och ett enda klagomål pausar kampanjen.

## 2. Vad vi återanvänder från Roots

| Källa | Vad den gör | Vad vi ändrar |
|---|---|---|
| `apps/api/src/lib/email/resend-sender.ts` | `POST https://api.resend.com/emails`, 15 s `AbortController`, `from` / `html` / `text` / `reply_to`. Ingen spårningsflagga. | Samma anrop. Lägg till `headers`: `List-Unsubscribe` och `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Skicka aldrig öppnings- eller klickspårning. |
| `apps/api/src/lib/email/types.ts` | `text` är valfritt. | `text` krävs. Tom text är ett fel före anropet. |
| `apps/api/src/routes/outreach.ts` | `sendingDomain()` ur avsändaradressen. Dagstak mot midnatt `Europe/Stockholm`. `SEND_BATCH = 12`, `SEND_BUDGET_MS = 15_000`, 600 ms mellan mejl. | Domänen ska vara `mail.namnskylt.com`. 600 ms tömmer dagstaket på under en minut. Under uppvärmning är batchen 1 och nästa anrop tidigast efter 45 s. |
| `packages/db/src/schema/outreach.ts` | `daily_cap` default 40, tak 200 i zod. | Default följer uppvärmningsschemat. Koden släpper inte igenom mer än schemat de första 28 dagarna, oavsett vad operatören skriver. |
| `scripts/setup-resend.py` | Skapar `roots.nu` i `eu-west-1`, lägger in posterna Resend returnerar, plus `TXT _dmarc` = `v=DMARC1; p=none; rua=mailto:hej@roots.nu`. Idempotent. Nyckeln i `~/.roots/`, skrivs aldrig ut. | Plan 03 äger skriptet (`scripts/setup-resend.ts`, ingen Cloudflare-skrivning). Den här planen låser vilka poster som ska med och vilka som ska utelämnas. |
| `docs/runbooks/deploy.md` | Kollar att Resend-domänen är `verified` före deploy. Roterade `RESEND_*` byts först efter att den nya nyckeln bevisligen fungerar. | Samma ordning. Lägg till: DMARC-posten är fortfarande den avsedda (`p=none` tills steget nedan är taget), och `rsend`-CNAME saknas. |
| `apps/api/src/lib/rate-limit.ts` | Redis-tak för inloggning, registrering, AI. Kommentar: studsar höjer bounce-rate och flaggar Resend-domänen. | Används inte. Namnskylt har ingen Redis. Taket är `count(*)` på `outreach_messages.sent_at`. Frågan kastar: skicka inte (fail closed). |
| `lib/outreach/template.ts` | Riktig `text` och `html`, en förslagslänk, en integritetslänk, ingen bild. | Mönstret för text/html. Innehållet är `buildShopEmail`, som i dag är tyngre (avsnitt 3). |

Roots har ingen sändningsfönsterkod, ingen uppvärmningsramp, ingen Resend-webhook och ingen automatisk paus. `FEATURE_EMAIL_DISABLED` slår av all mejl i Roots. Namnskylt har inga transaktionsmejl; plan 03:s `OUTREACH_DRY_RUN` räcker.

DNS som Roots faktiskt verifierade 2026-11-02 (värdena är kontounika, kopiera från API-svaret, gissa inte nyckeln):

- DKIM: `resend._domainkey` (då TXT; nyare konto kan få CNAME — ta typen Resend ger).
- Return-path: MX `send` prioritet 10 mot `feedback-smtp.eu-west-1.amazonses.com`, plus TXT `send` = `v=spf1 include:amazonses.com ~all`.
- Klickspårning: CNAME `rsend`. Den lade de in. Vi gör inte det.
- DMARC lade skriptet dit själv. Resend skapar den inte.

## 3. Förslag för Namnskylt

### Domän

Verifiera `mail.namnskylt.com` i region `eu-west-1` (går inte att byta efteråt). Avsändare: `Namnskylt <hej@mail.namnskylt.com>`, eller kampanjens `from_name` med samma adress. `RESEND_FROM` (plan 03) måste sluta på `@mail.namnskylt.com`. En adress på `@namnskylt.com` får 4xx från Resend och blir `failed`, aldrig `sent`.

`hej.namnskylt.com` och plan 03:s `utskick.namnskylt.com` matchar `SHOP_SLUG`. Med en wildcard-post mot Railway blir de butiker. `mail` är reserverat och `resolveHost("a.b.namnskylt.com")` är redan `main`, så `send.mail.namnskylt.com` blir inte en butik. Lägg ett test i `src/lib/shops/host.test.ts`: `mail.namnskylt.com` → `{ kind: "main" }`.

Publicera ingen A/CNAME på `mail` mot appen. Apex-SPF (den dag en inkorg finns) ska inte innehålla `amazonses.com`. SES-include hör bara hemma på `send.mail`.

### Poster

På `mail.namnskylt.com`, DNS-only om zonen ligger i Cloudflare:

| Post | Namn | Innehåll |
|---|---|---|
| DKIM | det Resend returnerar | oförändrat från API:t |
| MX 10 | `send.mail.namnskylt.com` | `feedback-smtp.eu-west-1.amazonses.com` |
| TXT | `send.mail.namnskylt.com` | `v=spf1 include:amazonses.com ~all` |
| TXT | `_dmarc.mail.namnskylt.com` | se rampen nedan |

Inte: CNAME `rsend` eller någon annan tracking-värd. Inte MX på `mail.namnskylt.com` själv — den tar emot studsar via `send`, inte svar.

`Reply-To` är en riktig inkorg. `DEFAULT_COMPANY.email` i `src/lib/company/profile.ts` är tom. Roots sätter `replyTo` till samma adress som `From`, vilket fungerar för att `roots.nu` har Google Workspace-MX på apex. En svarsadress på `@mail.namnskylt.com` studsar. Skicka-rutten vägrar om `reply_to` är tom eller ligger på sändningsdomänen.

Apex, bara om `_dmarc.namnskylt.com` saknas (läs zonen först, skriv inte över en befintlig post):

`v=DMARC1; p=quarantine; sp=quarantine; adkim=s; aspf=s; rua=mailto:<samma inkorg>`

`adkim=s` på apex gör att en DKIM-signatur från `mail.namnskylt.com` inte godkänner ett förfalskat `From: @namnskylt.com`. På själva sändningsdomänen: `adkim=s` (Resend signerar exakt den verifierade domänen) och `aspf=r`. Strikt SPF faller, eftersom kuvertet är `@send.mail.namnskylt.com`. DMARC räcker med DKIM.

Ramp, bara på `_dmarc.mail`:

1. Vecka 0–2: `v=DMARC1; p=none; rua=mailto:<inkorg>; fo=1; adkim=s; aspf=r`
2. När minst 100 mejl gått och rapporterna visar DKIM-pass utan alignment-fel: `p=quarantine; pct=25` i 7 dagar, sedan `pct=100` i 7 dagar.
3. `p=reject` tidigast därefter, och bara om inget annat system skickar från samma underdomän.

`rua` måste vara en låda som tar emot post. En gmail-adress tar inte emot rapporter för någon annans domän. Tills apex har MX: följ studsar i Resend och i webhooken; lägg `rua` samma dag inkorgen finns.

### Spårning

Av, på domänen i Resend och i anropet. Apple Mail Privacy Protection hämtar bilder (inklusive pixlar) utan att en människa öppnat brevet. Samma sak gör Microsoft 365:s bildproxy. `email.opened` är inte ett mått. Klickspårning skriver om länkar till en Resend-värd, vilket är ett extra hopp och ett annat värdnamn än det mottagaren ser.

Webhooken (plan 03) prenumererar på `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`. Inte `email.opened`, inte `email.clicked`. Mått på intresse: `outreach_leads.link_open_count` när butikslänken öppnas.

### Takt

Modul `src/lib/outreach/deliverability.ts`, ren TS, test `deliverability.test.ts` (`node:test`). Den räknar Stockholm-dygn som Roots `startOfStockholmDay`. Första riktiga `sent_at` (inte mock, inte `simulated`) startar klockan. `daily_cap` i plan 06 får sänka taket, inte höja det under de första 28 dagarna.

Vardagar, `Europe/Stockholm`. Lördag, söndag och helgdagar (hårdkodad lista för innevarande och nästa år i modulen): 0.

| Vecka | Ti–to / dag | Må och fr / dag | Max / timme | Fönster |
|---|---|---|---|---|
| 1 | 8 | 4 | 4 | ti–to 08:30–15:30, må/fr 09:30–14:30 |
| 2 | 15 | 8 | 6 | samma |
| 3 | 25 | 12 | 8 | samma |
| 4 | 40 | 20 | 12 | samma |
| 5–6 | 60 | 30 | 15 | samma |
| därefter | 80 | 40 | 20 | samma |

Hårt tak efter vecka 6: 80/dygn och 20/timme. Plan 06:s check `daily_cap between 1 and 500` och plan 03:s max 200 släpper förbi det; sändningskoden tar `min(daily_cap, warmup, kvar_i_timmen)`.

Svarsfält från `POST …/send`: befintliga `sent`, `failed`, `more`, `capReached`, plus `retryAfterSeconds` när fönstret är stängt eller timtaket är nått. Plan 03:s klientloop får inte anropa igen förrän den tiden gått. Under vecka 1–4 returnerar routen efter ett mejl.

### Pausa

Plan 06 har redan `outreach_campaigns.status = 'paused'` och spärrlistan. Lägg `paused_reason text` på kampanjen i `013_outreach` (kolumnen finns inte i plan 06:s utkast). Bara ägaren får sätta tillbaka `active`, och orsaken ska synas i bekräftelsen. Ingen automatisk återstart.

Tills 28 dagar gått eller färre än 200 riktiga utskick:

- 1 `email.complained` → pausa direkt. Adressen in i `outreach_suppressions` (`complaint`), som plan 06 redan skriver.
- 2 hårda studsar (`bounce.type = Permanent`) samma Stockholm-dygn, eller 3 på sju dygn → pausa. Adressen spärras (`bounce`).
- 5 mjuka studsar eller `delivery_delayed` som fortfarande inte är `delivered` efter 12 timmar, samma dygn → pausa. Mjuk studs spärrar inte adressen (plan 06).
- Resend-svar som gäller domänen (verifiering, 403 på avsändaren), inte en enstaka ogiltig adress → pausa.

Därefter, dessutom: hård studs ≥ 2 % på sju dygn, eller klagomål ≥ 0,1 %. Är dygnets volym under 100 pausar fortfarande det första klagomålet.

Skicka-rutten svarar 409 `DELIVERABILITY_PAUSED` när status är `paused`. Samma grind som plan 03:s pausade läge: knappen av, granskning kvar.

### Brevets vikt

`buildShopEmail` i `src/lib/outreach/shop-email.ts` skickar redan `text` och `html`. Det ska `ResendEmailSender` skicka med, som Roots. Test: texten innehåller CTA-URL:en och avregistrerings-URL:en, saknar taggar, och är minst 200 tecken. Annars `missing` och ingen approve.

Bilden är i dag PNG 1104×610 (`MOCKUP_WIDTH_PX` i `shop-mockup.ts`, `asPng()`). Den är för tung som bifogad filter-signal när klienten hämtar den. Före utskick: JPEG kvalitet 72, längsta sida 1104, mål under 80 kB, annars 552 px bred. Logga högst 20 kB. Tillsammans högst 100 kB. HTML-källan högst 80 kB. Adresser på `https://www.namnskylt.com`, aldrig `data:` (testet i `shop-email.test.ts` låser redan det) och aldrig på `mail.`.

Länkar i samma funktion: sex `href` (”öppna i webbläsaren”, bild, VML-knapp plus vanlig knapp, synlig URL, avregistrering) och tre olika UTM-varianter av butiks-URL:en. Före utskick: en CTA och en avregistreringslänk, båda `https` på `namnskylt.com`. Synlig URL får vara text, eller samma `href` som knappen. Ingen kortlänk. `assertDeliverable(html, text)` i deliverability-modulen räknar unika `href` och vägrar över 2.

## 4. Före Resend-kontot

- `src/lib/outreach/deliverability.ts` med schema, fönster, timtak, pausregler och `assertDeliverable`. Tester mot fasta klockslag i `Europe/Stockholm`, inklusive en söndag och en fredag 16:01.
- Testet att `mail.namnskylt.com` är `main`.
- `buildShopEmail`: en CTA-URL, JPEG-taket kan testas med en fixture-PNG genom sharp utan Resend.
- Skicka-rutten anropar modulen och returnerar `retryAfterSeconds`. Mock-sändaren rör inte `sent_at`, så uppvärmningsklockan startar inte av en övning.
- `paused_reason` med i migreringsutkastet.
- Setup-skriptet (plan 03) kan skriva ut poster och avsluta utan nyckel. Det skapar inte domänen än.

## 5. Beslut som användaren måste ta

1. **Avsändardomän.** Förslag `mail.namnskylt.com`. Plan 03 föreslog `utskick.namnskylt.com`. Apex och `hej.` som värdnamn är sämre av skälen ovan. Lokaldelen `hej` är oberoende av valet.
2. **Inkorg för svar och DMARC-rapporter.** Företagsprofilens e-post är tom, och repot visar ingen MX. Utan en låda på en domän ni kontrollerar finns inget `Reply-To` och ingen `rua`.
3. **Befintlig DNS på apex.** Någon måste läsa SPF, DMARC och MX innan en post skrivs. En befintlig DMARC skrivs inte över.
4. **Första veckans takt.** 8 mejl ti–to, 4 på måndag och fredag. Högre volym dag 1 är ett aktivt avsteg.
5. **Paus vid första klagomålet** går inte att stänga av under uppvärmningen. Bekräfta att det är acceptabelt.

## 6. Risker

- **Organisationsdomän.** En del filter, bland annat Googles domänrykte, kan dra ihop `mail.namnskylt.com` med `namnskylt.com`. Underdomänen skyddar SPF-gränsen (tio uppslag), håller `amazonses` borta från apex och gör att en bränd underdomän kan överges. Den är inte en brandvägg. Därför ska framtida ordermejl inte använda samma `From`.
- **Burst.** Plan 03 loopar send tills `more` är falskt, och Roots skickar 12 mejl på 15 sekunder. Utan `retryAfterSeconds` är uppvärmningssiffrorna bara en gräns på papper.
- **Bilden.** PNG 1104×610 från resvg ligger ofta på flera hundra kilobyte. Filtret ser ett bildtungt brev när loggan och mockupen hämtas, även om HTML-källan är liten.
- **Falska öppningar.** CDN-loggar på `/mejlbild` är inte öppningar. Apple hämtar bilden ändå. Räkna inte de träffarna.
- **Svar till sändningsdomänen.** MX:en på `send.mail` tar bara emot studsar åt Resend. `Reply-To` dit försvinner.
- **Delat IP.** Resend:s IP är redan varmt; domänen är kall. Uppvärmningen gäller domänen. Ett klagomål tidigt skadar grannarna på samma IP och kan göra att Resend stänger kontot. Därför är tröskeln ett klagomål, inte 0,3 % (Gmails publicerade tak för stora avsändare).
- **Procent på små tal.** 1 studs av 8 är 12 %. Därför används antal, inte procent, tills 200 utskick.

## 7. Beroenden

- **03 (operatör och setup).** Äger `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `OUTREACH_DRY_RUN`, `scripts/setup-resend.ts` och dashboardstegen. Den här planen byter deras domänförslag, stryker `rsend`, och ersätter platt dagstak 20 / max 200 med schemat ovan. Webhook-händelserna de listar stämmer; lägg inte till opened/clicked.
- **06 (datamodell).** `paused`, `outreach_events`, `outreach_suppressions` och `link_open_count` används som de är. Saknas: `paused_reason`. `daily_cap`-checken 1–500 måste inte sänkas om sändningskoden tar `min`. Hård studs och klagomål skriver spärr; mjuk studs gör det inte. Paus är ett lager ovanpå det.
- **01 (kö).** `claim` före send och ”mock är inte `sent`” ligger kvar. Batch 12 och 600 ms gäller inte under uppvärmning.
- **Mall.** `buildShopEmail` måste ner till två länkar och en JPEG under 80 kB innan första riktiga utskicket. UTM får finnas, men bara en variant av butiks-URL:en.
- **Avregistrering.** `List-Unsubscribe` pekar på en HTTPS-adress på `www.namnskylt.com`, samma URL som i sidfoten. Endpointen måste svara på one-click POST innan volymen lämnar vecka 1. Den adressen ligger inte på `mail.`.
