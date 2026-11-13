# 12 — Personlig landning och onboarding

## 1. Sammanfattning

Mejlet länkar till `/for/[token]`, en sida per utskick. Där ser mottagaren en skylt med sitt företagsnamn, en demobutik byggd med `buildShop` (logga och färger från `src/lib/brand/` via `scrapeCompany`), ett räkneexempel på marginal och knappen **Aktivera min butik**. Aktiveringen skapar ingen ny kontomodell: den myntar en `shop_invites`-rad och återanvänder `ClaimForm` + `claimInviteAction`. Sekundär länk: **Boka 15 min**.

Token är HMAC-signerad, har utgångstid i payload och pekar på `outreach_messages.id`. Ogiltig, utgången och återkallad länk ger samma sida. Demobutiken skapas lat efter första mänskliga träffen (samma funktion kan köras i förväg från admin). Indexering stoppas i fyra lager: `robots`, `X-Robots-Tag`, metadata och att mejlet aldrig länkar den nakna butiksadressen.

## 2. Vad vi återanvänder från Roots

| Roots | Tas med | Ändras |
|---|---|---|
| `apps/web/src/app/f/[token]/route.ts` | En kort publik väg per lead, `dynamic = "force-dynamic"`, sidan svarar även om bakänden strular | Ingen redirect till en generisk `/prova`. Namnskylt renderar landningen själv |
| `apps/api/src/routes/outreach.ts` `GET /p/:token` | Räkna öppning, hoppa över `BOT_UA` (Safe Links, Proofpoint, curl, …) | Räkningen skriver `outreach_messages.open_count` / `opened_at`, inte en lead-rad |
| `proposalUrl()` | Mejlet får en absolut URL | `/for/` i stället för `/f/` |
| `newToken()` (`randomBytes(12)` , 12 tecken, ingen signatur, ingen utgång) | — | Används inte. För kort, går att gissa i mängd, går inte att låta gå ut |

Roots har ingen butik och ingen kontoskapning på länken. Inbjudan, lösenord och session tas från Namnskylt, inte från Roots registreringsflöde.

## 3. Förslag för Namnskylt

### Token

Ny modul `src/lib/outreach/link-token.ts` (test `link-token.test.ts`). `signedPass` (`src/lib/auth/signed-pass.ts`) duger inte: den signerar ett fast `purpose` utan payload och utan utgångstid. Samma sak gäller `sessionToken` i `src/lib/reseller-auth/session.ts`.

```
v1.{expUnix}.{messageUuid}.{hmacHex}
hmac = HMAC-SHA256(OUTREACH_LINK_SECRET, "v1.{expUnix}.{messageUuid}")
```

Jämförelse med `timingSafeEqual`, som i `tenantFromCookie`. Hemligheten är **inte** `RESELLER_PASSWORD` eller `SITE_GATE_PASSWORD` — de byts av andra skäl och får inte döda ett pågående utskick.

`expUnix` är `now + 60 dygn` (`OUTREACH_LINK_DAYS`), sparad som `outreach_messages.expires_at`. Giltig endast när signaturen stämmer, `exp > now`, `exp` ≤ radens `expires_at`, raden finns, och `status` inte är `revoked` eller `unsubscribed`. Inget e-post i URL:en (den läcker via Referer). Att förlänga `expires_at` och skicka en ny länk dödar inte den gamla förrän dess egen `exp`. Att korta `expires_at` eller sätta `revoked` dödar alla länkar för raden.

`getInvite` i `src/lib/shops/editor-repository.ts` är ett annat token: `randomBytes(18).base64url`, regex `^[A-Za-z0-9_-]{20,40}$`, 14 dagar (`INVITE_DAYS`), engångs (`used_at`). Det tokenet skapas först vid aktivering och syns aldrig i mejlet.

### Ogiltig länk

Samma ton som `src/app/aterforsaljare/[token]/page.tsx`: rubrik **Länken fungerar inte längre**, text om att den gått ut eller återkallats, och en mailto till avsändaren. HTTP 200. Ingen skillnad mellan fel signatur, okänt id, utgången och återkallad — då går det inte att leta id:n. Saknas `OUTREACH_LINK_SECRET` eller databas (`databaseConfigured()` som på inbjudningssidan) visas samma sida.

### Sidan

`src/app/for/[token]/page.tsx` är tunn. Innehållet ligger i `src/features/outreach-landing/` (serverkomponent + `landing.module.css`). `dynamic = "force-dynamic"`. Metadata som offerten: `robots: { index: false, follow: false, nocache: true }`.

Block, i ordning:

1. Logga (ur butiken när den finns, annars bara namnet) och rubrik **{företag}, er namnskyltsbutik är redo**.
2. Skyltbild från `src/app/for/[token]/skylt/route.ts`. Dokumentet byggs med `createBadgeDocument([kontaktnamn eller "Anna Lindqvist", företagsnamn])`, material `plastic-2-layer` / `black-white`, PNG via `renderBadgePng`. Route kräver giltig token, `cache-control: private, no-store` och `X-Robots-Tag: noindex, nofollow`. Loggan i sidhuvudet kommer från skrapningen. Graverad logga på själva skylten kräver mask + `traceLogoMask` (`src/engine/logo.ts`); dagens spårning i `src/features/designer/logo/trace-image.ts` är canvas och kan inte köras på servern. v1 graverar namnet. Saknas spårning blir skylten utan logga, sidan faller inte.
3. Butiksblock. Klar butik: mockup via `renderShopMockup` (finns redan på `/butik/[slug]/mejlbild`) plus länk **Öppna butiken** till `/butik/{slug}`. Inte klar: kort text om att butiken byggs, klienten pollar en server action.
4. Marginal, se nedan.
5. Primär CTA **Aktivera min butik**.
6. Sekundär **Boka 15 min**. `CALENDLY_URL` om den finns (namn och e-post som query, aldrig token). Annars ett formulär (namn, telefon, önskad tid) som sätter `outreach_messages.meeting_requested_at` och en rad i `shop_events` eller en kolumn `meeting_note`. Inget mejl förrän Resend finns — operatören ser önskemålet i panelen.

`src/app/layout.tsx` har `OPEN_PATHS` som släpper förbi `SiteGate`. Lägg till `"/for/"`. Utan det möter mottagaren sajtlösenordet när `SITE_GATE_PASSWORD` är satt. Middleware låser bara `/api/`; sidan är en server action, inte en ny API-route, och behöver inget undantag i `src/middleware.ts` för själva klicket.

### Demobutik, lat eller i förväg

En funktion: `ensureDemoShop(messageId)` i `src/lib/outreach/ensure-demo-shop.ts`.

- Finns `shop_slug` och `getShop` träffar: återanvänd.
- Finns webbadress: `buildShop(url, { name })` i `src/lib/shops/build.ts`. Den kallar `scrapeCompany` → `scrapeBrand`. Ingen egen skrapning.
- Skrapan kastar eller tar för lång tid: `createShop` med leadets namn, `DEFAULT_COMPANY`-färger och ingen logga. Sidan ska gå att aktivera ändå.
- Därefter sidor utöver den låsta startsidan (`lockStartPage` i `src/lib/shops/content.ts`): `templateBlocks("about")` och `templateBlocks("materials")` från `src/lib/shops/page-templates.ts`, bilder via `createShowcaseImages`, publicera med `publishContent(slug, content, "outreach")`. `priceList` lämnas `null` (riktpris). Påhittat påslag hör inte hemma i butiken de sedan tar över.
- Idempotens: `update outreach_messages set build_status = 'building' where id = $1 and shop_slug is null and build_status is distinct from 'building'`. Två klick skapar inte två butiker. `owner_id` förblir `null` tills `acceptInvite`.

**Lat är standard.** `buildShop` kan ta ~28 s (`RENDER_BUDGET_MS` i `src/lib/brand/profile.ts`) och showcase ritar flera PNG. Första svaret får inte vänta på det. Sidan renderas ur leadets namn; `after()` från `next/server` startar `ensureDemoShop` bara när user-agent inte matchar Roots `BOT_UA`. En prefetch från Safe Links får inte starta Playwright och OpenAI.

**I förväg** är samma funktion, anropad från admin innan mejlet går (första lilla sändningen). Första klicket är då färdigt. Taket i `buildShopAction` är 30 byggen per timme för ägaren; outreach får en egen räknare i samma `createRateLimiter` (förslag: 20 byggen/timme globalt) så ett utskick inte kan skrapa fritt.

Butiksadressen är gissningsbar: `slugify` i `src/lib/shops/model.ts` plus `/butik/[slug]` och `slug.namnskylt.com` (`shopRewritePath` i `src/lib/shops/host.ts`). Mejlet länkar bara `/for/…`.

### Aktivera min butik

`activateOutreachAction(landingToken)`:

1. Verifiera landningstoken. Ogiltig → samma feltext som `claimInviteAction`.
2. `ensureDemoShop` om slug saknas.
3. Återanvänd en oanvänd, ogången rad i `shop_invites` för slug + e-post. Annars `createInvite(slug, email)` (14 dagar från nu, inte från utskicket).
4. Rendera `ClaimForm` (`src/features/invite/claim-form.tsx`) med den inbjudan. Knapptexten är hårdkodad till **Ta över butiken** — lägg en valfri `submitLabel`, default oförändrad, landningen skickar **Aktivera min butik**.
5. `claimInviteAction` är oförändrad: rate limit 20/timme per inbjudanstoken, nytt konto via `createAccount` eller befintligt via `authenticate`, `acceptInvite` sätter `shops.owner_id`, `signInCookies` loggar in (och delar ut sajtgrinden när den är på). Redirect finns redan: `/admin/butiker/{slug}`.

Är `owner_id` satt visas **Butiken är aktiverad** och länk till `/admin`, inte ett nytt formulär. E-postfältet förblir redigerbart — befintligt konto med annat konto-id är redan ett fall i `claimInviteAction`.

### Räkneexempel

`src/lib/outreach/margin-example.ts` + test. Inga hårdkodade kronor. `src/engine/pricing.ts` säger själv att priset är indikativt tills leverantörens API svarar.

Exempelorder: 25 st, en rad, `createBadgeDocument`, material `plastic-2-layer` (grundpris 39 kr i katalogen, mängdtrappa 0,85 från 10 st). Kundpris = `priceOrder` (riktpris, `priceList` null). Inköp = `purchasePrice` med `generalPercent: 40` (samma exempeltal som `src/lib/orders/purchase.test.ts`). Marginal = `marginOf`. Sidan visar tre tal: kunden betalar, ni betalar, kvar till er (kr och procent), plus meningen att 40 % är ett räkneexempel och inte deras avtal. Avtalet sätts senare under `/admin/inkopspriser` per tenant. Riktpris mot kund är medvetet: de ser vad en beställning kostar i butiken de just öppnade.

### Indexering

Idag sätter `src/app/butik/[slug]/layout.tsx` `robots: { index: false, follow: false }`. Det finns ingen `robots.ts` och ingen `X-Robots-Tag`. `/butik/[slug]/mejlbild` svarar med `cache-control: public, max-age=86400` och utan robot-header. Metadata är en hint; headern är det som fler robotar läser.

1. `src/app/robots.ts`: `Disallow` på `/for/`, `/butik/`, `/aterforsaljare/`, `/admin/`, `/forhandsvisning/`, `/offert/`, `/korrektur/`, `/inbaddning/`, `/api/`.
2. I `src/middleware.ts`, på samma svar som redan skrivs om för butiksvärd: `X-Robots-Tag: noindex, nofollow` när sökvägen börjar med `/for/`, `/butik/` eller `/aterforsaljare/`. Gäller då också `slug.namnskylt.com`, eftersom rewrite sätter pathname till `/butik/{slug}`.
3. Metadata `noindex` kvar på butikslayout, inbjudan och den nya landningen. Bildrouten under `/for/` sätter headern själv (route handlers ärver inte sidans metadata).
4. Mejlet och landningen länkar inte `/butik/…/mejlbild`. Mockupen på landningen går via token-routen `src/app/for/[token]/butiksbild/route.ts` som anropar `renderShopMockup` när slug finns.

`noindex` döljer träffar. Det stänger inte butiken. En gissad slug fungerar, eftersom `/butik/` ligger i `OPEN_PATHS` och middleware sätter `ns_shop` åt vem som helst.

## 4. Före Resend

Allt i avsnitt 3 kan byggas och klickas utan API-nyckel. Saknas `CALENDLY_URL` visas formuläret; önskemålet sparas, inget mejl går. Testa med en fejkad `outreach_messages`-rad och `OUTREACH_LINK_SECRET` i `.env`: giltig länk, manipulerad hmac, utgången `exp`, bot-UA som inte sätter `build_status`, aktivering som landar i `/admin/butiker/{slug}`, och `curl -I` mot `/for/…` och `/butik/{slug}` som visar `X-Robots-Tag`. Kör `pnpm typecheck && pnpm lint && pnpm test` — ny logik i `src/lib/outreach/` ska ha `node:test`.

## 5. Beslut

1. **60 dagars landningslänk**, inbjudan 14 dagar från aktiveringsklicket. Annan livslängd om säljcykeln är kortare.
2. **Räkneexemplet: riktpris till kund, 40 % inköpsrabatt, 25 gravyrplast.** Bekräfta talen. De är inte ett avtal.
3. **Lat byggande som standard**, med admin-knapp som kör samma funktion före utskick. Ska första batchen alltid förbyggas?
4. **Calendly-URL** (`CALENDLY_URL`) eller bara formulär tills länken finns.
5. **Får en ogissad demobutik utan ägare öppnas av vem som helst?** Indexering stoppas oavsett. Vill ni också att `owner_id is null` kräver en kaka satt av `/for/[token]` (som `ns_shop`, men bunden till slug) är det en extra grind, inte en del av noindex.

## 6. Risker

| Risk | Hantering |
|---|---|
| Safe Links bygger hundratals butiker | Ingen `ensureDemoShop` när UA matchar `BOT_UA`. Öppningsräknaren hoppar över samma UA |
| Skrapan ligger nere eller sidan blockerar | Skal-butik via `createShop`, skylt med företagsnamn, aktivering fungerar |
| Två samtidiga klick | `build_status`-uppdateringen är villkoret för att få skapa |
| Token i loggar och Referer | Bara meddelande-id i token. Calendly får inte token som query. Kort livslängd går att korta i efterhand |
| Roterad `OUTREACH_LINK_SECRET` dödar alla länkar | Egen variabel, dokumenterad. Inte delad med grind eller panel |
| Prisexemplet uppfattas som offert | Texten säger räkneexempel. Talen kommer från motorn så de inte driver ifrån katalogen |
| Gissad `/butik/{slug}` eller underadress | noindex i fyra lager. Åtkomst är beslut 5 |
| Inbjudan löper ut före landningen | Inbjudan skapas vid aktivering, inte vid utskick |
| Playwright på första sidträffen | `after()` + poll. Sidan själv väntar inte 30 s |

## 7. Beroenden

- **Datamodell:** `outreach_messages` behöver `id`, `lead_id`, `email`, `company_name`, `contact_name`, `website`, `expires_at`, `status` (`sent` / `revoked` / `unsubscribed`), `open_count`, `opened_at`, `shop_slug`, `build_status` (`idle` / `building` / `ready` / `failed`), `meeting_requested_at`, `meeting_note`. Leaden äger webbadressen; meddelandet äger länken.
- **Mejlmall:** enda CTA-href är `https://namnskylt.com/for/{token}` från `linkToken()`. Inte butiks-URL, inte `/aterforsaljare/…`.
- **Avregistrering:** sätter `status = unsubscribed` (eller `revoked`). Landningen läser status och visar den döda sidan. Eget token-purpose, så en klickskanner som träffar alla länkar inte avregistrerar.
- **Spårning och admin:** den här sidan skriver `open_count` och mötesönskemål. Panelen visar dem. Ingen egen räknare i mejlpixeln behövs för sidträffen.
- **Avsändare:** mailto på den döda sidan och avsändarnamn på landningen. Resend krävs inte för sidan.
- **Inbjudan (befintlig kod, inte en annan plan):** `createInvite`, `claimInviteAction`, `acceptInvite`. Rör inte deras semantik.
