# Namnskylt — kontext för Claude Code

Webbshop för graverade namnskyltar, med egen skyltmotor, butiker åt återförsäljare och
ett utskickssystem som värvar återförsäljare. Tillverkningen sker hos Skylt & Gravyrteknik.
UI-text och kommentarer är på svenska, identifierare på engelska.

## Projektets regler (gäller alltid)

Reglerna ligger kvar i `.cursor/rules/` så att Cursor och Claude Code läser samma filer.

@.cursor/rules/project-standards.mdc
@.cursor/rules/project-structure.mdc

Läs dessa när du arbetar i respektive område:

- `src/engine/**`: @.cursor/rules/engine.mdc
- `src/**/*.tsx`: @.cursor/rules/react-components.mdc
- `src/**/*.css` och `*.tsx`: @.cursor/rules/styling.mdc

## Hårda gränser

- **Committa, pusha eller deploya aldrig** utan att användaren ber om det. Det finns mycket
  ocommittat arbete. Kör aldrig `git checkout -- <fil>`, `git stash`, `reset` eller `clean`.
- **Skicka aldrig mejl.** `RESEND_API_KEY` ska vara tom tills användaren säger annat.
  Utskicket står i `dry_run` och är pausat.
- **Kunddata stannar utanför repot.** Kundlistan (`PROFIL KUNDER 2026.xlsx`) ligger i iCloud
  och läses via `OUTREACH_LEADS_FILE`. Skriv aldrig namn eller adresser i loggar, svar eller
  commits. Filer med kundnamn hör hemma i `tmp/` (gitignorerad och dockerignorerad).
- **Port 3100 är användarens andra projekt (Merchin).** Stäng den inte. `pnpm dev` och
  `pnpm start` använder också 3100 och krockar därför lokalt. Kör Namnskylt med
  `INTERNAL_PORT=3123 pnpm exec next dev -p 3123`. Utan `INTERNAL_PORT` anropar middleware
  port 3100, alltså Merchin, när den slår upp butiksdomäner. Ändra inte porten i `start`,
  eftersom driften använder den.
- **Skriv inte in adminlösenordet i en webbläsare.** Behöver du logga in i ett skript, läs
  `RESELLER_PASSWORD` ur `.env.local` och anropa `POST /api/admin/session` med `{ password }`.
- **Inköpspriser och provision lämnar aldrig servern** annat än till rätt part. Se avsnitten
  Prismodellen och Inlogg.
- **Tillämpade migreringar** i `src/lib/db/migrations.ts` ändras aldrig. Lägg till en ny.
- **AI-bilder kostar pengar.** Kör inte `pnpm outreach:prepare` utan att fråga, eftersom det
  gör en bildgenerering per kund.

## Stack och kommandon

Next.js 15 (App Router), React 19, TypeScript strict, CSS Modules, three / @react-three/fiber,
motion, zod 4, `postgres`, sharp, `@resvg/resvg-js`, `playwright-core` (Chrome), OpenAI, pnpm 9,
Node 20. Tester körs med `node:test` via tsx.

```bash
# Kvalitetsgrinden. Kör den innan något lämnas (698 tester, grönt 2026-11-14).
rm -rf .next/types && pnpm typecheck && pnpm lint && \
  DATABASE_URL="$(rg -o '^DATABASE_URL=(.*)' -r '$1' .env.local)" pnpm test && pnpm build

pnpm db:migrate              # migreringar mot DATABASE_URL (lokal Postgres på localhost:5435)
pnpm outreach:import         # läser kundlistan till outreach_leads
pnpm outreach:prepare --wave A [--lead <uuid>] [--no-persona|--redo-persona]
pnpm outreach:preview        # skriver mejlexempel till tmp/outreach-preview/
pnpm outreach:tick           # en körning av sändningskön (dry-run utan Resend-nyckel)
pnpm reseller:create <id> "<namn>" <e-post> [lösenord]
pnpm shops:build <sajter.json> <resultat.json> [parallellt]
pnpm dlx knip                # oanvänd kod, ska bara visa avsiktliga träffar
```

- **Drift:** Railway (projektet `namnskylt`, tjänsten `namnskylt`) bygger och deployar `main`
  automatiskt vid push. `railway deployment list --service namnskylt` visar läget. Sajten svarar
  på `www.namnskylt.com` (`namnskylt.com` omdirigerar dit) och är låst med sajtlösenordet.
- Skript körs med `tsx --conditions=react-server --env-file-if-exists=.env.local` (redan
  inbakat i `package.json`), så att `server-only`-moduler går att importera.
- `pnpm test` hittar bara tester i `src/engine/*.test.ts` och `src/lib/<domän>/*.test.ts`. Den kör
  också med `--conditions=react-server`, så att tester kan importera `server-only`-moduler.
- Lagergränserna kontrolleras av `pnpm lint` via `.eslintrc.js` (`FEATURE_DEPENDENCIES`).
- Alla miljövariabler beskrivs i `.env.example`.
- psql: `-Atc` med flera satser visar bara sista resultatet, så kör en fråga i taget.

## Kodbasen

| Mapp | Innehåll |
| --- | --- |
| `src/engine/` | Skyltmotorn: `BadgeDocument` i mm, layout, gravyrkonturer, SVG, katalog med leverantörens koder, pris. |
| `src/lib/ai/` | OpenAI-klient, bildredigering, bärarens kön och ålder ur namnet, fotokontroll, varumärkesläsning, hastighetsgränser. |
| `src/lib/brand/` | Läser kunders hemsidor (färger, typsnitt, logga) med SSRF-skydd (`safe-fetch`, `ip`) och Chrome-reserv (`render`). |
| `src/lib/shops/` | Butiker åt återförsäljare: modell, innehållsblock, sidmallar, AI-redigering, domäner. |
| `src/lib/orders/`, `quotes/`, `production/` | Ordrar, offerter och korrektur, verkstadens arkpackning. |
| `src/lib/supplier/` | Kontraktet mot Skylt & Gravyrteknik: `map.ts` (skylt → deras dokument), `client.ts` (mock utan nyckel), statuswebhook. |
| `src/lib/outreach/` | Utskicket till återförsäljare (se nedan). 42 filer i en platt mapp, vilket är känd skuld. |
| `src/lib/email/` | Transport: `ResendEmailSender` och `MockEmailSender`, som skriver `.eml` till `tmp/outreach-outbox`. |
| `src/lib/format/` | `formatSek`, `formatDate`, `formatDay`, `formatRelative` (Europe/Stockholm). |
| `src/features/` | En mapp per vy: designer (3D), shop, shop-editor, admin, outreach, outreach-landing m.fl. |
| `src/app/` | Routes. Publika vägar är svenska (`/skapa`, `/butik`, `/for/[token]`), API-vägar engelska. |
| `scripts/` | Kommandoradsverktyg, namngivna `<område>-<verb>.ts`. |
| `docs/aterforsaljar-utskick/` | `MASTERPLAN.md`, 16 delplaner, `00-KONTEXT.md`, `01-KUNDLISTA.md`, intresseavvägning. |

## Sortimentet — läge 2026-11-13

Sajten säljer graverade skyltar i metall (Premium) och plast (Standard).

- **Material:** bara material med `offered: true` i `src/engine/catalog.ts` går att välja.
  - `metal`: tre ytor, `metal-white` (lackad), `metal-gold` och `metal-silver` (borstade).
    Färdiga ämnen (`precut`), så verkstaden graverar bara.
  - `plastic`: tvålagers gravyrplast 1,5 mm (verkstadens kod `plastic-1.5mm`) i vit/svart,
    svart/vit, guld/svart och silver/svart. Skärs ur ark och får därför ha egen form (`customShape`).
- **Ämnen:** `BLANKS` har fyra färdiga former med fast mått: rektangel, oval, stor rektangel
  och kudde (formen `cushion`, en superellips). De gäller både metall och plast.
- **Egen form** (bara plast, tillägg i prismodellen): `shape: "custom"` med `customOutline`,
  hörnpunkter i mm inom måttet, högst 120 × 120 mm och 64 punkter, rundade med `cornerRadiusMm`.
  - Geometrin ligger i `src/engine/custom-outline.ts`: kontroller (självkorsning, kortaste kant,
    minsta yta), rundning, indragning och textytan i former med inbuktningar (`clearHalfWidth`).
  - Formförslagen ligger i `src/engine/shape-presets.ts`.
  - Ritverktyget ligger i `src/features/designer/custom-shape/`: formförslag, punkter som dras,
    mått och rundning, och uppladdning av SVG, PNG, JPG eller PDF som spåras till en kontur
    (`src/engine/outline-trace.ts`, `outline-edit.ts`). Valet "Egen form" visas bara på material
    med `customShape`.
  - PDF läses med `pdfjs-dist`, låst till `~5.4.624` eftersom nyare kräver Node 22. Bara första
    sidan läses.
  - Kända brister: bara provat i Chrome; en ritad form försvinner om kunden väljer ett ämne och
    sedan "Egen form" igen; fästena i 3D skalar med skylten och blir för stora på en form på
    120 mm (`three/mounting.tsx`, `src/engine/hardware-fit.ts`).
- **Loggan** graveras eller trycks, och det avgörs automatiskt när filen laddas upp eller hämtas
  från hemsidan (beslut av ägaren 2026-11-13, gäller både metall och plast):
  - En **svartvit** logga spåras till banor (`BadgeLogo.d`) och graveras i textens färg, som förut.
  - En logga **i färg** får dessutom `BadgeLogo.image` och trycks som den är i filen. Texten
    graveras fortfarande. Kunden kan inte välja själv; "Invertera" finns bara för graverade loggor.
  - Reglerna ligger i `src/engine/logo-color.ts`: bilden är i färg när minst 1 % av det som syns
    har färg (`hasColor`). En vit botten tas bort (`withoutWhiteBackground`), även vitt inuti
    loggan; en färgad botten hör till loggan och behålls. Bilden beskärs till det som syns.
  - Webbläsaren gör bilden (`src/features/designer/logo/trace-image.ts`): högst 640 px på längsta
    sidan och högst `LOGO_LIMITS.maxImageChars` tecken, annars krymps den. En SVG blir alltså
    en PNG.
  - **Bilden sparas en gång på servern**, i tabellen `logo_images` (migrering 018) under sin
    SHA-256, och skylten bär bara adressen: `image.src` är `/api/logo-images/<sha256>`
    (`logoImageRef`, `LOGO_IMAGE_REF_PATTERN`). Skyltmotorn laddar upp bilden direkt när loggan
    väljs (`POST /api/logo-images`). Går det inte, till exempel utan databas, ligger bilden kvar i
    skylten som `data:image/png;base64,…` (`LOGO_IMAGE_PATTERN`). Schemat släpper bara igenom de
    två formerna.
  - Koden ligger i `src/lib/logo-images/`. `withStoredLogoImages` flyttar en bild som ligger i
    skylten till lagret när en order, offert eller mall sparas. `withInlineLogoImages` lägger
    tillbaka bilden där servern ritar utan webbläsare eller skickar skylten vidare: delningsbilden
    och AI-bilden (resvg), offertens PDF och verkstadens underlag. `missingLogoImages` stoppar en
    order eller offert som pekar på en bild som inte finns.
  - `GET /api/logo-images/<id>` är öppen förbi sajtspärren (`src/middleware.ts`), eftersom bilden
    visas i panelen, på offerter och på korrektur, som själva är öppna utan sajtkoden.
    Uppladdningen är låst som övriga API:er.
  - En tryckt logga finns inte bland gravyrens banor (`engravingPaths`), alltså inte i 3D-fräsningen,
    produktionsfilen eller maskinfilerna. Förhandsvisningen ritar bilden (`renderBadgeSvg`, bara
    `preview`), 3D-vyn lägger den som en yta i loggans egen form på framsidan
    (`three/logo-print.tsx`; en rektangel med genomskinliga delar syns som en ruta i fotoläget),
    och verkstadens arkvy visar siluetten som hjälplinje. Leverantören får ett bildlager med
    `renderMode: "print"`.
  - En delad länk behåller en logga i färg som ligger på servern. Är siluetten för lång för länken
    byts den mot bildens ruta (`encodeShareCode`); en graverad logga med mycket detaljer tappas
    fortfarande ur länken.
  - Priset är samma som för en graverad logga ("extra gravyr eller print").
  - Kända brister: bilder tas aldrig bort ur `logo_images`, även när ingen skylt pekar på dem
    längre. Mjuka, halvgenomskinliga kanter i en logga (en skugga eller ett sken) klipps i 3D-vyn,
    eftersom ytan följer siluetten; ritningen visar hela bilden.
- **Äldre material och former** (mässing, akryl, epoxy, gravyrplast, sexkant m.fl.) ligger kvar
  i motorn så att sparade ordrar, offerter och butiker går att rita. En äldre skylt som öppnas
  i designern flyttas till närmaste yta och ämne (`toOfferedDocument`).
- **Orderspärr:** en order eller offert får bara innehålla skyltar i dagens sortiment
  (`isOfferedDocument`, `allOffered` i `src/lib/orders/model.ts`). Spärren sitter i de tre
  API-vägarna, i "Beställ igen", ny personal, mallar och offertgodkännande, och sist i
  `placeOrder`. En äldre order går alltså inte att upprepa utan att skylten görs om.
- **Pris:** se avsnittet Prismodellen. Alla fyra ämnen kostar lika.
- **Verkstaden:** metallskylten har `precut: true` och produktionsmetoden `blank`. Ämnena läggs
  med gods emellan och bara skyltens text graveras. Ämnets kant och rubrikerna är hjälplinjer
  (`guide`) som syns på skärm och korrektur men aldrig skrivs till maskinfilerna.
- **Inspirationsbanken** har fyra exempel, alla i dagens sortiment, med nya skyltbilder från
  fotoläget. Bilderna för de fyra borttagna exemplen ligger kvar i `public/inspiration/`.
- **Preliminärt tills verkstaden bekräftat:**
  - Ämnenas mått (75×25, 70×40, 75×45 och 75×35 mm) är uppskattade från foton.
  - Artikelkoden `namnskylt-metall`, tjockleken 0,5 mm och priset 89 kr är antaganden.
  - Gravyren visas svart på alla tre ytor.
  - Kuddens exponent (`CUSHION_EXPONENT`) är uppskattad från foto.
  - Avståndet mellan ämnena i fixturen (`BLANK_GAP_MM`, 4 mm) och att rubrikerna inte graveras.
  - Att verkstaden kan trycka i färg på både metall och plast, och vilken tryckfil den behöver.
    I dag finns bara bilden på 640 px; originalfilen sparas inte.

## Prismodellen — läge 2026-11-14

Alla priser kommer ur en prismodell (`PriceModel` i `src/engine/price-model.ts`) som ägaren ändrar
i `/admin/prismodell`. Den sparas i `settings` under nyckeln `price_model`; utan sparad modell
gäller `DEFAULT_PRICE_MODEL`, som är kalkylen från 2026-11-13.

- **Tre parter:** tabellen anger vad återförsäljaren betalar. Provisionen är plattformens andel
  av det beloppet och resten går till Skylt & Gravyrteknik. Slutkundens pris är återförsäljarens
  pris delat med (1 − marginalen), alltså marginal och inte påslag.
- **Provisionen gäller allt återförsäljaren betalar**: skyltar, fästen, tillval, startkostnad och
  minidebitering. `partShare` och `itemBreakdown` i `price-model.ts` delar upp ett pris eller en
  orderrad per del. Provisionen har ören, även på ordern (`provisionSplit`).
- **Provisionen räknas steg för steg** (beslut av ägaren 2026-11-14): varje trappstegs procent
  gäller bara skyltarna inom steget. En order på 350 skyltar ger 15 % på de första 100, 12 % på
  nästa 200 och 10 % på de sista 50, alltså 12,57 % på hela beloppet (`tierCounts`,
  `provisionPercentFor`). Förut gällde orderns trappsteg hela ordern, så 101 skyltar gav 12 % på
  allt. Priset per skylt följer däremot fortfarande orderns trappsteg för alla skyltar. Därför ger
  101 skyltar ändå lite lägre provision än 100 (1 134 mot 1 200 kr för Premium med nål), eftersom
  priset sjunker på hela ordern. Regeln gäller alla ordrar, även redan lagda, eftersom
  provisionen räknas när den visas och inte sparas.
- **Återförsäljarens belopp får ha ören, slutkundens är hela kronor** (2026-11-14). Priserna i
  modellen (skyltar, fästen, tillval, startkostnad, minidebitering) får ha två decimaler, så att
  verkstadens netto går att träffa exakt: 72,94 kr ger 62,00 kr vid 15 %. Återförsäljarens lista
  bär `ore: true`, och summor avrundas med `toOre`. Slutkundens priser avrundas som förut till
  hela kronor per del (`endPriceSek`), och slutkundens minsta order är ett heltal, eftersom
  `orders.total_sek` är ett heltal. `formatSek` visar två decimaler bara när beloppet har ören.
- **Sidan `/admin/prismodell`** (`src/features/admin/price-model/`) har samma kolumner i alla
  tabeller: trappsteg och provision, skyltar, tillbehör och tillval. Under varje pris står
  Skylt & Gravyrs netto, provisionen och slutkundens pris per trappsteg. "Vid order" är en
  kalkyl med summor och en specifikation per skylt. Mats på Skylt & Gravyrteknik använder sidan.
  - Fälten är textfält (`number-field.tsx`), så att decimaler går att skriva med komma eller punkt.
  - Under ett pris står två belopp när provisionen skiljer inom trappsteget: stegets första och
    sista antal (`provisionPercentRange`). Raden "På hela ordern" visar samma sak i procent.
  - Kalkylen har fästet "Utan" (`PriceItem.mounting: null`), så att skyltens egna siffror syns för
    sig. Det går inte att beställa en skylt utan fäste.
- **Startkostnaden** (`startSek`, 200 kr i kalkylen, ändras uppe till höger i kortet "Trappsteg
  och provision") är en egen avgift per order, skild från minidebiteringen. Den **fördelas på
  orderns skyltar** och ingår i priset per skylt: 200 kr på 4 skyltar lägger 50 kr på varje
  (`startShareSek` i `pricing.ts`). Den följer samma kedja som övriga priser: slutkunden betalar
  den med marginalen (333 kr) och provisionen gäller den. Delen per skylt avrundas till hela
  kronor för slutkunden, så orderns summa kan skilja några kronor från startkostnaden, och över
  666 skyltar blir den 0 kr. Återförsäljarens del avrundas till ören. "Från"-priser och
  exempelpriser visas utan startkostnad (`fromPriceSek`, `withoutStartCost`), eftersom den beror
  på antalet.
- **Trappsteg** på orderns totala antal: 1–100, 101–300, 301–500 och 501 eller fler.
- **Per skylt:** skylttypens pris (Premium = metall, Standard = plast, `priceClass` i katalogen),
  ett fäste (nål, klämma eller magnet), loggan som "extra gravyr" och skyltens del av
  startkostnaden. Textrader och ram ingår. Slutkundens delar avrundas var för sig till hela kronor.
- **Skyltmotorn visar inget pris på fästena**, eftersom priset beror på orderns antal. I stället
  står en specifikation per skylt bredvid antal och pris (`order-section.tsx`): skylten, fästet,
  loggan, egen form och startkostnaden, som summerar till priset per skylt (`badgePriceParts` i
  motorn, `shopPriceParts` med butikens påslag). "Egen form" visar fortfarande sitt tillägg i
  formväljaren, och materialen sitt från-pris.
- **Fästen och tillval har ett pris per trappsteg**, precis som skyltarna (`PriceOptions` är
  `Record<PriceOptionId, number[]>`; läs med `optionPriceSek` och `mountingPriceSek` och ange
  trappsteget). I kalkylen är priset samma på alla trappsteg.
- **Minsta ordervärde** gäller både det återförsäljaren betalar och det slutkunden betalar, och
  räknas på summan med startkostnaden inräknad.
- **Hela modellen stannar på servern.** Den innehåller provisionen. Ut går bara prislistor
  (`PriceTable`) per part: `endPriceTable(model)` är det slutkunden betalar och
  `resellerPriceTable(model)` det återförsäljaren betalar. Ingen av dem innehåller provision
  eller marginal. Provisionen räknas med `provisionSplit(model, …)` och visas bara för admin.
- **Motorn är delad i två filer.** `src/engine/pricing.ts` räknar ur en `PriceTable` och får
  användas överallt. `src/engine/price-model.ts` har modellen, dess schema, `endPriceTable`,
  `resellerPriceTable` och `provisionSplit`. Den exporteras inte från `@/engine` och importeras
  bara av filer med `import "server-only"` eller `"use server"`, av sidor, layouter och API-vägar
  under `src/app`, och av adminverktyget `price-model-editor.tsx`.
- **Ordet "provision" får inte finnas i kod som en besökare eller återförsäljare laddar**, varken
  som fältnamn eller text. Adminverktyget laddas därför separat (`price-model-editor-lazy.tsx`),
  panelens meny byggs på servern (`adminNav` i `src/features/admin/nav.ts`), och
  serverkomponenter som nämner provisionen märks med `import "server-only"`. Undvik ordet i
  CSS-klassnamn och filnamn på CSS-moduler, eftersom de syns i byggets CSS.
- **Ingen funktion räknar pris utan en prislista.** `priceOrder`, `lineUnitPrices`, `priceBadge`,
  `resellerOrder` och `priceWithPricing` tar en `PriceTable`. Klientkomponenter läser slutkundens
  lista med `usePriceList()` (`PriceListProvider` i rotlayouten); serverkod anropar `getPriceModel()`.
- **Kalkylens siffror** (`DEFAULT_PRICE_MODEL`) ligger i `src/engine/default-price-model.ts`, som
  inte exporteras från `@/engine`. Bara filer med `import "server-only"`, skript och tester får
  importera den, annars bakas inköpspriser och provision in i webbläsarens JavaScript.
  `src/lib/orders/price-lists.test.ts` vaktar alla tre reglerna ovan.
- **Ordrar och offerter sparar modellen** de skapades med (`price_model`, migrering 016) och
  räknas alltid med den. En ändring i admin rör aldrig befintliga ordrar. Rader från före
  migreringen saknar modell och räknas med dagens. En modell sparad före startkostnaden har ett
  enda pris per tillval och saknar `startSek`; `parseStoredPriceModel` läser den som samma pris
  på alla trappsteg och startkostnad 0, så att priserna står kvar. Migrering 017 satte
  startkostnaden till 200 kr i den sparade modellen i `settings`. När raden läses blir modellen prislistor
  (`priceListsFor` i `src/lib/orders/price-lists.ts`): `priceList` följer alltid med,
  `purchaseList` bara när raden läses åt den inloggade återförsäljaren (`"reseller"`), aldrig
  via kundens hemliga länk (`"customer"`).
- **Återförsäljaren** ser sina inköpspriser i `/admin/inkopspriser` (samma tabell, bara läsning).
  Den gamla inköpsrabatten i procent finns inte längre. Admin når sidan från Prismodell.
- "Egen design 12 × 12 cm" läggs på varje skylt med egen form. Säkerhetsnålen säljs inte; en
  äldre skylt med den prissätts som nål.
- Kalkylens "militärklämma" är sajtens fäste "Klämma" (bekräftat av ägaren 2026-11-13).

## Inlogg — läge 2026-11-13

Panelen ligger under `/admin` för båda parter, men det finns två skilda inlogg:

- **Admin** (namnskylt.com): `/admin`, bara lösenord (`RESELLER_PASSWORD`), `POST /api/admin/session`
  med `{ password }`. Ger hyresgästen `namnskylt` (`OWNER_TENANT`, `isOwner`). Variabelnamnet är
  historiskt; lösenordet signerar också återförsäljarnas kakor.
- **Återförsäljare**: `/aterforsaljare`, e-post och lösenord (`reseller_accounts`),
  `POST /api/reseller/session`. Kontot skapas via inbjudan (`/aterforsaljare/[token]`) eller
  `pnpm reseller:create`.
- Vägarna tar bara emot sina egna fält (`z.strictObject`), så det ena formuläret kan aldrig ge det
  andra inlogget. `authenticate` och `createAccount` vägrar ägarens id.
- Formuläret är `LoginForm` (`kind: "admin" | "reseller"`) i `src/features/admin/login-form.tsx`.
  Sajtens meny länkar "Logga in" till `/aterforsaljare` och visar "Admin" eller "Mina sidor".
- **Bara admin** ser Butiker, Utskick, Prismodell och Provision (sidor, actions och API-vägar
  kontrollerar `isOwner`). Varje adminsida kontrollerar inloggningen själv med `adminTenant()`.
- **Provision** (`/admin/provision`) är adminens samlade vy över återförsäljarnas ordrar: vad
  återförsäljaren betalar, provisionen och verkstadens del, per order och per återförsäljare
  (rena regler i `src/lib/orders/provision.ts`, frågan i `provision-store.ts`). Ägarens egna
  ordrar, demoordrar och avbrutna ordrar är inte med. Vyn saknar periodfilter och länk till
  orderns detaljer, och läser alla ordrar varje gång, vilket håller så länge de är få. Under
  Ordrar ser admin fortfarande bara ordrar under hyresgästen `namnskylt`.
- `next dev` skickar med serverns mellanresultat som felsökningsdata i sidan (React), så där syns
  hela prismodellen i sidkällan. Kontrollera läckor mot `next build` + `next start`.

## AI i produkten

Alla anrop går via `openai()` i `src/lib/ai/openai.ts`. Den returnerar `null` utan
`OPENAI_API_KEY`, och då stängs funktionen av.

- **Modeller:** `gpt-image-2` för bilder (`editImage`), `gpt-5.4-mini` (`VISION_MODEL`) för text och syn.
- **Användning:**
  - `guessWearer` gissar personens kön och ålder ur namnet.
  - `describeCompany` och `readBrand` beskriver ett företag ur dess hemsida.
  - `checkPhoto` avgör om ett uppladdat foto går att använda.
  - `editShopContentWithAi` är butiksredigerarens chatt.
  - Persona-bilden i utskicket görs av `companyWorkplace` och `generatePersona` i `src/lib/outreach/persona.ts`.
- **Persona-flödet:** hemsidan läses, en lämplig arbetsmiljö väljs, och den renderade skylten
  med kundens logga och **bara förnamnet** skickas som referens till `editImage`. Bilden
  beskärs till 600×750 JPEG på högst 120 kB.
- **Granskning:** en människa måste godkänna varje persona-bild i `/admin/utskick/bilder`.
  Mejlet och landningssidan använder bara persona-bilder med status `approved`; annars visas
  den vanliga skyltbilden. Kolumnen `outreach_assets.review` finns på alla bilder och står
  som `pending` även på skylt- och materialbilderna, men den läses bara för persona-bilder.
  Skylten ritas av motorn och behöver ingen granskning.

## Utskicket till återförsäljare — läge 2026-11-13

Målet är att få befintliga återförsäljare att sälja namnskyltar via plattformen.

**Mejlet:** kort och nyfiket, under 90 ord, med en bild och en knapp till en personlig landningssida
`/for/[token]`. Där finns en demobutik i deras färger och knappen "Aktivera min butik". Bara
svenska kunder får mejl nu. Norsk text (`nb`) saknas, så norska leads blockeras med `["språk"]`.
Exempel finns i `tmp/aterforsaljarmejl-exempel.pdf`.

**Kedjan:**
1. Import till `outreach_leads`.
2. `prepare-demo` skapar demobutik, skylt- och materialbilder och persona-bilden.
3. Operatören godkänner leadet i `/admin/utskick`.
4. `runOutreachTick` skickar, med spärr av den här ordningen: `OUTREACH_DISABLED`, advisory
   lock, paus, sändningsfönster, automatisk paus vid klagomål och studsar, uppvärmning
   (`warmup.ts`), allowlist vecka 0 och en spärrkontroll precis före sändning.
   Ett stoppat lead (`stop_reason` satt) stoppas på tre ställen: `claimNextReady` tar inte
   raden, `reclaimStale` lägger den i `needs_review` i stället för tillbaka i kön, och
   `sendOne` läser om leadet precis före sändning och hoppar över raden.
5. Resends webhook (`/api/outreach/webhook`, Svix) uppdaterar status.

**Status:** Fas 0 (steg 1–13 i `MASTERPLAN.md`) är byggd och körs bara med mock-sändaren.
Våg A har 15 leads: 14 i `draft` och 1 i `in_sequence`. Av dem har 14 en egen butik, och 13
har en persona-bild som väntar på granskning. Ett
`ready`-meddelande ligger i kön, och kontrolläget är `dry_run` och pausat.

**Skylten i utskicket** är sedan 2026-11-13 en metallskylt: mejlbilden är borstat guld på
rektangeln (`HERO_CHOICE`), och landningssidans fyra rutor visar alla former och ytor
(`tileChoices`). Bildtexten läser skyltens mått ur den sparade bilden. De 13 förberedda
bilderna i databasen är däremot **inte omgjorda**: skyltbild, rutor och persona-bild visar
fortfarande gravyrplast. `pnpm outreach:prepare --lead <uuid> --no-persona` ritar om skyltbild
och rutor utan AI-kostnad. Persona-bilderna kräver en ny bildgenerering per kund, och de
gamla ska inte godkännas.

**Öppet innan Fas 1:**
- **Våg A:**
  - Ett långt företagsnamn är rättat i koden men inte omkört.
  - Två företagsnamn förekommer två gånger var (fyra leads). Ett av paren delar webbplats,
    så den andra kontakten fick ingen butik (`shop_slug` är unik per lead). Användaren avgör
    om båda kontakterna i varje par ska ha mejl.
- **Underlag som saknas:**
  - Kampanjens signatur i databasen har platshållare för namn och titel.
    `scripts/outreach-preview.ts:28` har även platshållare för telefon och e-post.
  - Företagsprofilen saknar organisationsnummer.
  - Den norska texten är inte skriven.
- **Beslut för användaren:** de 8 besluten i `MASTERPLAN.md` (avsändare, rättslig grund,
  Norge, påminnelse, marginal, demobutiker, domän `mail.namnskylt.com`, skyltens text).
- **Kostnad:** priset per persona-bild är inte kontrollerat mot OpenAI-kontot.

## Leverantören och systerprojektet

`~/Desktop/Skyltochgravyr/skyltmotor` är Skylt & Gravyrtekniks egen plattform: ett Turborepo
med Prisma, AWS och SST, byggt av samma ägare. Namnskylts katalog (`supplierCode`, färg-id:n)
speglar `packages/catalog` där.

Deras sajt har ännu inget API som tar emot ordrar. Planen för det:
1. En API-nyckel per partnerkonto.
2. `POST /orders` som tar emot vårt `SupplierSignDocument` och skapar en vanlig order.
3. `GET /orders/{nr}`.
4. En signerad statuswebhook till `/api/supplier/webhook`.

Luckor i kontraktet:
- Leveransadress saknas i ordern.
- Metallämnena och kuddformen finns inte i deras katalog. Kudden skickas som rektangel.
- Egen form skickas som deras fria polygon (`shape: "freeform"`, `customShapePoints`), men hos dem
  är den bara tillåten för metallskärning. De behöver öppna den för graverad plast.
- En idempotensnyckel behövs mot dubbla ordrar.
- Fästet skickas som text i stället för artikelkod.
- En logga i färg skickas som bildlager med `renderMode: "print"`. Deras format har läget, men
  ingen har bekräftat att verkstaden trycker namnskyltar eller vilken upplösning som krävs.
- Lambda tar högst 6 MB per anrop.

Det projektet har egna, strikta regler i `Skyltochgravyr/.cursor/rules/`:
- Ändra inget under `skyltmotor/` utan ett uttryckligt ja i samma meddelande.
- Det finns ingen GitHub; "pusha" betyder AWS-deploy där.
- Verkstadskontraktet (arkmått, skär- och gravyrfärger) är låst.

## Känd skuld och granskningsfynd (inte åtgärdat)

**Säkerhet, rapporterat av granskningsagenter och inte verifierat:**
- `src/lib/http/origin.ts` litar på `x-forwarded-host` när länkar med token byggs.
- `src/lib/brand/ip.ts` släpper igenom `2002::/16` (6to4).
- Med sajtlösenordet på öppnar `ns_shop`-kakan alla API:er som inte är undantagna.

**Struktur och kvalitet:**
- Tio tjocka sidor under `src/app/admin/**` och `src/app/offert/[token]`.
- Hex-färger i `admin.module.css` (123) och `editor.module.css` (38).
- 341 filer avviker från Prettier. Formatera i en egen ändring.
- Runt 20 CSS-klasser ser oanvända ut men är inte borttagna, eftersom gränssnittet saknar tester.
- README, licens och CI saknas.

**Säkerhetskopia** från före städningen 2026-11-10: `tmp/backup-fore-stadning.tgz`.
