# 04 — Återförsäljarplattformen (faktaunderlag för erbjudandet)

## 1. Sammanfattning

En demobutik byggs ur återförsäljarens hemsida (`buildShop` i `src/lib/shops/build.ts`) och är genast publik på `/butik/{slug}` med `robots: noindex`. Övertagande sker via en engångslänk `/aterforsaljare/{token}` (`shop_invites`, 14 dagar). Efter kontot (`reseller_accounts`) loggas de in och nya butiksordrar får `orders.reseller_id` = deras tenant. Priser är påslag på riktpriset (`ShopPriceList`, −50…+300 %). Tillverkning går via `placeOrder` → `src/lib/supplier/`, men bara material med `producer: "skylt-gravyr"`; mässing, akryl, massiv aluminium och epoxy blir en Quickbutton-förfrågan. Plattformen mejlar inte inbjudan själv, och det befintliga mejlet i `src/lib/outreach/shop-email.ts` länkar bara till butiken och ber mottagaren svara för domän, priser och ordrar — funktioner som redan finns efter övertagandet.

## 2. Vad vi återanvänder från Roots

Roots har ingen butik, tenant eller inbjudan att kopiera. Övertagandet finns redan i Namnskylt och ska inte ersättas av Roots `outreach-claim`.

Det enda mönstret härifrån är: **en personlig länk i mejlet som slutför ett konto**. I Namnskylt är den länken `createInvite` + `/aterforsaljare/[token]`, inte en ny claim-tabell. Utskickskoden (Roots `resend-sender` / `mock-sender`) ska anropa befintliga funktioner och stoppa in båda adresserna i `buildShopEmail`. Roots mallar, kö och Resend-konto hör till de agenter som äger utskicket.

## 3. Förslag för Namnskylt

### Så funkar det i koden idag

**Inbjudan.** Bara ägaren (`isOwner`, tenant `namnskylt`) får bygga butik och bjuda in (`buildShopAction`, `createInviteAction` i `src/features/admin/shop-actions.ts`). `createInvite` (`src/lib/shops/editor-repository.ts`) skriver `shop_invites (token, shop_slug, email, expires_at, used_at)`. Token är 18 byte base64url. Giltig 14 dygn, engångs (`used_at`). Kommentaren i `createInviteAction`: plattformen mejlar inte — den returnerar bara URL:en.

**Konto och inlogg.** `claimInviteAction` (`src/features/invite/invite-actions.ts`) skapar `reseller_accounts` (scrypt, lösenord minst 10 tecken, `MIN_PASSWORD_CHARS`) eller loggar in ett befintligt konto med samma e-post. `acceptInvite` sätter `shops.owner_id`. Kakor: `ns_admin` = `{tenant}.{hmac}` med `RESELLER_PASSWORD`, 30 dygn (`PASS_MAX_AGE_SECONDS`). E-postfältet är ifyllt men **inte låst** till inbjudans adress. Ingen glömt-lösenord. Panelen är `/admin` (`POST /api/admin/session`: e-post = återförsäljare, tom e-post + `RESELLER_PASSWORD` = ägaren).

**Butik och domän.** Slug ur företagsnamnet (`slugify`). Data i `shops.data` (jsonb): profil, typsnitt, `sourceUrl`, `priceList`, `domain`. Underadress löses i `resolveHost` (`src/lib/shops/host.ts`): `{slug}.namnskylt.com` → rewrite till `/butik/{slug}`. Egen domän sparas och slås upp i `shopSlugForDomain` / `GET /api/shop-domain`. UI:t säger att återförsäljaren ska peka CNAME mot `butiker.namnskylt.com` och att **vi** kopplar certifikat i Railway (`src/app/admin/butiker/[slug]/page.tsx`). Det är inte automatiskt. DNS för wildcard ligger inte i repot.

**Vad slutkunden ser.** Butikens logga, färger och typsnitt (`shopThemeVars`). Startsidans skyltmotor är låst (`lockStartPage`); undersidor (max 8) byggs av block, mallar i `page-templates.ts`, AI-utkast, publicering med 30 versioner. Priset i motorn är `shopPrice` — mängdrabatt först (`QUANTITY_TIERS` 10 / 50 / 200 → faktor 0,85 / 0,72 / 0,6), sedan påslag, moms 25 %. Samma tal sparas på ordern (`shopOrderPricing`). Inbäddning: `public/embed.js` + `/inbaddning/{slug}`. Avsändare på offert/korrektur är butiken när `shop_slug` finns (`resolveSender`). Kassan tar **inte betalt** — ingen Stripe/Swish/Klarna. Orderbekräftelsen säger att butiken hör av sig.

**Pris och marginal.** Butikspriset är påslag på *riktpriset*, inte på inköpet (`src/lib/shops/price-list.ts`). Inköp är en rabatt återförsäljaren själv skriver under Inställningar → Inköpspriser (`purchase_terms` i `settings`, max 90 %). Marginalen i skyltmotorn (`marginOf`) syns bara för inloggad återförsäljare och bara om rabatten är ifylld. Den ändrar inte vad leverantören debiteras: `SupplierOrderRequest` har ingen prisrad. `src/engine/pricing.ts` kallar modellen indikativ tills leverantörens prissvar finns.

**Order, tillverkning, panel.** `POST /api/orders`: om `shops.owner_id` är satt blir `tenant` ägaren, annars `namnskylt`. `placeOrder` skickar `producer: "skylt-gravyr"` (borstad aluminium, rostfritt, gravyrplast) till `SUPPLIER_API_URL` med produktions-SVG. Saknas `SUPPLIER_API_URL` + `SUPPLIER_API_KEY` används `MockSupplierClient` (fingerat ordernummer, 5 arbetsdagar) — butikskassan visar inte testlägesvarningen (`order.mock && !shop`). Quickbutton-material blir `partnerRequestNo` (`QB-…`) och texten ”vi återkommer via e-post”. Korrektur är valfri (`TIMELINE_STEPS`-kommentaren) och skapas i efterhand (`createProof` → `/korrektur/{token}`). Den stoppar inte leverantörsanropet. Återförsäljaren ser egna ordrar, offerter (30 dagar, kundlänk `/offert/{token}`), kunder, statistik, CSV-fakturaunderlag (`invoiceCsv`) och butiken. Menyn visar bara `shopsOwnedBy()[0]`. Statistik 30 dagar: besök, inbäddningar, öppnad motor, ordrar, omsättning (`shop_events` + `shopStats`).

**Före övertagande** landar butiksordrar hos namnskylt.com. Mejlets ”klar att sälja från i dag” stämmer för skyltfönstret, inte för att ordern hamnar hos mottagaren.

### Säljargument som koden bär

- Färdig butik ur deras sajt: logga (upp till 4), färger (upp till 8), typsnitt, kontakt (`buildShop` / `scrapeCompany`).
- Publik, oindexerad demobutik direkt, utan konto.
- White label: kundens UI, flikikon, delningsbild och offert/korrektur bär butikens namn och logga.
- Egen prislista per material, mängdrabatt på hela ordern, Excel-lista med namn (`src/engine/roster.ts`).
- 3D-motor, logogravyr, fästen (nål, magnet, klämma, säkerhetsnål) ur katalogen med leverantörskoder.
- Efter övertagande: egna ordrar, offerter, kunder, statistik, export — isolerat med `reseller_id`.
- Inbäddning på deras befintliga sajt utan att byta domän.
- Tillverkningsspår mot Skylt & Gravyrteknik **för tre material**, med status/webhook (`/api/supplier/webhook`) när API-nyckeln finns.

### Sånt mejlet inte får lova

- ”Svara så ordnar vi domän, priser och ordrar på en dag” — det gör övertagandelänken, utom certifikatet för egen domän.
- Att all gravyr går automatiskt till Skylt & Gravyrteknik.
- Korrektur som spärr innan gravyr, och ”fem arbetsdagar” som SLA (siffran sitter i mock-klienten och i malltexter, inte i leverantörskontraktet).
- Att kunden betalar i butiken, eller att marginalen är ett avtalat inköpspris.
- Att `{slug}.namnskylt.com` fungerar förrän wildcard-DNS och cert är satta. Koden löser värdnamnet; driften gör det inte av sig själv.

### En länk i mejlet → färdig butik och inbjudan

Butiken kan vara publik och inbjudan kan skapas innan Resend finns. Saknas är en serverfunktion utskicket får anropa, och att mejlet innehåller claim-URL:en.

Ny funktion, t.ex. `prepareResellerDemo` i `src/lib/shops/` (anropas av utskicksjobbet, inte av en öppen route):

1. Slå upp befintlig butik på `sourceUrl` (finns inte idag — `buildShop` skapar alltid en ny slug, `-2`, `-3` …).
2. Annars `buildShop(website)`.
3. Återanvänd oanvänd, ogiltig `shop_invites`-rad för samma slug + e-post, annars `createInvite`.
4. Returnera `{ slug, shopUrl: origin + "/butik/" + slug, claimUrl: origin + "/aterforsaljare/" + token, expiresAt }`.

`buildShopEmail` (`ShopEmailInput`) får `claimUrl`. Primär knapp: ”Öppna er butik” → `shopUrl` (redan spårade UTM). Sekundär: ”Ta över butiken” → `claimUrl`. Tredje meningen som ber dem svara för domän/pris/ordrar byts mot vad övertagandet faktiskt ger: prislista, panel, kommande ordrar. Egen domän beskrivs som CNAME + att vi kopplar certifikatet.

Claim-sidan finns och loggar in direkt till `/admin/butiker/{slug}`. Komplettera med att e-posten måste vara inbjudans (idag går valfri adress) innan länken skickas till många.

Tills kassan ska vara öppen i demos: beslutspunkt nedan. Tekniskt räcker en spärr i `POST /api/orders` när `shop` saknar `owner_id`.

## 4. Förberedelser före Resend-kontot

- Bekräfta i drift att `SUPPLIER_API_URL` och `SUPPLIER_API_KEY` är satta. Annars blir butiksordrar tysta mockar.
- Bekräfta wildcard `*.namnskylt.com` och att `SITE_HOSTS` inte sväljer butiksunderadresser (`src/middleware.ts`).
- Förhandsgranska mejlet som i dag: `GET /api/admin/shops/{slug}/email` (kräver ägarkaka). Det anropar `buildShopEmail` och pekar på `/butik/{slug}/mejlbild`.
- Bygg `prepareResellerDemo` + test (ingen riktig sändning): samma hemsida två gånger ger samma slug; inbjudan går ut efter 14 dagar; använd token nekas.
- Lås claim-e-post mot `shop_invites.email`.
- Lägg `claimUrl` i mallen och i `shop-email.test.ts`. `/avregistrera` som mallen länkar till **finns inte**.
- Skriv inte inköpsrabatt åt mottagaren i utskicket. Den är tom tills de själva fyller i `/admin/inkopspriser`.

## 5. Beslut som användaren måste ta

1. Huvudknapp i mejlet: öppna demobutiken, eller ta över den (`/aterforsaljare/{token}`)? Rekommendation: butiken först, övertagande som andra knapp.
2. Får en besökare lägga en riktig order innan återförsäljaren tagit över? Idag ja, och den hamnar hos namnskylt.com.
3. Vilka material får utlovas som automatisk gravyr hos Skylt & Gravyrteknik? Koden skickar bara borstad aluminium, rostfritt och gravyrplast dit.
4. Är riktpriset (`engine/pricing.ts`) det pris vi står för mot återförsäljaren, eller ska utskicket vänta på leverantörens prislista? Inköpsrabatten är självinmatad och påverkar inte leverantörsanropet.
5. Ska första mejlet lova egen domän? Appen sparar värdnamnet; certifikat och CNAME är manuella.

## 6. Risker och hur de hanteras

- **Tysta mockordrar** om leverantörsnyckeln saknas, och butikskunden ser det inte. Skicka inte utskick mot en miljö utan `supplierApiConfigured()`, eller visa samma testvarning i butikskassan.
- **Dubblettbutiker** vid omsändning. Slå upp `data->>'sourceUrl'` innan `createShop`.
- **Vidarebefordrad inbjudan.** Lås e-post, engångstoken, 14 dagar, rate limit 20/timme per token (finns). Ogiltigförklara äldre olåsta inbjudningar för samma slug när en ny skapas.
- **Överlöften i malltexter** (`page-templates.ts` FAQ: korrektur före gravyr, fem dagar, ”graveras i Sverige” för alla material). Mejlet får bara upprepa det orderflödet gör. Malltexterna bör rättas innan många butiker går live — separat från utskicket men synligt för mottagaren som klickar in.
- **Gemensam sessionsnyckel.** Byte av `RESELLER_PASSWORD` loggar ut ägare och alla återförsäljare (`session.ts`).
- **Ingen betalning och ingen avräkning.** Återförsäljaren fakturerar kunden (CSV). Vi har inget flöde där de betalar oss inköpet. Bjud inte in många förrän beslut 4 är fattat.
- **Menyn visar en butik.** `ownedShops[0]`. Ett konto kan äga flera (`acceptInvite` till befintlig e-post). Första vågen: en butik per e-post.

## 7. Beroenden till andra planområden (01–16)

Numreringen av de andra planerna ligger inte i repot. Ämnena:

- **Utskick / Resend / mock-sändare:** ska anropa `prepareResellerDemo` och skicka `shopUrl` + `claimUrl`. Inte bygga en egen butik.
- **Mejlmall:** äger inte plattformen men måste ändra `src/lib/outreach/shop-email.ts` enligt avsnitt 3. Avregistreringslänken `/avregistrera?butik=` saknar route.
- **Leadlista:** varje rad behöver hemside-URL (annars kan `buildShop` inte köras) och en e-post som blir `shop_invites.email`.
- **Avsändarprofil:** `getCompanyProfile("namnskylt")` är signaturen i mejlet (namn, telefon, e-post, adress).
- **Juridik / villkor:** priset är indikativt, korrektur spärrar inte produktion, fyra material är partnerförfrågan, ingen kortbetalning. Det måste styra vad mallen får säga.
- **Domän och drift:** wildcard, `butiker.namnskylt.com` som CNAME-mål, Railway-cert, `SITE_HOSTS`, `DATABASE_URL`, `RESELLER_PASSWORD`, `SUPPLIER_API_*`.
- **Varumärkesskrapa (`src/lib/brand/`, `src/lib/company/scrape`):** butikens kvalitet i mejlbilden (`/butik/{slug}/mejlbild`) står och faller med den. Dålig skrapning ger ett svagt mejl — inte ett skäl att lova en annan butik.
