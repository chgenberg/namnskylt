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
  Utskicket står i `dry_run` och är pausat. Sätt inte heller `NOTICE_FROM_EMAIL`, som slår på
  mejl om besked till återförsäljarna (se avsnittet Besked).
- **Slå aldrig på kopplingen till verkstaden.** `SUPPLIER_API_URL` och `SUPPLIER_API_KEY` ska
  vara tomma i driften tills användaren säger till. Med dem satta skickas varje ny order till
  Skylt & Gravyrteknik, som tillverkar och fakturerar. Se avsnittet Ordern till verkstaden.
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
# Kvalitetsgrinden. Kör den innan något lämnas (808 tester, grönt 2026-11-15).
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
| `src/lib/orders/`, `quotes/`, `production/` | Ordrar (med leveransadress, `delivery.ts`), offerter och korrektur, verkstadens arkpackning. |
| `src/lib/supplier/` | Kontraktet mot Skylt & Gravyrteknik: `types.ts` (kontraktet), `map.ts` (skylt → deras dokument), `request.ts` (hela anropet), `dispatch.ts` (utskicket), `client.ts`, statuswebhook. |
| `src/lib/reseller-auth/` | Återförsäljarnas konton, inlogg, ansökningar (`applications.ts`) och hemliga länkar för att välja lösenord (`access-links.ts`). |
| `src/lib/outreach/` | Utskicket till återförsäljare (se nedan). 42 filer i en platt mapp, vilket är känd skuld. |
| `src/lib/email/` | Transport: `ResendEmailSender` och `MockEmailSender`, som skriver `.eml` till `tmp/outreach-outbox`. |
| `src/lib/notices/` | Besked till panelens ägare när en kund har svarat eller beställt: texter (`model.ts`), lagring, `notify` och mejlet bakom en strömbrytare. |
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
    (`src/engine/outline-trace.ts`, `outline-edit.ts`). Valet "Egen form" går bara att välja på
    material med `customShape`. På metall syns det ändå, streckat och med raden "Endast möjlig
    för plastskyltar", så att ingen missar funktionen (besked via ägaren 2026-11-15,
    `BlankPicker` i `pickers.tsx`).
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
- **Ordval:** sajten säger inte "graverad" om hela sortimentet, eftersom loggor i färg trycks.
  Sajten säger "namnskyltar", "tillverkas", "till tillverkningen" och "Korrektur innan
  produktion" (beslut av ägaren 2026-11-15), även i flikens titel, butikernas sidfot,
  korrekturet, offertens PDF och mallarna för nya butikssidor. Där texten gäller just gravyren
  (skyltens text, "Graverad ram", en graverad logga, exemplen i inspirationsbanken) står ordet
  kvar. Inte ändrat: utskickets mejltext (`src/lib/outreach/copy.ts`) och innehåll som redan är
  sparat i butikerna.
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

## Prismodellen — läge 2026-11-15

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
  666 skyltar blir den 0 kr. Återförsäljarens del avrundas till ören.
  - **Mot kunden står startkostnaden aldrig för sig** (besked via ägaren 2026-11-15): den ligger på
    skyltens pris. I prismodellens exempel på 25 skyltar betalar återförsäljaren 73 + 8 = 81 kr
    för skylten och slutkunden 122 + 13 = 135 kr. `withStartInSign` i `pricing.ts` gör om
    delarna, och skyltmotorns specifikation använder den. Ordet "startkostnad" står inte i
    skyltmotorn, varukorgen eller på företagssidan. Uppdelningen med startkostnaden på egen rad
    finns bara i `/admin/prismodell`. Återförsäljarens inköpsprislista (`/admin/inkopspriser`)
    anger den fortfarande, eftersom en prislista inte kan lägga in den utan ett antal.
  - **Inga "från"-priser** (samma besked): priset per skylt beror på antalet, så materialkorten,
    startdialogen och inspirationsbanken visar inget pris. Företagssidan visar priset per skylt
    vid 10, 50, 100 och 500 skyltar, med startkostnaden inräknad. `withoutStartCost` används
    bara där återförsäljaren ställer in butikens priser.
- **Frakten** (beslut av ägaren 2026-11-14) är Skylt & Gravyrtekniks egen, rakt av: varubrev 75 kr
  för en order med varuvärde upp till 500 kr, annars paket 159 kr (`PriceModel.shipping`,
  `ShippingRule`, kortet "Frakt" i `/admin/prismodell`, hela kronor).
  - Den ligger **utanför kedjan**: ingen provision och ingen marginal, och allt går till
    verkstaden. `provisionSplit` tar därför varuvärdet (`TablePrice.goodsSek`), aldrig summan
    med frakt. `totalSek` är varuvärdet plus frakten, hos båda parter.
  - **Frakten är samma i alla led** (beslut 2026-11-15, besked från Pär via ägaren: "frakt får
    vara fast oavsett led"). Regeln gäller det återförsäljaren betalar verkstaden för varorna
    (`orderShippingSek` i `price-model.ts`), och kunden betalar samma belopp. Förut räknade varje
    part på sitt eget varuvärde, och då betalade kunden 159 kr och återförsäljaren 75 kr på små
    ordrar (2–5 skyltar beroende på skylttyp), så att återförsäljaren behöll 84 kr.
  - **Slutkundens prislista har ingen fraktregel**, bara återförsäljarens. `priceOrder`,
    `priceWithPricing` och `shopPrice` tar frakten som ett belopp, och det kommer från ett av
    fyra ställen:
    - en sparad order eller offert bär den (`shippingSek`, ur `priceListsFor`), även när raden
      läses åt kunden,
    - servern räknar den för en ny order eller offert (`shippingFor` i `price-lists.ts`),
    - en inloggad återförsäljare räknar den ur sin inköpslista,
    - kundens webbläsare frågar `POST /api/shipping` (`useOrderShipping` i `src/hooks/`), som
      får skyltarnas typ och antal och bara svarar med beloppet. Skyltmotorn frågar först när
      kassan öppnas. Uteblir svaret står frakten som "tillkommer".
  - **Frakten blandas aldrig med styckpriset** (besked via ägaren 2026-11-15). Priset bredvid
    antalet i skyltmotorn är skyltarna, "exkl. moms och frakt". Frakten visas först i kassan,
    alltså i beställningsformuläret och i återförsäljarens leveranssteg, på en egen rad med
    summan under (`OrderTotals` i `order-section.tsx`). Återförsäljarens inköp, kundpris och
    marginal i skyltmotorn är också utan frakt.
  - **Leveranssättet väljs i kassan** (beslut av ägaren 2026-11-15, samma val som i verkstadens
    egen kassa): `standard` följer fraktregeln, `pickup` är "Hämta i Högsbo" utan frakt och
    `express` är PostNord Express, där verkstaden sätter priset i efterhand, så ordern har ingen
    frakt när den läggs (`SHIPPING_METHODS`, `withShippingMethod` i `pricing.ts`).
    - Valet ligger på leveransen (`Delivery.method` i `delivery.ts`, i JSON-kolumnen `delivery`,
      ingen migrering). En leverans utan det har standardfrakt (`shippingMethodOf`).
    - `priceListsFor` tar fraktsättet och ger både frakten och en inköpslista utan fraktregel
      när frakten inte följer den. Allt som räknas ur radens inköpslista får därför rätt frakt.
    - Väljaren är `ShippingMethodPicker` (`src/components/`). Den finns i skyltmotorns kassa,
      i återförsäljarens leveranssteg och i `DeliveryPanel` på order och offert. Ändras
      leveranssättet där räknas radens summa om (`updateOrderDelivery`, `updateQuoteDelivery`).
    - I en återförsäljares butik visas inte upphämtningen, eftersom den pekar ut verkstadens
      adress för butikens kund. `POST /api/orders` nekar den också där.
    - Offerten och dess PDF visar "Frakt, express: tillkommer" eller "Frakt, hämtas: 0 kr"
      (`shippingNote`), utan verkstadens namn. Fraktsättet följer med från offert till order, och
      "Beställ igen" och "Ny personal" ärver det.
    - Verkstaden får koderna `postnord-express` och `pickup-hogsbo`, utan fraktkostnad.
    - Kända brister: expressfrakten läggs inte in av sig själv när verkstaden har satt priset,
      utan får läggas som en extrarad på ordern. Upphämtning kräver fortfarande en ifylld
      adress. Kunden kan inte välja leveranssätt när en offert godkänns; återförsäljaren sätter
      det på offerten.
  - Frakten beror bara på skyltarna. Återförsäljarens egna priser, rabatter och extrarader och
    butikens påslag ändrar den inte. Den visas som egen rad på offert, PDF, ordersida och
    fakturaunderlag.
  - Regeln gäller alla ordrar och offerter med frakt, även redan sparade, eftersom frakten räknas
    när raden läses. Den sparade summan (`total_sek`, som listor och statistik visar) räknas
    däremot inte om förrän priset sparas igen.
  - En modell sparad före frakten läses utan frakt (`NO_SHIPPING`), så äldre ordrar och offerter
    behåller sina summor. Migrering 019 lade frakten i den sparade modellen i `settings`.
  - Känd följd: kunden ser var frakten slår om från 75 till 159 kr. Den som känner verkstadens
    gräns på 500 kr kan därur gissa ungefär vad återförsäljaren betalar. Därför svarar servern
    bara med beloppet, och frågan har en gräns per klient.
- **Trappsteg** på orderns totala antal: 1–100, 101–300, 301–500 och 501 eller fler.
- **Per skylt:** skylttypens pris (Premium = metall, Standard = plast, `priceClass` i katalogen),
  ett fäste (nål, klämma eller magnet), loggan som "extra gravyr" och skyltens del av
  startkostnaden. Textrader och ram ingår. Slutkundens delar avrundas var för sig till hela kronor.
- **Skyltmotorn visar inget pris på fästena**, eftersom priset beror på orderns antal. I stället
  står en specifikation per skylt bredvid antal och pris (`order-section.tsx`): skylten (med
  startkostnaden i), fästet, loggan och egen form, som summerar till priset per skylt
  (`badgePriceParts` i motorn, `shopPriceParts` med butikens påslag, `withStartInSign`).
  "Egen form" visar fortfarande sitt tillägg i formväljaren. Materialen visar inget pris.
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

## Inlogg — läge 2026-11-14

Panelen ligger under `/admin` för båda parter, men det finns två skilda inlogg:

- **Admin** (namnskylt.com): `/admin`, bara lösenord (`RESELLER_PASSWORD`), `POST /api/admin/session`
  med `{ password }`. Ger hyresgästen `namnskylt` (`OWNER_TENANT`, `isOwner`). Variabelnamnet är
  historiskt; lösenordet signerar också återförsäljarnas kakor.
- **Återförsäljare**: `/aterforsaljare`, e-post och lösenord (`reseller_accounts`),
  `POST /api/reseller/session`. Kontot skapas via en godkänd ansökan (nedan), via en
  butiksinbjudan (`/aterforsaljare/[token]`) eller med `pnpm reseller:create`.
- **Ansökan som admin godkänner** (beslut av ägaren 2026-11-14, migrering 021):
  - Ett företag ansöker på `/aterforsaljare/ansok` (öppen förbi sajtspärren). Sidan heter
    "Skapa konto" och har samma rubriker och fält som när ett företag skapar konto hos
    Skylt & Gravyrteknik (besked via ägaren 2026-11-15): Företagsinformation, Faktureringsadress
    med adressrad 2 och e-post för faktura, Leveransadress ("Samma som faktureringsadressen")
    och Kontaktinformation (`reseller_applications`, `resellerApplicationSchema`, migrering 023
    för `invoice_email` och `delivery`). Godkännandet är kvar; lösenordet väljs via länken.
    E-posten för faktura blir `CompanyProfile.invoiceEmail`, som verkstadens faktura går till
    (`supplierBuyer`), och leveransadressen blir den som fylls i för "Till oss". Formuläret begränsas per klient och har ett dolt robotfält.
    En ny ansökan med samma e-post skriver över den som väntar.
  - Admin godkänner eller avslår under `/admin/aterforsaljare`. Godkännandet ger en länk
    (`/aterforsaljare/konto/<kod>`, 14 dagar) som admin kopierar eller mejlar själv, eftersom
    sajten inte skickar mejl än. Länken visas en gång; i databasen ligger bara dess SHA-256
    (`reseller_access_links`).
  - Kontot skapas först när den sökande väljer lösenord. Då blir ansökans uppgifter företagets
    (`company_profile`), så att organisationsnumret finns när ordrar ska till verkstaden, och
    kontots id blir företagsnamnet som slug (`tenantSlug`, `freeTenantId`).
  - Samma sida ger admin en **lösenordslänk** per konto (3 dagar, gäller en gång). En ny länk
    gör äldre länkar ogiltiga. Återförsäljaren byter själv lösenord under Inställningar
    (`changePasswordAction`). "Glömt lösenord" med mejl finns inte än.
  - Lösenordets minsta längd ligger i `src/lib/reseller-auth/limits.ts`, en fil utan
    Node-moduler, eftersom formulären i webbläsaren läser den.
- Vägarna tar bara emot sina egna fält (`z.strictObject`), så det ena formuläret kan aldrig ge det
  andra inlogget. `authenticate` och `createAccount` vägrar ägarens id.
- En återförsäljare utan ordrar möts av "Gör din första offert" med knappar för ny offert, ny
  order och inställningarna; namnskylt.com ser demodatans välkomstyta. Översikten har knapparna
  Ny offert och Ny order.
- Formuläret är `LoginForm` (`kind: "admin" | "reseller"`) i `src/features/admin/login-form.tsx`.
  Sajtens meny länkar "Logga in" till `/aterforsaljare` och visar "Admin" eller "Mina sidor".
- **Bara admin** ser Tillverkning, Återförsäljare, Butiker, Utskick, Prismodell och Provision
  (sidor, actions och API-vägar kontrollerar `isOwner`). Varje adminsida kontrollerar inloggningen själv med `adminTenant()`.
- **Provision** (`/admin/provision`) är adminens samlade vy över återförsäljarnas ordrar: vad
  återförsäljaren betalar, provisionen och verkstadens del, per order och per återförsäljare
  (rena regler i `src/lib/orders/provision.ts`, frågan i `provision-store.ts`). Ägarens egna
  ordrar, demoordrar och avbrutna ordrar är inte med. Vyn filtreras per månad
  (`?period=2026-11`, månaden ordern lades i svensk tid) och laddas ner som CSV
  (`/api/admin/provision/export`, `provisionCsv`): varor, frakt, provision och verkstadens del
  per order. Det är underlaget för plattformens faktura till Skylt & Gravyrteknik. Vyn läser
  alla ordrar varje gång, vilket håller så länge de är få. Innan den första riktiga ordern
  finns visar sidan sex påhittade ordrar (`exampleResellerOrders`, nummer `EX-…`), räknade med
  dagens prismodell, så att fördelningen går att kontrollera. Med riktiga ordrar nås de via
  "Visa exempel" (`?exempel=1`). De ligger inte i databasen och är aldrig med i underlaget. Under Ordrar ser admin fortfarande
  bara ordrar under hyresgästen `namnskylt`; alla återförsäljares ordrar syns under Tillverkning.
- `next dev` skickar med serverns mellanresultat som felsökningsdata i sidan (React), så där syns
  hela prismodellen i sidkällan. Kontrollera läckor mot `next build` + `next start`.

## Ordern till verkstaden — läge 2026-11-14

Återförsäljaren är ett säljverktyg ovanpå verkstaden: den designar åt sina kunder, skickar offert
med eget namn och egen logga, och ordern går till Skylt & Gravyrteknik, som tillverkar, skickar
och **fakturerar återförsäljaren** (beslut av ägaren 2026-11-14). Plattformen fakturerar
verkstaden sin provision per period.

- **Kopplingen är byggd men avstängd.** Strömbrytaren är `SUPPLIER_API_URL` och
  `SUPPLIER_API_KEY` (`supplierApiConfigured`). Utan dem sparas ordrar och väntar. Verkstadens
  API finns inte än, se avsnittet Leverantören.
- **Ordern sparas alltid först** (`placeOrder`), sedan skickas den (`dispatchOrder` i
  `src/lib/supplier/dispatch.ts`). Misslyckas utskicket ligger ordern kvar med felet
  (`orders.supplier_error`, `supplier_attempts`), och kunden får aldrig ett fel för det. Förut
  anropades verkstaden först, och ordern gick förlorad om anropet föll.
- **Adminens översikt** är `/admin/tillverkning` (bara admin): alla återförsäljares ordrar med
  läget Väntar, Saknar uppgifter, Misslyckades eller Hos verkstaden (`dispatchStatus`). Väntande
  och misslyckade ordrar skickas en i taget härifrån. Det finns med flit ingen knapp för att
  skicka alla, eftersom gamla testordrar annars skulle tillverkas. "Underlag" visar anropet som
  JSON utan att skicka något (`GET /api/admin/supplier/request/<order>`). Ett misslyckat utskick
  görs inte om av sig självt; det finns inget schemalagt jobb.
- **Det som stoppar en order** (`dispatchProblems`): leveransadress saknas, återförsäljarens
  organisationsnummer eller e-post saknas, eller ordern har inga skyltar som verkstaden gör.
  Beställaren (`SupplierBuyer`) är återförsäljaren ordern tillhör, läst ur dess
  företagsuppgifter. namnskylt.coms egna ordrar har namnskylt.com som beställare, så ägarens
  företagsuppgifter måste vara ifyllda innan kopplingen slås på.
- **Anropet** (`SupplierOrderRequest`, byggs i `request.ts`): vårt ordernummer som `orderRef`
  och i huvudet `Idempotency-Key`, projektet, beställaren som faktureras, slutkunden som
  referens, fraktsätt (`postnord-varubrev` eller `dhl-paket`), fraktkostnad och adress, och per
  rad dokumentet, produktionsfilen, antalet och **återförsäljarens pris per skylt** med
  startkostnaden inräknad, samt påslaget upp till minsta ordervärde. Bilderna skickas en gång i
  `images` och lagren pekar dit (`src: "image:<nyckel>"`), så hundra namn med samma logga blir
  en bild. Ett anrop över 5,5 MB stoppas med ett begripligt fel. Provision och marginal finns
  aldrig i anropet.
- **Leveransadressen** (`Delivery` i `src/lib/orders/delivery.ts`, migrering 020, kolumnen
  `delivery` på `orders` och `quotes`) har samma fält som verkstadens `Address`. Mottagaren väljs
  per order: till kunden eller till återförsäljaren (beslut av ägaren 2026-11-14).
  - Formuläret är `DeliveryFields` (`src/components/`), samma överallt. Det förifylls ur kundens
    senaste leverans, annars ur kundens fria adresstext (`guessAddress`), och för "Till oss" ur
    återförsäljarens sparade adress (`settings`, nyckeln `delivery_address`).
  - Skyltmotorn: en kund som beställer själv fyller i adressen; en återförsäljare som lägger en
    order får den efter första klicket på "Lägg order". Med formuläret öppet scrollar
    beställningsdelen själv (`.order[data-open]`).
  - En offert börjar med leverans till kunden. Är adressen tom fyller kunden i den när offerten
    godkänns; ska skyltarna till återförsäljaren visas bara dess namn för kunden, aldrig adressen
    (`acceptedDelivery`). Panelen `DeliveryPanel` ändrar leveransen på order och offert tills
    ordern har gått till verkstaden.
  - "Beställ igen" och "Ny personal" ärver förra orderns leverans, en order från en mall får
    kundens senaste. Saknas adressen sparas ordern ändå, men den går inte att skicka.
- **Statusen tillbaka** går som förut via `/api/supplier/webhook` (signerad) och hämtas vid
  behov med `GET /orders/<nr>`.
- **Flera designer i samma order** heter Varukorg i skyltmotorn (`CartSection`, `BadgeGroup` i
  motorn): "Lägg i varukorgen och designa en till" lägger undan skylten i editorn och börjar på
  nästa med samma design utan text. Den nya räknas inte in förrän den ändrats. Priset räknas på hela ordern, så trappsteg,
  startkostnad och frakt delas. En order med flera designer sparas utan 3D-stillbild, eftersom
  bilden bara visar en av dem, och panelen fyller inte heller i en bild i efterhand
  (`sameDesign` i motorn, `missingBadgeShots`). Korgen ligger i minnet och försvinner om sidan
  laddas om.
- `/verkstad`, produktionssidan här i projektet, visar fortfarande bara demoordrar. Riktiga
  ordrar är tänkta att gå via kopplingen till verkstadens eget system.
- Öppet: underlaget per period räknar på månaden ordern lades, inte när den skickades eller
  fakturerades. Ingen har bestämt vilket som gäller för plattformens faktura till verkstaden.
- **Mejl skickas inte.** Offertens länk går från återförsäljarens eget mejlprogram. När kunden
  svarar får återförsäljaren ett besked i panelen (se avsnittet Besked), men inget mejl, och
  kunden får ingen orderbekräftelse. Resend är beslutat men inte inkopplat.
- Kontrollerat 2026-11-14 mot en låtsasverkstad på datorn (produktionsbygget med kopplingen
  på): en ny order skickas en gång, ett fel går att göra om, en väntande order skickas från
  översikten och statusen kommer tillbaka. Aldrig provat mot verkstadens riktiga system.
- Kontrollerat i produktion 2026-11-14 med kopplingen av, för alla roller: ansökan, godkännande,
  val av lösenord, order med leverans, offert med två designer, kundens godkännande och nej,
  korrektur, en kunds egen beställning och adminens sidor. Testordrarna togs bort genom
  gränssnittet. **Kvar i produktionens databas** ligger ett testkonto som heter
  `TEST Flödeskontroll … (ta bort)` med sin ansökan, sina två offerter och sin kund, och en
  testkund under namnskylt.com. Det finns ingen funktion för att ta bort konton, ansökningar
  eller kunder, och databasen nås inte utifrån.
- Skyltmotorn på mobil och låga skärmar: beställningsformuläret öppnas sist i panelen, och
  sidan rullar dit först när formuläret har vecklat ut sig (`FORM_OPEN_MS`, `[data-order-form]`
  med `scroll-margin-top`). Rullas det direkt avbryts rullningen av att sidan ändrar höjd.
- `/verkstad` ligger bakom sajtspärren: utan sajtkoden nekas verkstadens inloggning (401).

## Besked — läge 2026-11-15

När någon annan än panelens ägare har gjort något sparas ett besked (`notices`, migrering 022)
som syns i panelen. Det återförsäljaren gör själv ger inget besked.

- **Det som ger besked** (`NOTICE_KINDS` i `src/lib/notices/model.ts`):
  - kunden godkänner en offert via sin länk (`acceptQuote`, inte när återförsäljaren godkänner
    åt kunden) eller tackar nej (`declineByCustomer`),
  - kunden godkänner sitt korrektur eller vill ändra (`answerProof` i `src/lib/orders/proof-answer.ts`),
  - en kund lägger en order själv i webbshoppen eller i en butik (`placeOrder`, källorna `web`
    och `shop`, inte demoordrar),
  - ett företag ansöker om konto (`saveApplication`), som går till namnskylt.com.
- **Alla krokar anropar `notify`** (`src/lib/notices/notify.ts`), som aldrig kastar: kundens svar
  är redan sparat, och ett besked som inte går att spara får inte ge kunden ett fel.
- **I panelen:** översikten visar listan "Nytt sedan sist" överst (`NoticeList`), även för en
  återförsäljare utan ordrar. Menyn visar antalet olästa på Översikt, och antalet står först i
  flikens titel, `(2) Admin`. `AdminShell` frågar `GET /api/admin/notices` en gång i minuten och
  när fliken visas igen, så siffran kommer av sig själv i en öppen panel. Layouten läses inte om
  vid navigering, därför hålls siffran i klienten.
- **Läst** blir ett besked när sidan det gäller öppnas: ordern, offerten eller sidan för
  återförsäljare (`NoticesSeen`), eller med "Markera alla som lästa". Det görs från webbläsaren
  och inte när servern ritar sidan, eftersom sidor också ritas i förväg för länkar.
- Ett besked hör till ordern, offerten eller ansökan det gäller och försvinner med den
  (`on delete cascade`). Texten och länken kommer ur `noticeView`, samma i panelen och i mejlet.
  Kundens egna ord (skälet till ett nej, ändringen som önskas) står inom citattecken.
- Adminens meny visar också antalet ansökningar som väntar på Återförsäljare
  (`countPendingApplications`).
- **Mejl om besked är byggt men avstängt.** Det skickas först när `RESEND_API_KEY` är satt och
  avsändaren står i `NOTICE_FROM_EMAIL` (`noticeEmailSettings`); `OUTREACH_DISABLED=true` stänger
  också av det. Mottagaren är adressen i företagets uppgifter, annars kontots inloggningsadress.
  Länken byggs på `NOTICE_PUBLIC_URL` (standard `https://www.namnskylt.com`), aldrig på
  förfrågans värdnamn. Mejlet väntar kunden inte på, och `notices.emailed_at` sätts när Resend
  har tagit emot det. Aldrig provat mot Resend.
- Kända brister: lästa besked visas ingenstans (historiken står i orderns och offertens
  tidslinje) och tas aldrig bort. Kunden får fortfarande inget mejl.

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

Deras sajt har ännu inget API som tar emot ordrar. Namnskylts sida är klar (se Ordern till
verkstaden), så det som återstår ligger där. Lästes 2026-11-14: deras `Order` har redan
`customerPo`, `orderName`, `shippingMethod`, `shippingCost`, `shippingAddress`,
`minOrderAdjustment`, betalsättet `invoice` med Fortnox-faktura vid Skickad, och
`Company.collectiveInvoice` för samfakturering. Det som behöver byggas hos dem:
1. En API-nyckel per partnerkonto (`Authorization: Bearer`).
2. `POST /orders` som tar emot `SupplierOrderRequest` och skapar en vanlig fakturaorder:
   - hittar eller lägger upp beställaren som företagskund på `buyer.id` och organisationsnummer,
   - sparar `orderRef` som `customerPo` och svarar med samma order om `Idempotency-Key`
     kommer igen,
   - lägger in bilderna ur `images` i dokumenten innan de sparas,
   - tar radpriserna, påslaget och frakten ur anropet i stället för sin egen prislista.
3. `GET /orders/{nr}` med `SupplierOrderState`.
4. En signerad statuswebhook till `/api/supplier/webhook` (`x-supplier-signature`,
   `t=<sekunder>,v1=<HMAC-SHA256 av "t.kropp">`).

Luckor i kontraktet:
- Metallämnena och kuddformen finns inte i deras katalog. Kudden skickas som rektangel.
- Egen form skickas som deras fria polygon (`shape: "freeform"`, `customShapePoints`), men hos dem
  är den bara tillåten för metallskärning. De behöver öppna den för graverad plast.
- Fästet skickas som text i stället för artikelkod.
- Vi skickar deras fyra fraktsätt: varubrev, paket, `postnord-express` och `pickup-hogsbo`.
  Hur expressfraktens pris kommer tillbaka till ordern är inte bestämt.
- En logga i färg skickas som bildlager med `renderMode: "print"`. Deras format har läget, men
  ingen har bekräftat att verkstaden trycker namnskyltar eller vilken upplösning som krävs.
- Lambda tar högst 6 MB per anrop. Bilderna skickas en gång och anropet stoppas vid 5,5 MB,
  men en order med många olika loggor i färg kan ändå bli för stor.

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
