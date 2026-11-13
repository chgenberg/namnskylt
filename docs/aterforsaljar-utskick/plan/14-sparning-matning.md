# 14 — Spårning och mätning

## 1. Sammanfattning

Roots tar inte emot Resend-webhooks. `apps/api/src` har Svix-träffar noll; `resend-sender.ts` sparar bara `id` från `POST /emails`. Det enda eftermälet är ett mänskligt besök på förslagslänken: `GET /p/:token` ökar `proposal_open_count` om user-agent inte matchar `BOT_UA` (`apps/api/src/routes/outreach.ts`).

Namnskylt har ett färdigt webhookmönster, men för leverantören: `POST /api/supplier/webhook` med `SUPPLIER_WEBHOOK_SECRET` och HMAC `t=<unix>,v1=<hex>` i `src/lib/supplier/status.ts`. Det är inte Svix. Butiksstatistiken (`shop_events`, `visit|embed|design`) saknar lead och får inte vara funneln.

Resend-leverans kommer via `POST /api/outreach/webhook` (Svix, egen verifierare). Klick äger vi själva via `GET /r/[token]`. Öppningspixel och Resends klickomskrivning är av. Funneln är sju steg från skickat till första riktiga butiksorder, med KPI för pilotvågen `fifty` och en ägarvy under `/admin/utskick`.

## 2. Vad vi återanvänder från Roots

| Roots | Hos oss |
|---|---|
| Ingen webhook, ingen `svix` | Byggs här. Leverantörens Stripe/Fortnox-webhookar i Roots är fel format. |
| `provider_id` efter lyckat skick | Heter `resend_id` (plan 06). Webhookens `data.email_id` matchar den. |
| `BOT_UA` i `outreach.ts` (bot, safelinks, proofpoint, mimecast, barracuda, curl, …) | Kopieras till `src/lib/outreach/clicks.ts`. Tom user-agent räknas inte, precis som Roots (`if (ua && !BOT_UA.test(ua))`). |
| `proposal_open_count` / `proposal_opened_at` på leadet | `link_open_count` / `link_opened_at` (plan 06). Unikt klick = `link_opened_at is not null`. |
| Räknaren sitter på sidan, inte i Resend | Redirecten räknar. Resend-händelsen `email.clicked` skriver inte funneln. |

`src/lib/webhook-dedup.ts` (Redis) portas inte. Namnskylt har ingen Redis. Idempotens är `outreach_events.provider_event_id` (Svix-id) i samma transaktion som statusbytet.

## 3. Förslag för Namnskylt

### Webhook

`src/app/api/outreach/webhook/route.ts`, `runtime = "nodejs"`. Plan 03 skrev `/api/outreach/resend`; den här planen låser `/api/outreach/webhook`, samma form som leverantörens. 03:s dashboardsteg och `.env.example`-kommentar pekas om. Hemligheten heter fortfarande `RESEND_WEBHOOK_SECRET`.

Beteende, speglat på `src/app/api/supplier/webhook/route.ts`:

1. Tom hemlighet → 503, `{ error: "Webhooken är inte aktiverad" }`.
2. `request.text()` före JSON. Tak 64_000 byte (leverantörens 16_000 är för snålt).
3. `verifyResendWebhook(body, headers, secret, nowSeconds)` innan parse. Annars 401.
4. Ogiltig JSON → 400. Känd `email.*` utan `data.email_id` → 200 och ingen statusändring (Svix ska inte retry:a för evigt).
5. `applyOutreachEvent` i en transaktion. Svar 200 `{ ok: true }`. Databasfel → 500 så Svix försöker igen.

Svix, implementerat med `node:crypto` i `src/lib/outreach/svix.ts`. Inget `svix`-paket. Återanvänd inte `verifyWebhookSignature`: den väntar hex och `x-supplier-signature`.

- Huvuden: `svix-id`, `svix-timestamp`, `svix-signature`.
- Nyckel: base64 efter prefixet `whsec_`.
- HMAC-SHA256 över `` `${id}.${timestamp}.${body}` ``, digest base64.
- Headern kan ha flera `v1,<base64>` åtskilda av mellanslag. En träff räcker. `timingSafeEqual` på lika långa buffertar.
- `|now - timestamp| > 300` sekunder avvisas (`SIGNATURE_TOLERANCE_SECONDS` i `status.ts` är samma fönster).
- Ett test matar in en leverantörs-header och förväntar `false` (plan 16).

`src/middleware.ts` släpper redan `/api/supplier/webhook` förbi sajtkakan. Lägg `/api/outreach/webhook` i samma villkor (rad 76–83). Utan det svarar Resend mot "Sajten är låst".

Händelser, mot plan 06:s statusmaskin. `insertEvent` måste köra status och spärr i samma transaktion som `insert … on conflict (provider_event_id) do nothing`. Konflikt → returnera utan att skriva om. Annars sväljer en krasch Svix-id:t och retry gör ingenting (Roots råkade ut för det i `webhook-dedup.ts`).

| `type` | Effekt |
|---|---|
| `email.sent` | Om raden fortfarande är `sending` och `resend_id` matchar: `sent`. Annars bara event. |
| `email.delivered` | `sent → delivered`. Sätt inte om status redan är `opened`/`clicked`. |
| `email.delivery_delayed` | Bara event. Ingen spärr, inget statusbyte. |
| `email.bounced` | `data.bounce.type === "Permanent"` → spärr `reason=bounce`, `source=webhook`, och status `bounced` om `canTransition` tillåter. `Transient` och `Undetermined` är event, ingen spärr. |
| `email.complained` | Alltid spärr `reason=complaint`. Status `complained` om övergången tillåter. |
| `email.opened` | Event, och `opened` om övergången tillåter. Inte ett funnelsteg. |
| `email.clicked` | Bara event. Funnelns klick kommer från `/r/`. |

`sent → delivered` saknas i plan 06:s övergångslista trots att `delivered` finns i `check`. Den måste in i `canTransitionMessage`. Bounce efter `opened`/`clicked` flyttar inte status bakåt (06) men Permanent-spärren skrivs ändå.

Webhook före `markSent`: eventet sparas med `message_id` null och `resend_id` satt (06). `markSent` anropar `attachPendingEvents(resendId)` i samma transaktion som id:t skrivs.

Spärren är `insert … on conflict (email) do nothing` på `outreach_suppressions`, e-post `trim` + `lower`. Mjuk bounce spärrar inte (06). Kön måste läsa `isSuppressed` innan `approved → sending`.

### Egen klickspårning

Resends öppning och klick lämnas av: ingen `rsend`-CNAME (plan 03, beslut 4). Apple Mail Privacy Protection gör öppningsgraden oanvändbar, och deras klickdomän gör att vi inte äger träffen.

`src/app/r/[token]/route.ts` (GET, inte en sida):

- Token som inbjudan: `/^[A-Za-z0-9_-]{20,40}$/`. Annars 404. Okänd token 404.
- Alltid 302 till `outreachLandingPath(lead)` i `src/lib/outreach/links.ts`. Tills en landningssida finns är målet `/butik/{shop_slug}`.
- Sätt kaka `ns_out=<token>`, httpOnly, `SameSite=Lax`, `Secure` på https, `Path=/`, 30 dagar. Ingen `?ref=` på butiks-URL:en — en delad länk skulle annars skriva någon annans besök på leadet.
- Människa: `link_open_count + 1`, `link_opened_at` sätts bara första gången, och senaste meddelande som får gå till `clicked` sätts dit.
- Bot eller tom user-agent: redirect utan räknare, så SafeLinks inte slår sönder länken och inte heller fyller KPI:n.
- Avregistrering går inte via `/r/`. Den stannar på `/avregistrera` (`unsubscribeUrl` i `src/lib/outreach/shop-email.ts`) och skriver `reason=unsubscribe`. Annars blir nej-tack ett klick.
- Giltig ägarsession (`isOwner`) redirectar utan räknare, så förhandsvisningen inte fyller piloten.
- `buildShopEmail` ska peka knapp och bild på `/r/{token}`, inte på `tracked(shopUrl)` med `utm_campaign=demobutik`. UTM blir kvar som extra på redirectens mål om landningsplanen vill, men funneln läser inte UTM. `shop-email.test.ts` låser idag `utm_campaign=demobutik` och måste följa med.

`/r/` ligger inte under `/api/` och stoppas inte av sajtgrinden.

### Funnel

Sju steg, ett lead per rad. Nämnaren för klick och framåt är levererade, inte skickade. Ett klick utan delivered-event räknas ändå (webhooken kan ligga efter).

| Steg | Källa | Inte |
|---|---|---|
| Skickat | meddelande lämnat `sending` med `sent_at` | mock / `failed` |
| Levererat | event `email.delivered` eller status `delivered\|opened\|clicked` | nuvarande status ensam (den går vidare till `clicked`) |
| Klick | `link_opened_at` | `email.clicked`, `email.opened`, `shop_events` |
| Landning | `landing_at`, satt av landningssidans serverkomponent via `recordLanding(token)` | butikssidan |
| Demobutik | `demo_opened_at`. `/butik/[slug]/page.tsx` och `[page]/page.tsx` läser `ns_out`. Bara om `lead.shop_slug === slug` | `ShopBeacon`, `kind=design` (3D-motorn är inte steget) |
| Konto | `attributed_at` / status `converted` (plan 06, `claimInviteAction`) | ny skrivning här |
| Första order | `first_order_at` | `orders.is_demo` (påhittad paneldata, inte "order i demobutiken"), `cancelled`, `source` annat än `shop` eller `web` |

Tre kolumner saknas i plan 06 och ska in i `013_outreach` innan den körs (ingen egen migrering här):

```sql
alter table outreach_leads add column landing_at timestamptz;
alter table outreach_leads add column demo_opened_at timestamptz;
alter table outreach_leads add column first_order_at timestamptz;
```

`noteFirstOrder(shopSlug, placedAt, source, demo)` anropas efter inserten i `src/lib/orders/repository.ts` (runt rad 187). Den sätter `first_order_at` bara om den är null, `placed_at` ligger efter leadets första `sent_at`, `demo` är falskt och `source` är `shop` eller `web`. Fel i anropet får inte fälla ordern.

`src/lib/shops/stats.ts` och `SHOP_EVENT_KINDS` lämnas. De räknar alla besökare i butiken, inklusive oss som bygger den.

### KPI, piloten

Säkerhetsstoppen ägs av plan 16 och visas här, de implementeras inte om:

- `friendly10`: 0 complaints, hård studs ≤ 1, stopp vid studs ≥ 3.
- `fifty`: 0 complaints, hård studs ≤ 2 % (≤ 1/50).
- `all`: complaints över 0,1 % den dagen, eller hård studs över 2 % på 7 dygn, är stopp.

Framgång för vågen `fifty`, mätt 14 dygn efter sista `sent_at` i vågen. `internal` ingår inte.

| Mått | Mål |
|---|---|
| Levererat | ≥ 97 % av skickade |
| Unikt klick | ≥ 12 % av levererade |
| Landning | ≥ 8 % av levererade, och minst 70 % av klicken |
| Demobutik | ≥ 4 % av levererade |
| Konto aktiverat | ≥ 2 % av levererade (minst 1) |
| Första order | minst 1 inom 45 dygn. Noll order på dag 14 fäller inte vågen |

`delivery_delayed` visas som hälsotal, inte som steg. Öppningar visas bara om de är > 0, med texten att de inte är ett mål — då har någon tänt Resend-pixeln.

### Admin

Ny serverkomponent `src/app/admin/utskick/page.tsx`. Samma grind som butikslistan: `adminTenant()` och `isOwner`, annars `return null`. Inte `/admin/statistik` — den sidan är varje återförsäljares försäljning (`orderStats`) och får inte lista andras e-post.

Nav: ett ägarval i `NAV` i `src/features/admin/admin-shell.tsx`, `ownerOnly: true`, label "Utskick", href `/admin/utskick`. Förhandsvisningen i plan 16 ligger kvar på `/admin/utskick/forhandsvisning`.

Vyn återanvänder `styles.kpis` / `styles.kpi` från `admin.module.css`. Sju tal, hint med målet under varje. Under det: hård studs, klagomål, försenade, antal rader i `outreach_suppressions`. Sedan en tabell: bolag, längsta steg, tider. Data från `outreachFunnel(wave)` i `src/lib/outreach/funnel.ts`. Ingen ny diagramkomponent.

Längsta steg: `first_order_at`, `attributed_at`, `demo_opened_at`, `landing_at`, `link_opened_at`, leveransevent, `sent_at`.

### Tester

`pnpm test` plockar redan `src/lib/**/*.test.ts`.

- `src/lib/outreach/webhook.test.ts` — namnen plan 16 låst: `verifyResendWebhook`, `applyOutreachEvent`. Rätt signatur, fel nyckel, ändrad kropp, 301 s, saknade `svix-*`, leverantörshuvud. `email.delivered` en gång. Permanent bounce och complaint spärrar en gång. Transient bounce spärrar inte. `delivery_delayed` byter inte status. Okänd `resend_id` lämnar `message_id` null.
- `src/lib/outreach/clicks.test.ts` — bot räknas inte, människa sätter `link_opened_at` en gång och ökar räknaren vid omladdning, ägarsession räknas inte.
- `src/lib/outreach/funnel.test.ts` — ren `funnelFromRows` utan databas: sju tal, vågen `internal` utesluten, `is_demo` och `source=reseller` är inte första order.

## 4. Före Resend-kontot

Allt utom att klistra in en riktig `whsec_` och spara URL:en i Resend.

- Verifierare, applicerare, redirect, funnel och testerna, med fixturhemlighet `whsec_` + base64 som testet själv skapar.
- Tre kolumner i 06:s migrering, middleware-undantag, tom `RESEND_WEBHOOK_SECRET=` i `.env.example`.
- Mock-`resend_id` (`mock_…`) kan matas genom `applyOutreachEvent` med fixture-JSON. Dashboarden visar nollrader.
- `/r/[token]` går att klicka mot en lokal lead-rad. Ingen HTTP till `api.resend.com`.
- URL att spara senare: `https://<produktionsvärd>/api/outreach/webhook`. Händelser: de sju i tabellen. Öppning och klick får vara ikryssade; de ändrar inte KPI:n. Spara inte endpointen förrän routen svarar 401 utan hemlighet och 200 med testsignatur.

## 5. Beslut som användaren måste ta

1. **Sökväg.** Förslag: `POST /api/outreach/webhook`, inte plan 03:s `/api/outreach/resend`. En adress i DNS-runbooken och i koden.
2. **Resend-pixeln förblir av.** Klick = `/r/`. Öppningar lagras om de råkar komma, men är inte ett mål. Säg till om pixeln ska vara på ändå.
3. **Landning och butik är två steg.** Knappen i mejlet går till `/r/` och sedan en landningssida som länkar vidare till `/butik/{slug}`. Tills sidan finns räknas bara klick och, om redirecten går direkt till butiken, demobutik — `landing_at` förblir null. Plan 04 ville ha butiken som huvudknapp; säg till om landningssteget ska strykas och de två talen slås ihop.
4. **KPI-tabellen ovan för `fifty`.** Annan nivå (till exempel 8 % klick) är ett byte av siffrorna, inte av mätpunkterna.
5. **Första order är `shop` eller `web`.** En order lagd i panelen (`reseller`, `staff`) räknas inte. Säg till om återförsäljarens egen testorder ska räcka.

## 6. Risker och hur de hanteras

- **SafeLinks och liknande hämtar länken.** `BOT_UA` plus att unikt klick är första mänskliga träffen. Landning och demobutik kräver att nästa dokument renderas med kakan. Residual inflation tål vi; konto och order är rena.
- **Apple MPP.** Öppningsgrad är inte KPI och inte stopplinje.
- **Webhook före commit.** Event med `message_id` null kopplas i `markSent`. 200, inte 404 (leverantörens 404 betyder "sluta försöka").
- **Retry efter krasch.** Transaktion runt event + status + spärr. Konflikt på `provider_event_id` är en no-op.
- **Sajtgrinden.** Utan middleware-undantaget når webhooken aldrig verifieraren.
- **`shop_events` blandas ihop med funneln.** Ingen lead-kolumn där, och operatörens egna besök skulle räknas. Funneln skriver bara på `outreach_leads`.
- **Avregistrering som klick.** `/avregistrera` är en annan väg. Den routen finns inte än; tills den gör det får mallen inte peka avregistreringen på `/r/`.
- **Förhandsvisning.** Ägarsession räknas inte. Andra inloggade hyresgäster har inte den kakan på den publika routen, så deras klick räknas — förhandsvisning ska bara ägaren öppna.
- **Order i butiken innan övertagande** landar hos `namnskylt` (plan 04) men har ändå `shop_slug`. Den räknas som första order om källa och `is_demo` stämmer. Det är en stark signal, inte ett fel.
- **Loggar.** Logga typ, `svix-id` och `resend_id`. Inte råkroppen och inte mottagaradressen.

## 7. Beroenden till andra planområden

- **03 Operatörs-UI och Resend-setup.** Byt webhook-URL till `/api/outreach/webhook`. Behåll `RESEND_WEBHOOK_SECRET` och avstängd klick-/öppningsspårning. Dashboardsteg 8 i den planen prenumererar på samma sju händelser.
- **06 Datamodell.** Äger tabellerna. Den här planen lägger `landing_at`, `demo_opened_at`, `first_order_at` och övergången `sent → delivered` i `013_outreach`. `insertEvent`, `suppress`, `isSuppressed`, `getLeadByToken` anropas, de skrivs inte om. Spärr före claim är deras kontrakt.
- **04 Plattformen.** `attributed_at` vid `acceptInvite` är kontosteget. `orders.shop_slug`, `is_demo` och `source` är ordersteget. Beslut 3 här krockar med deras "butiken som huvudknapp" om landningen ska vara ett eget steg.
- **08 Leveransbarhet.** Studs- och klagomålströsklar som pausar kön. Den här vyn visar talen från plan 16. Den skickar inte och den pausar inte.
- **Mall.** Knapp och bild till `/r/{token}`. Avregistrering till `/avregistrera`. Uppdatera `shop-email.test.ts`.
- **Sändningskö.** `isSuppressed` innan claim, annars blir en spärrad adress `failed`.
- **Landningssida.** Anropar `recordLanding(token)` i serverkomponenten. Utan det anropet är steget tomt med flit.
- **16 Test och utrullning.** Testfil och funktionsnamn är deras. Fixturen för bounce måste ha `bounce.type = "Permanent"`, annars spärrar testet en mjuk studs som produktionskoden släpper igenom. Vågorna `friendly10` / `fifty` / `all` är kohorterna KPI:n filtrerar på.
