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
- **Skicka aldrig mejl utöver de tre undantagen nedan.** `RESEND_API_KEY` ska vara tom tills
  användaren säger annat: den gäller sedan 2026-11-21 bara utskicket till återförsäljare, som
  står i `dry_run` och är pausat. Lägg aldrig någon av de andra nycklarna där.
  - **Det första undantaget är offertmejlet**, som ägaren bad om och slog på 2026-11-17. Det har sin
    egen strömbrytare, `QUOTE_RESEND_API_KEY` och `QUOTE_FROM_EMAIL`, satta på Railway på
    ägarens begäran. Ändra dem inte och ta inte bort dem utan att ägaren säger till, och lägg
    aldrig offertmejlets nyckel i `RESEND_API_KEY`: då slås utskicket på. Se
    avsnittet Offertmejlet.
  - **Det andra undantaget är adminens besked som mejl**, som ägaren bad om och slog på
    2026-11-20: ett mejl till adminens adresser när ett företag ansöker om att bli
    återförsäljare och vid varje ny order. Det har sin egen strömbrytare,
    `ADMIN_NOTICE_RESEND_API_KEY`, `ADMIN_NOTICE_FROM_EMAIL` och `ADMIN_NOTICE_TO`, satta på
    Railway på ägarens begäran. Ändra dem inte och ta inte bort dem utan att ägaren säger
    till. **Mottagarnas adresser står bara i `ADMIN_NOTICE_TO` på Railway: skriv dem aldrig i
    koden, i den här filen eller i en commit.** Se avsnittet Besked.
  - **Det tredje undantaget är mejlen till återförsäljare och butikskunder**, som ägaren bad
    om och slog på 2026-11-21: besked till en återförsäljares panel, länken för glömt
    lösenord, och orderbekräftelsen och fraktbeskedet till en kund som har beställt i en
    återförsäljares butik. De har sin egen strömbrytare, `NOTICE_RESEND_API_KEY` och
    `NOTICE_FROM_EMAIL`, satta på Railway på ägarens begäran. Ändra dem inte och ta inte
    bort dem utan att ägaren säger till. **En direktorder hos namnskylt.com får aldrig
    orderbekräftelse eller fraktbesked härifrån**: verkstadens system mejlar kunden, och
    annars får kunden två mejl. Se avsnittet Mejl från sajten.
- **Slå aldrig på kortbetalningen.** `STRIPE_SECRET_KEY` och `STRIPE_WEBHOOK_SECRET` ska vara
  tomma i driften tills användaren har ett Stripe-konto och säger till. Med dem satta betalar
  privatpersoner med kort på riktigt. Se avsnittet Kassan, betalning och köpvillkor.
- **Rör inte kopplingen till verkstaden utan att användaren säger till.** Ägaren slog själv på
  den i driften 2026-11-17: `SUPPLIER_API_URL`, `SUPPLIER_API_KEY` och `SUPPLIER_WEBHOOK_SECRET`
  är satta på Railway. Med dem satta skickas varje ny order till Skylt & Gravyrteknik, som
  tillverkar och fakturerar. Ändra dem inte, ta inte bort dem och sätt dem inte i någon annan
  miljö. Se avsnittet Ordern till verkstaden.
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
# Kvalitetsgrinden. Kör den innan något lämnas (1454 tester, grönt 2026-11-21).
rm -rf .next/types && pnpm typecheck && pnpm lint && \
  DATABASE_URL="$(rg -o '^DATABASE_URL=(.*)' -r '$1' .env.local)" pnpm test && pnpm build

pnpm db:migrate              # migreringar mot DATABASE_URL (lokal Postgres på localhost:5435)
pnpm outreach:import         # läser kundlistan till outreach_leads
pnpm outreach:prepare --wave A [--lead <uuid>] [--no-persona|--redo-persona]
pnpm outreach:preview        # skriver mejlexempel till tmp/outreach-preview/
pnpm email:preview           # skriver sajtens övriga mejl till tmp/mejl-forhandsvisning/, utan att skicka något
pnpm fonts:fetch             # hämtar skyltmotorns extra typsnitt från Google Fonts och skriver om listan
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
| `src/lib/customer-auth/` | Slutkundens konto: regler (`model.ts`), lagring (`accounts.ts`), inloggningens kaka (`session.ts`), lösenordslänken (`access-links.ts`) och webbläsarens anrop (`client.ts`). Se avsnittet Kundkonton. |
| `src/lib/outreach/` | Utskicket till återförsäljare (se nedan). 42 filer i en platt mapp, vilket är känd skuld. |
| `src/lib/email/` | Transport: `ResendEmailSender` och `MockEmailSender`, som skriver `.eml` till `tmp/outreach-outbox`. Mejlmallen (`layout.ts`) som alla mejl ritas med, och säljarens logga för mejl (`seller-logo.ts`, `seller-brand.ts`). |
| `src/lib/notices/` | Besked till panelens ägare när en kund har svarat eller beställt: texter (`model.ts`), lagring, `notify` och mejlet bakom en strömbrytare. |
| `src/lib/payments/` | Kortbetalning via Stripe bakom en strömbrytare: `stripe.ts` (anrop och signatur med `fetch`, utan SDK), `checkout.ts` (kassan som väntar på betalning och blir en order), `model.ts`. |
| `src/lib/maintenance/` | Fellogg (`error-log.ts`), bakgrundsjobb i processen (`scheduler.ts`, `jobs.ts`) och driftsidans lägen (`status.ts`). |
| `src/lib/designer-work/`, `designer-stats/`, `seo/` | Skyltmotorns sparade arbete i webbläsaren, tratten över var besök slutar, och reglerna för `robots.txt` och sitemapen. |
| `src/lib/fonts/` | Typsnittsmotorn (`font-engine.ts`, opentype.js) och hur filerna laddas i webbläsaren och på servern. Se avsnittet Typsnitt. |
| `src/lib/format/` | `formatSek`, `formatDate`, `formatDay`, `formatRelative` (Europe/Stockholm). |
| `src/features/` | En mapp per vy: designer (3D), shop, shop-editor, admin, outreach, outreach-landing m.fl. |
| `src/app/` | Routes. Publika vägar är svenska (`/skapa`, `/butik`, `/for/[token]`), API-vägar engelska. |
| `scripts/` | Kommandoradsverktyg, namngivna `<område>-<verb>.ts`. |
| `docs/aterforsaljar-utskick/` | `MASTERPLAN.md`, 16 delplaner, `00-KONTEXT.md`, `01-KUNDLISTA.md`, intresseavvägning. |

## Sortimentet — läge 2026-11-13

Sajten säljer graverade skyltar i metall (Premium) och plast (Standard).

- **Material:** bara material med `offered: true` i `src/engine/catalog.ts` går att välja.
  - `metal`: tre ytor, som heter som verkstadens sedan 2026-11-17: **Vit matt** (`metal-white`,
    lackad aluminium), **Mässing** (`metal-gold`) och **Nickel** (`metal-silver`). Id:na är
    oförändrade, eftersom verkstadens mottagare känner dem. Färdiga ämnen (`precut`), som
    verkstaden bara märker.
    - **Metallen går bara att printa på** (beslut av ägaren 2026-11-18: "det ska inte gå att
      gravera i metall"). Se Märkningsmetod.
  - `plastic`: tvålagers gravyrplast 1,5 mm (verkstadens kod `plastic-1.5mm`). Skärs ur ark och
    får därför ha egen form (`customShape`).
    - **17 av verkstadens 18 färgkombinationer för 1,5 mm säljs**, och alla kostar lika: 14
      framsidor, där vit finns med svart, blå eller röd kärna och grön med vit eller svart
      (beslut av ägaren 2026-11-16). Listan är `PLASTIC_15_COLORS` i `catalog.ts`, med de fyra
      klassiska namnskyltsfärgerna först.
      - **Gul med röd gravyr säljs inte** (beslut av ägaren 2026-11-18, som ringade in valet
        "Röd" under gul och bad att det skulle bort): `yellow-red` har `discontinued: true`.
        Gul finns alltså bara med svart gravyr, som en enda prick i färgvalet. Vit med
        röd gravyr säljs fortfarande.
      - En kombination som har utgått ligger kvar i materialets `colors`, så att en sparad
        skylt ritas i sin färg. Det som går att välja och beställa läses med `offeredColors`
        (färgväljaren, `isOfferedDocument`, `toOfferedDocument`, `matchColorCombo`, bytet av
        material). En skylt i gul med röd gravyr som öppnas i skyltmotorn blir gul med svart.
    - Id:n, namn och färgkoder är verkstadens egna (deras `PLASTIC_15_COLOR_COMBOS`), och id:t
      skickas rakt av i ordern. `src/lib/supplier/catalog-sync.test.ts` jämför listan med deras
      katalog när deras projekt ligger bredvid på datorn, och hoppas över i CI. När deras API
      finns ska listan hämtas därifrån.
    - **Guld och silver ritas som borstad metall** (besked från Pär via ägaren 2026-11-18, som
      såg guldet som orange i ritningen): `gold-black` och `silver-black` har `metallic: true`.
      Ritningen ger dem borstade stråk (`surfaceDefs` i `render-svg.ts`), 3D-vyn en borstad
      metallyta med plastens kärna och gravyr (`three/materials.ts`), och personbilden beskrivs
      så. Färgkoden är verkstadens och är oförändrad. Att just de två plastfärgerna har en
      metallfilm överst är mitt antagande: verkstadens katalog säger bara färg.
    - **Färgen väljs i ett steg: en prick per kombination** (beslut av ägaren 2026-11-18,
      `ColorPicker`, `byFront` i `src/engine/color-choice.ts`). Pricken visar framsidans och
      kärnans färg, och det man ser är det man kan välja: 17 prickar för plasten, där vit
      finns som tre (svart, blå eller röd kärna) och grön som två, med samma framsida intill
      varandra. Metallen har en prick per yta.
      - Från 2026-11-16 till 2026-11-18 valdes färgen i två steg: en prick per framsida, och
        sedan raden "Gravyrens färg" där framsidan fanns med flera kärnor. Ägaren tog raden
        för produktionens stödlinjer och frågade om inte prickarna var det man kunde välja
        på. Raden och `colorChoices` är borttagna.
      - Skylten bär kombinationens id (`colorId`) som förut, så ritning, 3D, pris och
        underlaget till verkstaden är orörda.
    - **Färgkoderna står under färgerna** (besked via ägaren 2026-11-16): för den valda
      plastfärgen visas framsidans och gravyrens kod (`pigmentCodes`, `pigmentCodeText` i
      `color-choice.ts`). I dag finns bara hex, som är skärmens färg ur verkstadens katalog.
      **PMS och RAL finns varken hos oss eller i verkstadens katalog**: `PIGMENT_CODES` är tom
      och fylls i när verkstaden har lämnat koderna, och då visas de av sig själva. Hitta
      aldrig på en kod. Metallens ytor har ingen färgkod.
    - En skylt i äldre plast behåller sin färg när den flyttas till dagens plast
      (`toOfferedDocument`), eftersom id:na är desamma.
    - När kunden hämtar sin logga från hemsidan föreslås den kombination som ligger närmast
      loggans färg (`logoColorCombo`, se De avlästa färgerna under Märkningsmetod). Sedan
      2026-11-20 väljs den inte av sig själv.
- **Ämnen:** metallen och plasten har olika ämnen (`BLANKS`, `BadgeBlank.finishes`, `blankFits`),
  och formväljaren visar bara dem som finns på materialet.
  - **Metallens ämnen är verkstadens egna** (underlag från ägaren 2026-11-17, en lista med
    benämning, mått och tjocklek): fem format, alla i de tre ytorna.

    | Ämne | Id | Mått | Vit matt | Mässing, nickel |
    | --- | --- | --- | --- | --- |
    | Rektangel | `metal-rectangle` | 60 × 30 mm | 0,8 mm | 0,51 mm |
    | Smal rektangel | `metal-rectangle-slim` | 60 × 18 mm | 0,8 mm | 0,51 mm |
    | TV-bricka | `metal-tv` | 62 × 32 mm | 0,8 mm | 0,51 mm |
    | Oval | `metal-oval` | 63 × 32 mm | 0,8 mm | 0,5 mm |
    | Oval, välvd | `metal-oval-domed` | 59 × 34 mm | 0,8 mm | 0,5 mm |

    - Varje ämne bär verkstadens benämning och tjocklek per yta (`BadgeBlank.articles`,
      `blankArticleOf`, `thicknessOf`). Benämningen står ordagrant som i deras lista och följer
      med ordern i `productionNote` ("Ämne: Namnskylt Mässing 60x30, 0,51 mm."), så att rätt ämne
      plockas: ytorna heter annat i deras katalog, och formatet går inte att läsa ur materialkoden.
    - En ny skylt börjar på rektangeln, 60 × 30 mm, i mässing. Det valde jag; listan säger inget
      om vilket format som är vanligast.
    - TV-brickan ritas med formen `cushion` (en superellips), och den välvda ovalen ritas plan.
  - **Plastens format är orörda** (ägarens besked samma dag: plasten är densamma som på
    verkstadens egen sajt): rektangel 75 × 25, oval 70 × 40, stor rektangel 75 × 45, kudde
    75 × 35 och **Lång rektangel, 80 × 25 mm** (`rectangle-long`, beslut av ägaren 2026-11-16),
    som är klämmans format.
  - Byter kunden material flyttas skylten till närmaste ämne på det nya materialet
    (`withFittingBlank`): rektangel blir rektangel, oval blir oval och TV-brickan blir kudde.
  - En metallskylt i de tidigare måtten (75 × 25, 70 × 40, 75 × 45 och 75 × 35 mm) är inte i
    sortimentet längre: den går inte att beställa igen som den är, och flyttas till närmaste
    ämne när den öppnas (`toOfferedDocument`).
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
    `BlankPicker` i `pickers.tsx`). Startrutan och panelen visar samma former, även
    "Egen form" (besked via ägaren 2026-11-16): båda frågar `useCustomShapeChoice`
    (`custom-shape-choice.ts`). Väljs formen i startrutan ritas den i nästa steg: rutan
    "Egen form" bär där raden "Välj exakt form i nästa steg" (`CustomShapeChoice.hint`,
    besked via ägaren 2026-11-16), och efter valet står att formen på bilden är ett förslag.
  - **Formen går att beskriva med ord** (beslut av ägaren 2026-11-16): under uppladdningen finns
    rutan "Beskriv formen" (`shape-describe.tsx`, `draw-shape.ts`). `POST /api/custom-shape/draw`
    låter bildmodellen rita en svart siluett i låg kvalitet (`drawShapeImage` i
    `src/lib/ai/shape-image.ts`, uppdraget i `shape-prompt.ts`), och webbläsaren spårar bilden
    som en uppladdad fil (`readShapeFile`), så att punkterna går att dra som vanligt.
    - Servern gör bilden rent svartvit, sluter hårfina springor och säger ifrån när bilden
      saknar en form (`silhouettePng`, `NoShapeError`). En ritad form får 2 mm hörnrundning.
    - Gränser (`shape-limits.ts`): 5 försök per besökare och timme och 300 per dygn för hela
      sajten, i processens minne. De nollas vid omstart, och misslyckade försök räknas.
    - Rutan visas bara när `GET /api/custom-shape/draw` svarar `available: true`, alltså med
      `OPENAI_API_KEY` satt. Kundens beskrivning rensas, citeras som data i uppdraget och
      loggas aldrig.
    - **Medan formen ritas ligger en väntruta över sidan** (besked via ägaren 2026-11-16,
      `DrawingDialog` i `shape-describe.tsx`): en modal `dialog` med beskrivningen, en stapel
      som följer tiden (inte servern) och knappen Avbryt. Avbryt och Esc avbryter anropet, och
      formen som låg där står kvar. Försöket räknas ändå mot gränsen.
    - Provat 2026-11-16 med fem riktiga anrop (häst, lastbil, cykel, sittande hund): 9–10
      sekunder per bild. Djupa inbuktningar blir kvar och rättas genom att dra i punkterna.
  - **Måtten vid ritytan går att skriva på plats** (besked via ägaren 2026-11-16): bredden
    ovanför och höjden till vänster är fält (`DimensionField` i `mm-field.tsx`). De sätter just
    den sidan, oavsett låset för proportionerna i fälten "Mått och rundning" under ritytan.
    Fältet stoppar pekhändelsen, eftersom ritytan annars fångar pekaren för att dra i punkterna.
  - PDF läses med `pdfjs-dist`, låst till `~5.4.624` eftersom nyare kräver Node 22. Bara första
    sidan läses.
  - Kända brister: bara provat i Chrome; en ritad form försvinner om kunden väljer ett ämne och
    sedan "Egen form" igen.
- **Fästen** (2026-11-16): nål, magnet och klämma (`MOUNTINGS` i `catalog.ts`).
  - **Klämman finns bara på plastskyltar som är stora nog** (beslut av ägaren 2026-11-16):
    skylten ska vara minst 80 × 25 mm när klämman sitter horisontellt, eller minst 25 × 80 mm
    när den sitter vertikalt (`CLIP_MIN`, `clipOrientations`). Regeln gäller alla former, även
    egen form, och räknas på skyltens mått. `mountingFits` prövar materialet och
    `mountingFitsDocument` hela skylten; använd den senare överallt där en skylt finns.
    - De fyra vanliga formaten är kortare än 80 mm och kan alltså inte få klämma. Den går att
      välja på Lång rektangel och på en egen form som är stor nog.
    - I väljaren syns klämman alltid. Går den inte att välja är den streckad, med raden "Endast
      för plastskyltar på minst 80 × 25 mm" på metall och "Kräver minst 80 × 25 mm. Välj Lång
      rektangel eller Egen form." på en för liten plastskylt (`mountingNote` i
      `mounting-section.tsx`).
    - **Kunden väljer riktning** under fästena när klämman är vald: Horisontellt eller
      Vertikalt (`BadgeDocument.clipOrientation`, åtgärden `clip/orientation`). En riktning som
      inte ryms går inte att välja. Läs alltid med `clipOrientationOf`, som ger den som ryms när
      fältet saknas eller inte ryms. Stående klämma ritas med vikningen uppåt i 3D.
    - Riktningen står i fästets namn överallt där kund och verkstad läser det (`mountingLabel`:
      "Klämma, vertikalt"): specifikationen, ordersidor, offert, korrektur, fakturaunderlag,
      Tillverkning och verkstadens underlag.
    - Ändras materialet, formen eller måttet så att klämman inte ryms blir fästet nål, och en
      riktning som inte ryms släpps (`withFittingMounting` i `designerReducer`).
    - En skylt med klämma som inte ryms är inte i sortimentet (`isOfferedDocument`): en äldre
      order med klämma på 75 × 25 mm går inte att beställa igen, `toOfferedDocument` ger den
      nål, och ett sparat arbete i webbläsaren med en sådan skylt kastas.
  - **Ikonerna i panelen** är förenklade teckningar efter ägarens förlagor: nålen med spets
    och ögla, hästskomagneten med sina poler och klämman med flik och öppning
    (`mounting-section.tsx`).
  - **3D-fästena är byggda efter foton av verkstadens egna fästen** (underlag från ägaren
    2026-11-16, `three/mounting.tsx`), och ser alltså inte ut som ikonerna:
    - nålen är en svart plastlist på en vit skumtejp, med gångjärn i ena änden, lås med
      rundad kåpa i den andra och en stålnål som står öppen (`NEEDLE_OPEN`),
    - magneten är en tunn förnicklad platta på skylten och en svart hållare med rundade ändar,
      som vilar på två klackar och bär texten CAUTION MAGNETIC. Texten byggs ur typsnitten
      (`fonts` skickas till `Mounting`); innan de har laddats ritas hållaren utan text,
    - klämman är en stålplatta på 80 × 25 mm, med en fjäderarm vikt över ena änden, ett
      fönster med en tunga i armen och en uppvikt läpp längst ut.
  - **Skylten ligger kant i kant med klämman, varken innanför eller utanför** (besked av
    ägaren 2026-11-18, som såg klämman ritad med en kant av skylten runt om). Klämmans platta
    är lika stor som den minsta skylt klämman får sitta på (`CLIP_MIN`), och reglerna ligger
    i `clipPlate` i `src/engine/hardware-fit.ts`.
    - På Lång rektangel täcker plattan hela baksidan och har skyltens hörnrundning.
      Vikningen ligger utanför plattan, se nästa punkt.
    - På en större skylt är klämman fortfarande 80 × 25 mm och sitter mitt på.
    - På en egen form får klämman gå ända ut i kanten, och hörnen rundas så mycket som
      formens hörn kräver, högst 6 mm (`CLIP_FIT`, `fitHardware`). En egen form på 80 × 25 mm
      får alltså klämman kant i kant. Ryms den inte ens så förminskas den, som förut.
    - Att klämman är just 80 × 25 mm, och att dess hörn är rundade som skyltens, är min
      tolkning av beskedet. Ingen har gett klämmans mått.
    - **Vikningen sticker ut 4 mm utanför skylten** (mått från ägaren 2026-11-20: "Skylt 80mm,
      Klämma 84mm", efter att Mats på verkstaden sagt att skylten passar precis till där
      böjningen börjar och att böjningen syns framifrån). Plattan är fortfarande 80 × 25 mm och
      täcker skylten. Vikningen börjar vid plattans kortsida och går 4 mm ut
      (`CLIP_FOLD_REACH_MM` i `hardware-fit.ts`, `foldGeometry` i `three/mounting.tsx`), som
      ett utdraget halvt varv: 4 mm långt och 4 mm högt. Från 2026-11-18 till 2026-11-20
      skars vikningen av mot plattans hörn, så att inget stack ut. Att varvet är utdraget och
      4 mm högt är min tolkning: ägaren gav bara de två längderna.
    - **Vikningen sitter till vänster och är lika hög som skylten** (svar från Mats via ägaren
      2026-11-20: "Böjningen på militärklämman har du på vänster sida, och den är alltså lika
      hög som skylten"). Vikningen och armen är alltså lika breda som plattan, 25 mm, och på
      en liggande klämma ligger vikningen till vänster när skylten ses framifrån. **Att
      vänster är sett framifrån är min tolkning**; är det sett bakifrån ska vridningen i
      `Mounting` (`Math.PI`) tillbaka till 0. En stående klämma har vikningen uppåt, som förut.
    - Förut ritades plattan 72 × 21 mm, alltså 4 mm innanför skyltens kortsidor och 2 mm
      innanför långsidorna.
  - Fästena ritas i mm i en grupp som är vänd som de ses bakifrån (x åt höger, z ut från
    baksidan). Måtten har tak, så fästet växer inte med en stor skylt, och är uppskattade
    från fotona. `footprint` använder samma mått, och `fitHardware`
    (`src/engine/hardware-fit.ts`) flyttar och förminskar fästet på en egen form. Nål och
    magnet håller 1,5 mm luft mot kanten. På en oval skylt kortas klämman till det som ryms
    (`clipPlate`).
  - Skyltmotorn vänder själv skylten en stund när ett fäste väljs, så att fästet syns.
  - Känd brist: prismodellens kalkyl i `/admin/prismodell` låter fortfarande klämman väljas
    ihop med Premium, fast den kombinationen inte går att beställa.
- **Märkningsmetod** (beslut av ägaren 2026-11-16): kunden väljer om namn och logotyp graveras eller
  printas, i sektionen "Märkningsmetod" i skyltmotorn (`marking-section.tsx`). Fyra val
  (`MARKING_METHODS` i `src/engine/marking.ts`): Endast gravyr, Endast print, Namn graveras ·
  logotyp printas och Namn printas · logotyp graveras. En metod ingår i skylten.
  - **På metall finns bara "Endast print"** (beslut av ägaren 2026-11-18: "det ska inte gå att
    gravera i metall. Man ska bara kunna ha print på metall."). Ägaren höll fast vid det senare
    samma dag, när frågan om verkstadens bekräftelse kom upp: "vi börjar med att det endast
    är print på metall". Materialet bär regeln
    (`BadgeMaterial.printOnly`, `isPrintOnly`), och `markingFits` tar skyltens material.
    - I sektionen syns de tre valen med gravyr streckade på metall, med raden "Gravyr finns
      bara på plastskyltar.", och utan pris. På plast finns alla fyra, som förut.
    - **En ny skylt börjar på metall med `marking: "print"`** (`createBadgeDocument`). En ny
      logga på metall printas alltid, i färg eller i en färg (`withMarking` ger print på ett
      material som bara printas).
    - **Metoden följer materialet när det byts** (`withMaterialMarking`, åtgärden
      `material`): till metall blir allt print. Från metall till plast börjar skylten om på
      plastens förval, gravyr med en logga i färg tryckt, eftersom print bara var valt för att
      metallen krävde det. Det valde jag; ägaren sa inget om bytet.
    - **En metallskylt som graveras säljs inte** (`hasFittingMarking` i `isOfferedDocument`).
      Så sparades alla metallskyltar före 2026-11-18, utan vald metod. De ritas och läses som
      förut, alltså graverade, men går inte att beställa igen som de är, och blir print när
      de öppnas i skyltmotorn (`toOfferedDocument`), till exempel med Kopiera order. Ett
      sparat arbete i webbläsaren med en sådan skylt kastas.
    - Gravyranimationen i 3D, som spelas när skyltmotorn öppnas, visas bara när något på
      skylten graveras (`engraves` i `designer.tsx`). Knappen Gravera, som spelade den igen,
      togs bort 2026-11-19 (se Skyltmotorns knappar). På en plastskylt heter ramen "Tryckt
      ram" när namnet printas.
    - **Ramen finns bara på plastskyltar** (beslut av ägaren 2026-11-18: "Graverad ram ska
      endast gälla för plastskyltar. Inget valbart alternativ vid metall"). Regeln följer
      materialet: ett material som bara printas har ingen ram (`frameFits`, `hasFittingFrame`,
      `withFittingFrame` i `src/engine/marking.ts`).
      - På metall syns raden "Graverad ram" i sektionen Form med Ingen vald, Linje och Dubbel
        går inte att välja, och under står "Ram finns bara på plastskyltar." Att valet syns
        men inte går att välja, i stället för att döljas, valde jag: så visas också Egen form,
        klämman och gravyrmetoderna på metall.
      - Byts materialet till metall tas ramen bort (åtgärden `material`). Ramens mått står
        kvar i skylten, så att den ser likadan ut om den väljs igen på plast.
      - **En metallskylt med ram säljs inte** (`isOfferedDocument`): den ritas som förut, men
        går inte att beställa igen som den är, och ramen tas bort när skylten öppnas i
        skyltmotorn (`toOfferedDocument`). Ett sparat arbete i webbläsaren med en sådan
        skylt kastas.
      - På plast är ramen orörd: graverad, eller tryckt när namnet printas.
    - Verkstaden får då ett enda trycklager med namnet (och en svartvit logga) som banor, en
      logga i färg som bild, och i `productionNote` ämnets benämning följd av "Märkningsmetod:
      Endast print. Namn: Print." och raderna i klartext. Prövat 2026-11-18 mot verkstadens
      egna regler genom att läsa deras kod, i sju varianter (ytor, oval, ram, logga, färg per
      rad): alla godkänns. **Ingen sådan order har gått till verkstaden på riktigt**, och att
      verkstaden printar på metallämnena har ingen bekräftat åt mig.
    - Testerna för gravyren använder `engravedBadge` och `plasticBadge` i
      `src/engine/testing.ts`, eftersom en ny skylt inte graveras längre.
    - Kända brister: kalkylen i `/admin/prismodell` låter fortfarande gravyrmetoderna väljas
      ihop med Premium. Inspirationsbankens fyra exempel är omgjorda till print, men bilderna
      är tagna när skyltarna graverades. Utskickets mejltext och redan sparat innehåll i
      butikerna kan fortfarande tala om graverade metallskyltar.
  - Skylten bär valet i `BadgeDocument.marking`. Läs alltid med `markingOf`, `nameMarking` och
    `logoMarking`. Utan fältet gäller det gamla: namnet graveras, och loggan trycks om den har
    `image` och graveras annars. Fältet sparas bara när valet skiljer sig från det (`withMarking`).
  - De kombinerade valen kräver en logga. Utan logga syns de streckade, och tas loggan bort faller
    valet tillbaka till namnets metod. Ramen följer namnet.
  - En ny logga får ett förslag (`withLogoMarking`): i färg printas den, svartvit följer den namnet.
    Kunden kan byta sedan, även gravera en logga i färg (då ritas den ur sina banor i textens färg)
    eller printa en svartvit (siluetten i gravyrens färg).
  - Ritningen delar allt i två listor: `engravingPaths` är det som fräses (3D, produktionsfil,
    maskinfiler) och `printedPaths` det som printas i gravyrens färg. En logga i färg som printas
    är en bild (`LaidOutLogo.imageSrc`). Förhandsvisningen ritar allt; i 3D ligger printen plant på
    ytan (`InkPrint` i `three/logo-print.tsx`), och i verkstadens arkvy är den hjälplinjer.
  - Verkstaden: loggans lager bär `renderMode` efter metoden. Deras text- och ramlager har inget
    läge för print. **Det som printas i en färg skickas därför som banor i ett trycklager**
    (beslut av ägaren 2026-11-17, `printLayer` i `src/lib/supplier/map.ts`): namnet, ramen
    och en svartvit logga, var och en i sin färg. Lagret är ett bildlager i tryckläge med
    vektorinnehåll, som deras tryckfil ritar och deras gravyrfil hoppar över.
    - Banorna räknas om till det deras vektorlager tar, bara absoluta `M`, `L`, `C` och `Z`
      (`toCubicPath` i `cubic-path.ts`): bokstävernas kvadratiska kurvor blir kubiska, och
      ramens relativa kommandon och bågar blir absoluta linjer och kurvor. Färgen står som
      hex i gemener.
    - Färgen är den kunden har valt för trycket eller raden, annars färgen skylten visades
      i (gravyrens färg).
    - Då finns inget text- eller ramlager för namnet hos verkstaden. Raderna står i
      kommentaren ("Text som printas: Anna Lind / Säljare"), och personalen kan inte ändra
      texten hos sig.
    - Utan glyfkonturer (typsnittet inte laddat, som i tester med `approxFonts`) skickas
      namnet som förut, som text, och metoden står bara i klartext. Samma sak om en bana inte
      går att räkna om (en logga med trasig bana): ordern stoppas aldrig av trycklagret.
    - En logga i färg som printas är fortfarande en bild.
  - En logga i färg som graveras behåller sina banor i en delad länk; ryms de inte tappas loggan.
  - Sektionen ligger före Logga (hette Logga & varumärke till 2026-11-20), eftersom metoden
    avgör hur loggan sedan märks (besked via ägaren 2026-11-16). Sedan 2026-11-21 är den
    nummer 04 och Logga 05, se Panelens ordning under Skyltmotorns knappar. Varukorgen är
    ingen sektion i panelen längre, se Ordern till verkstaden.
  - **Färgen på trycket är en skärmfärg, som hos Skylt & Gravyrteknik** (beslut av ägaren
    2026-11-18: "bygg om så att det fungerar som hos skylt och gravyr"). Kunden väljer en av sju
    standardfärger eller en egen färg, och den sparas som `#RRGGBB`. Det finns inga fält för
    CMYK, PMS eller andra koder, och ingen färg lovas exakt.
    - **Varför:** Pär förklarade samma dag att samma CMYK ger olika färg i olika printrar,
      medan Pantone är ett mål som får blandas till per material. Koderna följde bara med
      ordern som text, så någon fick läsa dem och ställa in färgen för hand. I verkstadens
      eget projekt (läst 2026-11-18) väljer kunden en skärmfärg, tryckfilen ritas i RGB med
      sRGB som profil, och RIP:en (Caldera eller RasterLink) räknar om den. Där finns inget
      manuellt steg. Beslutet upphäver det från 2026-11-17 om att CMYK-koder skulle anges.
    - **Färgen väljs vid texten, som "Textfärg"** (besked av ägaren 2026-11-19, som fann fältet
      under Märkningsmetod som "andra val" och såg att inget hände när man klickade). Valet
      står under raderna i sektionen Text (`TextColorField` i `sections/print-color-field.tsx`),
      och sektionens huvud visar färgens namn. Fältet "Färg på trycket" under Märkningsmetod
      är borta. Förut vann radens egen färg över valet för hela trycket, så ett klick kunde se
      ut att inte göra någonting, och trycket var svart från början utan att någon ruta var
      markerad.
      - **Ett val av Textfärg gäller alla rader** (`withTextColor` i `marking.ts`, åtgärden
        `print/color`): radernas egna färger tas bort, så att valet alltid syns.
      - **Färgen som gäller är alltid markerad**, också från början: utan vald färg är det
        ytans förvalda (svart på metall), och den rutan är markerad.
      - **Varje rad har en liten färgruta vid textfältet**, som hos Skylt & Gravyrteknik
        (`BadgeTextRow.printColor`, åtgärden `row/color`). Den visar färgen raden har och ger
        just den raden en egen färg. Raden "Färg" med hexfält per rad är borta.
      - Graveras namnet står i stället att texten får plastens gravyrfärg, med hänvisning
        till Material & färg och till print under Märkningsmetod.
      - Printas bara en enfärgad logga, och namnet graveras, står samma val i loggans
        sektion som "Loggans färg".
    - **Färgen gäller bara det som printas i en färg** (`printsInOneColor` i `marking.ts`,
      rättat 2026-11-19): namnet, med ramen, eller en svartvit logga. Printas bara en logga
      i färg, som trycks ur sin bild, visas inget färgval och ingen "Tryckfärg" följer med
      ordern. Förut bar en plastskylt med graverat namn och logga i färg tryckfärgen från
      skylten som designades före den, i etiketten och i verkstadens kommentar.
    - **Paletten har fjorton namngivna färger** (beslut av ägaren 2026-11-19: "14 plus våra
      färger", `PRINT_PALETTE` i `src/engine/color-choice.ts`): gravyrplastens framsidor ur
      verkstadens katalog, med samma namn och hex. Sju av dem är verkstadens egna
      standardfärger för tryck (`PRINT_STANDARD_COLORS`, deras `PRINT_STANDARD_RGB`), som
      `catalog-sync.test.ts` jämför med deras katalog när deras projekt ligger bredvid på
      datorn. Ett test vaktar att paletten är just plastens framsidor. Guld och silver är
      här platta tryckfärger, inte metall. En ruta är markerad bara när färgen är exakt dess.
    - **Loggans färger läses av och visas först** (besked av ägaren 2026-11-19: systemet ska
      läsa av loggan och visa vilken färg som passar bäst). Loggans färger står i rutan "Från
      er logga", och under en av dem står "Passar bäst": loggans huvudfärg om den syns bra mot
      skyltens yta, annars nästa (`bestTextColor`). Färgen föreslås men väljs inte av sig själv.
    - **De avlästa färgerna visas med kod och går att rätta** (besked av ägaren 2026-11-19:
      "så att man ser vilken färgkod det är, så man kan ändra det på rätt sätt om det skulle
      vara fel"). När en logga läggs in läses dess färger av (`LogoTrace.colors` i
      `trace-image.ts`) och sparas med skylten som `BadgeLogo.colors`: högst fyra skärmfärger,
      den som täcker mest först (`LOGO_COLORS_MAX`). De påverkar aldrig hur loggan ritas,
      graveras eller trycks.
      - Rutan "Avlästa färger ur loggan" står under loggans bild (`LogoColors` i
        `sections/logo-colors.tsx`): en färgruta och ett hexfält per färg. Kunden rättar med
        färgväljaren eller koden (åtgärden `logo/colors`, `cleanLogoColors`). Bara sex
        hexsiffror sparas, aldrig en CMYK- eller PMS-kod.
      - **Pantone finns inte här** (ägarens besked samma dag: "vi kan inte köra Pantone just
        nu, för vi har ju inte köpt det ännu"). Koden är en skärmfärg, som i hela färgvalet.
        Gissa aldrig en Pantone-kod ur en bild.
      - Under färgerna står vad de leder till: "Närmast i plast: Vit / Röd", med knappen Välj
        eller ordet Vald. Raden följer regeln
        `logoColorCombo` i `src/lib/brand/match.ts` (till 2026-11-20 valdes färgen också av sig
        själv vid en hämtning från en hemsida): loggans egna färger styr, och hemsidans
        bara när loggan är svart, vit eller grå. **En logga som trycks i sina egna färger får
        aldrig en yta som dess huvudfärg syns dåligt mot** (kontrast under `GOOD_CONTRAST`):
        en röd logga ger vit skylt med röd gravyr, inte röd skylt. En logga som graveras tar
        gravyrens färg, och då bär ytan gärna varumärkets färg. Regeln om synlighet lade jag
        till själv; förut kunde en hämtad logga hamna på en yta i sin egen färg.
      - På metall räknas bara ytans färg (`matchColorCombo`, `isPrintOnly`): katalogens
        "gravyrfärg" är där bara tryckets förvalda svarta. Förut gav varje mörkt varumärke
        metallens första yta, Vit matt.
      - Raden "Färger ● → Vit / Röd" i sammanfattningen efter en hämtning var missvisande:
        pricken var hemsidans färg, och namnet var skyltens valda färg. Den heter nu
        "Hemsidan" och visar hemsidans färger med kod.
      - **Bara fyllda ytor räknas vid avläsningen** (`paletteOf` i `logo-color.ts`): en pixel
        i kanten är loggans färg blandad med bottnen. En röd logga i tunna linjer på vit
        botten lästes annars som rött och två rosa. Har loggan nästan ingen fylld yta räknas
        alla pixlar, och det som ligger mellan en renare färg och bottnen tas bort. En logga
        som spåras i en färg läses ur det som är bläck (`inkPalette`).
      - En skylt sparad före 2026-11-19 saknar `colors`. Då läser textfärgens förslag
        loggans bild som förut (`useLogoColors`), och rutan med koder visas inte förrän
        loggan läggs in igen.
      - Provat lokalt 2026-11-19 i webbläsaren, på dator och på 390 och 320 px: en röd
        linjelogga (läses exakt som filens #C8362D), en logga i tre färger, en svart logga,
        rättning, omladdning och hämtning från en hemsida. Inte provat i drift.
    - **"Egen färg"** är en knapp som öppnar färgväljaren och ett hexfält. Fältet sparar bara
      sex siffror, med eller utan brädgård (`printHex`, verkstadens egen regel). En
      halvskriven kod, eller en CMYK- eller PMS-kod, sparas aldrig.
    - **Låg kontrast varnar**: syns färgen dåligt mot skyltens yta (`contrastRatio` under
      `LOW_CONTRAST`) står "Färgen syns dåligt mot skylten." under valet.
    - **Namnet ska inte försvinna när skylten byter yta** (ägaren mötte 2026-11-19 att namnet
      försvann vid byte mellan plast och metall). Texten själv tappas aldrig; det jag fann
      var att ett byte från plast till metall alltid gav materialets första yta, Vit matt, och
      att en ljus textfärg då inte syntes. Två rättningar:
      - Skyltmotorn minns ytan eller färgen per material (`lastColors` i `designer.tsx`,
        `colorId` i åtgärden `material`): mässing → plast → metall ger mässing igen.
      - En textfärg som inte syns mot den nya ytan tas bort när materialet eller ytan byts
        (`withVisibleInk`, kontrast under `INVISIBLE_CONTRAST`), så att trycket får ytans
        förvalda färg. Det gäller bara färger som faktiskt printas: på en skylt som graveras
        ligger kundens textfärg kvar oanvänd.
      - **Felet är inte återskapat som ägaren beskrev det.** I Chrome och i Safaris motor
        stod namnet kvar genom alla byten, i textfälten, ritningen, 3D-vyn och startrutan.
        Kommer det tillbaka behövs de exakta stegen.
    - **Loggan har ingen egen färg.** En svartvit logga som printas får textfärgen, och en
      logga i färg trycks ur sin bild. Fältet "Loggans färger i CMYK" och åtgärden
      `logo/color` är borttagna.
    - Textradens kort får krympa till panelens bredd (`minmax(0, 1fr)` i `.rows`, `.rowInner`
      och `.sliderRow`). På en 320 px bred telefon blev kortet annars bredare än panelen, så
      att radens kryss hamnade utanför.
    - Läs alltid med `printColorOf`, `printInkOf`, `rowPrintColorOf` och `rowPrintInkOf`: de
      ger bara färgen när något faktiskt printas, så att en färg som står kvar efter ett byte
      till gravyr inte följer med. Färgen ritas i ritningen, 3D-vyn och fotoläget
      (`LaidOutRow.ink`, `EngravedPath.ink`, `BadgeLayout.printInk`; i 3D en yta per färg).
      Tryckets färg färgar också ramen och rader utan egen färg.
    - `printColorLabel` ("Tryckfärg #0057B8, rad 2 #E31C23") står bredvid fästet på
      ordersidor, offert, korrektur och i Tillverkning, och i verkstadens `productionNote`.
      Raderna räknas som de står på skylten, utan tomma rader.
    - Verkstaden får färgen som fyllnad på banorna i trycklagret, alltså samma hex som
      kunden såg. `SupplierTextRow.color` används bara när namnet skickas som text, utan
      glyfkonturer. Produktionsfilen och maskinfilerna bär aldrig färgen.
    - "Fler namn" och "Ny personal" ger varje nytt namn samma färg per rad som mallen.
    - **En äldre skylt kan bära en kod i fritext** (från 2026-11-16 till 2026-11-18: CMYK, PMS
      eller hex, också på loggan). Den läses och ritas som förut (`cmykOf`, `cmykHex`,
      `printColorHex`, `printColorText`, `logoPrintColorOf`), och koden står kvar i etiketten
      på en sparad order. Men **en skylt med en sådan kod säljs inte som den är**
      (`hasScreenPrintColors` i `isOfferedDocument`). När den öppnas i skyltmotorn blir en
      CMYK-kod färgen den visades i, en kod som inte gick att rita tas bort, och loggans
      koder tas bort (`withScreenPrintColors` i `toOfferedDocument`). Ett sparat arbete i
      webbläsaren med en sådan skylt kastas.
    - Provat lokalt 2026-11-19 i webbläsaren, på dator och på 390 och 320 px, och i hela
      kundflödet mot en låtsasverkstad. Ingen order med en textfärg har gått till verkstaden
      på riktigt.
    - Pantone som väg till exakt färg är inte byggt. Verkstadens tryckfil har redan
      namngivna specialfärger för skärlinjerna (`CutContour`), så tekniken finns där, men
      det vore nytt i båda projekten och kräver Pärs svar om RIP:en har ett Pantone-bibliotek.
  - Preliminärt: att verkstaden printar text, och i vilken färg. Utan vald färg visas ett
    printat namn i gravyrens färg.
  - Kända brister: produktionsfilen saknar det som printas och ingen tryckfil för namnet skapas.
    Gravyranimationen sveper inte över det som printas. Fotoläget, korrekturet, offertens PDF
    och delningsbilden är inte öppnade i webbläsaren med ett printat namn.
- **Gravyrformen av en logga i färg** (besked via ägaren 2026-11-16, som fick en svart klump när
  en färglogga graverades): en logga i färg bär två banor i samma ruta. `d` är siluetten, som
  trycket, 3D-ytan och arkvyn följer. `engraveD` är det som fräses när loggan graveras, med
  detaljerna kvar. Läs alltid med `logoEngravingPath`; utan fältet graveras siluetten, som på
  äldre skyltar. `layoutBadge` väljer rätt bana (`placeLogo`), så ritning, 3D, produktionsfil och
  verkstadens underlag följer med.
  - Reglerna ligger i `src/engine/logo-engrave.ts` och är vanlig bildbehandling, ingen AI:
    bläck är det som syns och är mörkt eller färgstarkt nog, ljusa ytor intill bläck blir
    urtag, vitt som står för sig självt graveras, och en detalj i annan färg som ligger
    innesluten i en fylld form blir urtag. Detaljer letas tre pixlar innanför kanten, så att
    kantens blandfärger i en JPG inte tas för en platta.
  - Blir gravyrformen i praktiken hela siluetten, eller loggan för ljus för att delas, sparas
    ingen `engraveD`.
  - Gravyrformen räknas i webbläsaren varje gång en logga läggs in (`colorTrace` i
    `trace-image.ts`). En logga som saknar den får den i bakgrunden när den graveras
    (`useLogoEngraving`, åtgärden `logo/engraving`).
  - "Invertera" finns för allt utom en logga som printas i färg. På en logga i färg vänder den
    bläck och urtag inom siluetten. Samma fil i ny form behåller vald märkningsmetod
    (`keepMarking`).
  - I en delad länk stryks först den bana som inte ritas: gravyrformen när loggan printas,
    siluetten (byts mot rutan) när den graveras.
  - En vit botten i en JPG tas bort redan i `colorLogo`, även inuti loggan, så sådana loggor
    hade urtagen förut. Gravyrformen gör skillnad för frilagda PNG och SVG.
  - Kända brister: inverterad tappar delar som står för sig själva, en radiell toning kan få
    ett hål i mitten, och loggor som spåras på servern (utskicket) får ingen gravyrform.
- **Loggan** graveras eller trycks. När filen laddas upp eller hämtas från hemsidan får den ett
  förslag (beslut av ägaren 2026-11-13, gäller både metall och plast), och kunden kan sedan byta
  under Märkningsmetod (2026-11-16, se ovan):
  - En **svartvit** logga spåras till banor (`BadgeLogo.d`) och föreslås få samma metod som namnet.
  - En logga **i färg** får dessutom `BadgeLogo.image` och föreslås tryckt som den är i filen.
    "Invertera" finns bara för graverade loggor.
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
  - Loggan kostar inget eget, varken graverad eller tryckt (se Prismodellen).
  - **Originalfilen sparas** (2026-11-15, migrering 024, tabellen `logo_originals`). Skyltmotorn
    laddar upp filen kunden valde (SVG, PNG, JPEG, WebP, GIF eller PDF, högst 10 MB) i bakgrunden
    till `POST /api/logo-originals`, som läser typen ur innehållet och sparar filen under sin
    SHA-256. Loggan bär `BadgeLogo.originalId`, som aldrig påverkar ritning, pris eller banor.
    Går uppladdningen inte fungerar allt som förut, utan fältet.
    - Filen hämtas i panelen: "Originalfil för loggan" på order och offert och "Loggans original"
      i Tillverkning. `GET /api/logo-originals/<id>` kräver inloggning i panelen och svarar alltid
      som nedladdning, så att en SVG aldrig visas i sidan.
    - Koden ligger i `src/lib/logo-images/` (`original-model.ts`, `originals.ts`).
      `withStoredLogoImages` tar bort ett `originalId` som inte finns på servern. Delningskoden
      behåller fältet när det ryms och stryker det först om koden blir för lång.
    - En logga hämtad från en hemsida i skyltmotorn sparar bilden servern hämtade, inte sajtens
      SVG. Butikernas förvalda loggor och utskickets skyltar får inget original.
    - Originalet skickas inte till verkstaden, eftersom anropet har en gräns på 6 MB. Hur
      verkstaden ska få filen är inte bestämt; i dag hämtas den för hand i panelen.
    - Beställer kunden innan uppladdningen är klar blir ordern utan `originalId`.
  - **Loggor som ingen använder städas bort** en gång per dygn (`deleteUnusedLogoFiles` i
    `cleanup.ts`, jobbet `logo-cleanup`): bilder och original som är äldre än 30 dagar och som
    ingen JSON-kolumn i databasen pekar på. Följden är att en delad länk som aldrig blev order
    eller offert tappar sin logga i färg efter 30 dagar.
  - Känd brist: mjuka, halvgenomskinliga kanter i en logga (en skugga eller ett sken) klipps i
    3D-vyn, eftersom ytan följer siluetten; ritningen visar hela bilden.
- **En logga från en hemsida får aldrig komma fram som en svart ruta** (ägaren fick
  2026-11-19 två alternativ från en hemsida, loggan och en svart ruta, och en skylt med bara
  streck när rutan valdes). Sidans logga låg bakom bildtjänsten i Next.js
  (`/_next/image?url=…&w=96`), som väljer format efter vad mottagaren säger sig ta emot. Vår
  förfrågan sa bara `image/*`, och då gör tjänsten om en genomskinlig WebP till JPEG: bottnen
  blir svart, och en svart logga syns inte mot den. Tre rättningar i `src/lib/brand/`:
  - **Förfrågan räknar upp formaten**, som en webbläsare (`LOGO_ACCEPT` i `profile.ts`:
    WebP, PNG, SVG). Ta inte bort WebP ur den: då kommer JPEG tillbaka från sådana tjänster.
  - **Originalet bakom bildtjänsten hämtas först** (`unoptimizedImageUrl` i `url.ts`, för
    `/_next/image` och `/_vercel/image`): det är skarpare än de 96 px sidan visar loggan i,
    och har kvar sin genomskinlighet. Går det inte hämtas tjänstens adress som förut. Adressen
    går genom samma `safeFetch` som övriga loggor.
  - **En heltäckt ruta i nästan en enda ton är ingen kandidat** (`blankLike` i
    `logo-image.ts`): täcker bilden hela sin yta, och skiljer sig under 0,2 % av den mer än
    64 tonsteg från den vanligaste tonen, tas den bort innan modellen eller kunden ser den.
    En logga på genomskinlig botten är aldrig tom. Gränserna valde jag efter den bild som
    gav felet (ljusaste pixeln 59 av 255).
  - Miniatyrerna under "Fel logga?" krymps nu till sina rutor. En kvadratisk logga stack
    förut ut under rutan.
  - Provat lokalt 2026-11-19 mot samma hemsida, i skyltmotorn i Chrome: loggan kommer i
    854 px med genomskinlig botten och hamnar hel på skylten.
  - Kontrollerat i drift samma dag efter pushen (`150309e`), bara läsning: samma hemsida ger
    en enda logga, hel på skylten, och raden "Fel logga?" visas inte, eftersom modellen
    valde bort flaggan och ikonen.
  - Känd brist: utan AI-modellen (lokalt, eller när den inte svarar) kom också sidans runda
    språkflagga och kontoikon med som alternativ. `flagLike` känner inte igen en rund flagga
    på vit botten. I drift väljer modellen bort dem.
- **Loggan laddas upp. Hämtningen från en hemsida är borttagen ur skyltmotorn** (besked av ägaren
  2026-11-20, senare samma dag som punkten under: "Du kan ta bort hämta logo från URL helt och istället
  bara behålla ladda upp logo/bild på ett snyggt sätt").
  - Sektionen heter **Logga** och har en släppyta (`.logoDrop` i `sections.module.css`,
    `LogoSection`): "Ladda upp logga eller bild", med "Dra hit filen eller klicka för att välja" och
    formaten under. Filen dras dit eller väljs med ett klick eller tangentbordet. Med en logga på
    skylten blir rutan en låg rad, "Byt logga eller bild", och under loggans bild står Invertera
    och "Ta bort loggan". En fil som släpps i rutan har inte gått genom filväljarens filter, så
    typen prövas (`ACCEPTED`).
  - Borta: rutan för hemsidan, sammanfattningen (Företag, Hemsidan, Bransch), "Fel logga? Välj en
    annan från sidan", `brand-api.ts`, vägen `POST /api/brand` och `onWorkplace`. Miljön till
    personbilden skriver kunden själv i fältet Miljö under På person.
  - **Koden som läser hemsidor ligger kvar** (`src/lib/brand/`, `scrapeBrand`): panelens
    "Hämta från hemsidan" under Inställningar, butikerna och utskicket använder den. Det som står
    om den i punkterna här under gäller alltså dem, inte skyltmotorn.
  - Förslaget på skyltfärg under loggans avlästa färger räknar bara på loggans egna färger
    (`siteColors` skickas tom).
  - Provat lokalt 2026-11-20 i Chrome på dator och 390 px (14 kontroller): uppladdning, byte och
    borttagning. Att dra en fil till rutan är inte provat i en webbläsare.
- **Hämtningen från en hemsida lägger bara loggan på skylten** (gällde några timmar 2026-11-20, tills
  hämtningen togs bort ur skyltmotorn, se punkten över; besked av ägaren: "Dessutom
  så ändrar skylten färg om man hämtar en ny URL. Den ska bara hämta logo. Inget annat."). Förut
  bytte den också typsnitt och skyltens färg (`fetchBrand` i `logo-section.tsx`), så att en ny
  hämtning ändrade det kunden redan hade valt. Märkningsmetodens förslag och loggans plats
  följer fortfarande med loggan, som vid en uppladdning.
  - Färgen som passar loggan föreslås som förut under loggans avlästa färger ("Närmast i plast …
    Välj"), men väljs aldrig av sig själv. **Följden är att en logga med vit text hamnar osynlig
    på en vit skylt** tills kunden byter färg. Förut valde hämtningen en yta loggan syntes mot.
  - Sammanfattningen efter hämtningen visar Företag, Hemsidan (färger) och Bransch. Raden
    Typsnitt är borta. Arbetsplatsen till personbilden (`onWorkplace`) följer fortfarande med,
    eftersom den inte ändrar skylten. Det valde jag.
- **Loggan spåras i dubbel upplösning, med kanten lagd mellan pixlarna** (samma besked: ägaren
  hämtade en logga från en hemsida och fick kantiga, hackiga bokstäver, "kan vi skapa en ännu
  mer detaljerad logo-hämtare"). Felet återskapades med en logga i färg som graverades på en röd
  plastskylt: gravyrformen spårades i 640 px, där en bokstav bara var ett fyrtiotal pixlar hög,
  så att ett G blev en tolvhörning. Fyra ändringar:
  - **Alla banor spåras ur en bild på 1040 px** (`TRACE_MAX_PX` i `trace-image.ts`), förut 520 px
    för en svartvit logga och 640 px för en i färg. **Bilden som trycks är fortfarande högst
    640 px** (`COLOR_MAX_PX`, `encodePng`): banorna och bilden delar ruta men inte upplösning,
    så `viewWidth` är inte bildens bredd i pixlar.
  - **Reglerna för brus räknar som förut** (`grain` i `inkMask`, `inkTrace`, `engravingMask`,
    `traceLogoEngraving` och `carveEnclosedDetail`): måtten i pixlar växer med upplösningen, så
    att samma fläck och samma smala rand räknas som brus. En finare bild ger jämnare kanter,
    inte fler smådelar. Utan `grain` gäller de gamla måtten, som servern (utskicket) använder.
  - **Kanten läggs där den faktiskt går** (`TraceOptions.soft`, `crossing` i `contours` i
    `src/engine/logo.ts`): spåraren får bildens genomskinlighet eller ljushet som mjuk mask och
    flyttar varje punkt längs sin pixelkant, högst en halv pixel. Vad som är bläck avgör masken
    ensam, och en mjuk mask som säger emot masken används inte. En sned linje blir två punkter
    i stället för ett trappsteg. Toleransen är 0,5 px (`TOLERANCE_PX`). Utan `soft` spåras
    exakt som förut: egen form, utskicket och äldre tester är orörda.
  - **En bild som är mindre än 1040 px jämnas till innan den spåras** (`smoothPixels`, bara
    den svartvita vägen), och **en suddig kant tas inte för en platta** (`isBlurredRim` i
    `logo-mask.ts`): en liten JPEG med mörk text på vitt spårades annars som ihåliga
    konturer, eftersom den grå randen runt bokstaven togs för en platta med bokstaven som
    detalj. Loggan i färg jämnas inte till, eftersom samma pixlar blir bilden som trycks.
  - **Servern hämtar den största bilden** när sidan läses utan Chrome (`largestInSrcset` i
    `parse-html.ts`, förut `src`, alltså den minsta), och ritar en SVG i 1200 px i stället för
    800 (`SVG_RASTER_PX`).
  - En logga som redan ligger på en skylt ändras inte: den spåras om först när den läggs in
    igen. Banan blir ungefär lika lång som förut, eftersom raka kanter behöver färre punkter.
  - Mätt i Node på en kvadratisk logga i 1040 px: siluetten 26 ms, gravyrformen 285 ms och en
    svartvit logga 292 ms. Inte mätt på en telefon.
  - Provat lokalt 2026-11-20 i Chrome: en logga i färg hämtad från en hemsida, graverad på röd
    plast och tryckt på blå (ritning och 3D), och fyra påhittade loggor, varav två små JPEG.
    **Ägarens egen hemsida är inte provad**: adressen stod inte i beskedet, och provet gjordes
    med en sida som gav samma ord i loggan. Inte provat i Safari eller på en telefon.
  - Kontrollerat i drift 2026-11-20 efter pushen (`05f7779`), bara läsning, med uppladdningen
    av loggan stoppad i webbläsaren: en hämtning i skyltmotorn lämnar skyltens färg och
    typsnitt orörda, loggans ruta är 994 bred och raden Typsnitt är borta. Loggans vita text
    syntes inte på den vita skylten, som väntat.
  - Kända brister: i en mycket liten bild (110 px bred i provet) kan två bokstäver som står
    tätt flyta ihop. Kanten mellan två färger inuti en logga förfinas bara när den ena är
    ljus och den andra bläck. Loggor som spåras på servern (utskicket) får inget av detta.
- **Loggans storlek och ritningens handtag** (besked via ägaren 2026-11-18, som drog reglaget
  i botten utan att loggan växte mer än marginellt, och ville dra i kanten på logga och text):
  - **`BadgeLogo.sizing: "free"`** sätts när kunden själv ändrar storleken, med reglaget eller
    ett hörnhandtag (åtgärden `logo/height`). Då får loggan ta upp till 72 % av bredden bredvid
    texten och 70 % av höjden ovanför den (`LOGO_FREE_…` i `layout.ts`, `fitFreeSide` söker
    fram höjden som ryms i en oval). **Utan fältet gäller de äldre taken, 40 % och 50 %**, så
    att redan sparade skyltar, butikernas förvalda skyltar och utskickets bilder ritas som
    förut. Ta inte bort den skillnaden: annars växer loggan på allt som redan är sparat.
  - **Reglaget "Storlek"** går från 4 mm till det som ryms (`logoHeightLimits`) och visar
    höjden loggan faktiskt ritas i. Förut gick det till 40 mm, fast loggan slutade växa
    långt tidigare.
  - **Hörnhandtag i vyn Ritning** (`BadgeEditor`): loggan och texten dras större eller
    mindre i ett hörn. Storleken följer pekarens avstånd till rutans mitt. Texten ändrar
    versalhöjden på alla rader med samma faktor (åtgärden `rows/caps`). När kunden släpper
    sparas storleken layouten faktiskt ritade, inte den pekaren bad om.
    - Handtagen ligger i ett eget lager överst och ritas bara för den ruta som är vald eller
      som muspekaren är över. Står loggan ovanför texten möts deras hörn, och ett osynligt
      handtag på den andra rutan tog annars greppet.
    - Handtagen har ingen tangentbordsväg. Reglagen i panelen gör samma sak.
  - Blir loggan mycket stor krymps texten, och raden "Texten krymps" visas som vanligt.
- **Texten håller minst 2 mm luft mot loggan, också när någon av dem har flyttats** (besked via
  ägaren 2026-11-18, som fick texten över en flyttad logga: "behöver lägga någon minsta
  marginal mellan logo och text, så att det ligger automatiskt"). Förut räknades textytan
  alltid från loggans ursprungliga plats, så en logga som dragits några millimeter hamnade
  under texten. Den automatiska placeringen hade redan 2 mm (`LOGO_TEXT_GAP_MM`).
  - **En flyttad logga flyttar textytan** (`clearOfLogo` i `layout.ts`): texten får den större
    av ytorna på var sin sida om loggan, till höger eller vänster om en logga bredvid texten,
    under eller över en som står ovanför. Texten krymps hellre än att hamna under loggan.
    Dras loggan till andra sidan av skylten byter texten alltså sida.
  - **Texten går inte att dra närmare loggan än marginalen** (`awayFromLogo`): flytten dras
    tillbaka så långt som behövs. En flytt som passade ett kort namn drog annars ett långt
    namn i samma design in över loggan.
  - Ryms texten inte på någon sida om loggan (under `MIN_TEXT_SHARE`, en fjärdedel av
    innehållets bredd eller höjd) gäller placeringens egen yta, och då varnar skyltmotorn
    som förut för att loggan ligger över texten.
  - En logga som står där placeringen lade den ändrar ingenting i layouten. En sparad skylt
    med flyttad logga eller text ritas däremot med luften, alltså inte exakt som förut.
  - Kötestet `src/lib/outreach/claim.integration.test.ts` föll en gång samma dag och gick
    sedan igenom fyra gånger i rad. Det läser utskickets kö i den lokala databasen och
    störs av att något annat rör den samtidigt.
- **Ritningens yta** (samma besked: ritningen var "väldigt statisk" jämfört med 3D-vyn):
  förhandsvisningen ritar skyltens färg med ljus, reflexer och en fasad kant ovanpå
  (`surfaceMarkup` i `render-svg.ts`). Borstad metall, och plastens guld och silver, får
  ljusa stråk och fina borstlinjer; slät plast och lackad metall får mjukt ljus och en sned
  reflex; akryl och epoxy är blankare. Bilden står still. Det gäller alla förhandsvisningar
  (ritningen, miniatyrer, korrektur, offert, delningsbild och personbildens referens), aldrig
  produktionsfilen, som bara har skärlinje och gravyr.
- **Ordval:** sajten säger inte "graverad" om hela sortimentet, eftersom loggor i färg trycks.
  Sajten säger "namnskyltar", "tillverkas", "till tillverkningen" och "Korrektur innan
  produktion" (beslut av ägaren 2026-11-15), även i flikens titel, butikernas sidfot,
  korrekturet, offertens PDF och mallarna för nya butikssidor. Där texten gäller just gravyren
  (skyltens text, "Graverad ram", en graverad logga, exemplen i inspirationsbanken) står ordet
  kvar. Inte ändrat: utskickets mejltext (`src/lib/outreach/copy.ts`) och innehåll som redan är
  sparat i butikerna.
- Sektionen Märkningsmetod och loggans sektion säger "print" och "printas", som i ägarens bild
  (2026-11-16). Övriga sajten säger fortfarande "trycks".
- **Äldre material och former** (mässing, akryl, epoxy, gravyrplast, sexkant m.fl.) ligger kvar
  i motorn så att sparade ordrar, offerter och butiker går att rita. En äldre skylt som öppnas
  i designern flyttas till närmaste yta och ämne (`toOfferedDocument`).
- **Orderspärr:** en order eller offert får bara innehålla skyltar i dagens sortiment
  (`isOfferedDocument`, `allOffered` i `src/lib/orders/model.ts`). Spärren sitter i de tre
  API-vägarna, i "Beställ igen", ny personal, mallar och offertgodkännande, och sist i
  `placeOrder`. En äldre order går alltså inte att upprepa utan att skylten görs om.
- **Pris:** se avsnittet Prismodellen. Alla ämnen kostar lika, även Lång rektangel.
- **Verkstaden:** metallskylten har `precut: true` och produktionsmetoden `blank`. Ämnena läggs
  med gods emellan. Ämnets kant och rubrikerna är hjälplinjer (`guide`) som syns på skärm och
  korrektur men aldrig skrivs till maskinfilerna. Sedan 2026-11-18 printas metallen, så på ett
  ämne graveras ingenting: namnet är också hjälplinjer i arkvyn. En äldre metallskylt utan
  vald metod läggs fortfarande upp med sin text som gravyr.
- **Inspirationsbanken** har åtta exempel, alla i dagens sortiment: fyra i metall (tre på
  rektangeln 60 × 30 mm och ett på ovalen 63 × 32 mm) och sedan 2026-11-21 fyra i plast, se
  nedan. Metallens personbilder är äldre och visar skyltar i de tidigare proportionerna.
  - **Fyra exempel i plast** (besked via ägaren 2026-11-21: "lägger du till 3 st gjorda i plast
    också", en med nål och enbart gravyr, en med magnet, graverat namn och printad logga, och
    en i egen design, "typ en bil", och senare samma dag "gör även en klassisk i plast för
    läkare med klämma"). De står efter de fyra i metall, med den klassiska först:

    | Exempel | Skylt | Fäste | Märkning |
    | --- | --- | --- | --- |
    | `lakare` | Vit / Svart, lång rektangel 80 × 25 mm, utan logga | Klämma, horisontellt | Endast gravyr |
    | `ica` | Röd / Vit, rektangel 75 × 25 mm, loggan till vänster | Nål | Endast gravyr |
    | `ikea` | Gul / Svart, kudde 75 × 35 mm, loggan ovanför | Magnet | Namn graveras · logotyp printas |
    | `bil` | Blå / Vit, egen form 92 × 44 mm, utan logga | Magnet | Endast gravyr |

    - **Märkningsmetoden står på en egen rad under närbilderna**, för alla sju exempel
      (`InspirationEntry.marking`, läst ur skylten med `markingOf`). Den skiljer plastexemplen
      åt, och metallens säger "Endast print". Raden lade jag till själv.
    - **IKEA-loggan printas i en färg, blått (#0057B8), ur sina banor**, inte som en bild i
      färg. Då bär länken "Gör en liknande" hela skylten: en bild i färg hade behövt ligga i
      driftens databas, där loggor som ingen order pekar på städas bort efter 30 dagar. Lägg
      inte in en logga med `image` i katalogen.
    - **Bilen är en egen kontur på 36 punkter som jag ritade själv**, ingen AI-bild och inget
      formförslag i skyltmotorn. Den ligger i `badges.json`. Företaget (Bilia), namnen,
      färgerna och att bilen har magnet valde jag; skylten bär ingen logga.
    - **Personbilderna för ICA och IKEA är de äldre AI-bilderna från oktober**, som låg kvar
      från när de två exemplen fanns förra gången. De visar plastskyltar i rätt färg, men
      inte exakt dagens skyltar: IKEA-loggan är mörk på bilden och blå på skylten.
    - **Bilen och läkarskylten har personbilder gjorda 2026-11-21** (ägarens besked samma
      dag, på frågan om AI-bilder: "Gör så att både bil-bilden och läkarskylten får en person
      per bild"). Två bildgenereringar, en per exempel, på samma väg som sajtens "På person":
      skylten ritad som referens (`renderBadgePng`), uppdraget ur `personaPrompt` och
      `editImage` i medelkvalitet, 1024 × 1536, nedskalade till 800 × 1200. Skriptet är
      `tmp/insp-plast/person.ts` (gitignorerat). Kön och ålder satte jag själv efter namnen,
      och miljön beskrevs utan företagsnamn och utan loggor: en bilhall och ett
      undersökningsrum på en vårdcentral.
      - Namnen på skyltarna är rätt i bilderna. Titelraden är liten och inte skarp när man
        zoomar in, som på de äldre bilderna.
      - Läkarens skylt sitter strax ovanför bröstfickan i bilden, inte på fickans kant som en
        klämma gör i verkligheten. Jag gjorde ingen ny bild för det.
      - De första timmarna visades skyltarna i tre kvart ur 3D-vyn i stället för foton
        (commit `e8efc0b` och `9435c7a`).
      - Priset per bild är inte kontrollerat mot OpenAI-kontot.
    - **Läkarskylten** är den klassiska: vit plast med svart gravyr, namn och "Leg. läkare",
      utan logga, på klämmans format. Företaget (Capio), namnet och titeln valde jag. Närbilden
      på fästet visar klämman som den ritas i 3D, med vikningen till vänster sett framifrån,
      vilket är min tolkning av Mats besked (se Fästen).
    - Loggorna för ICA och IKEA är de spårade banorna från första versionen av banken
      (commit `0c18064`).
    - Skyltarna byggdes med motorns egna funktioner i ett skript, `tmp/insp-plast/bygg.ts`
      (gitignorerat), som också prövar dem mot schemat och sortimentet.
    - Provat lokalt 2026-11-21 i Chrome på dator, 390 och 320 px (35 kontroller): åtta exempel,
      alla bilder, texterna under närbilderna, och att "Gör en liknande" öppnar var och en av
      de fyra i skyltmotorn med rätt material, form och namn.
    - Kontrollerat i drift 2026-11-21 efter pusharna (`e8efc0b`, `9435c7a` och, med
      personbilderna, `9ab5c41`), bara läsning
      (10 av 10): åtta exempel, alla 32 bilder laddas, och "Gör en liknande" öppnar de fyra
      plastskyltarna. Skärmbilder ligger i mappen
      `Namnskylt-inspirationsbank-atta-exempel-2026-11-21` på ägarens skrivbord. Mappen
      `Namnskylt-plastexempel-2026-11-21` där är från före läkarskylten.
  - **Exemplen står under varandra, med närbilder på valen till höger** (besked från Pär via
    ägaren 2026-11-20, som först föreslog en egen flik med alla val och sedan detta: "4 bilder
    under varandra o till höger om resp visar närbilder på de val vi gjort", "inte massa lull
    lull utan bara tydligt o enkelt överskådat"). Förut stod fotona två i bredd, och skylten
    och valen låg bakom ett klick, i en dialog. Dialogen och brödtexten är borta.
  - **Tre närbilder per exempel: Yta, Form och Fäste** (`InspirationDetail`, `details` i
    `src/lib/inspiration/catalog.ts`). Texten under varje bild läses ur skylten själv, så att
    den alltid stämmer med skylten som "Gör en liknande" öppnar. Vilka tre val som visas valde
    jag: Pär sa "de val vi gjort".
  - **Närbilderna är tagna ur skyltmotorns egen 3D-vy**, inga AI-bilder:
    `public/inspiration/<exempel>-yta.jpg`, `-form.jpg` och `-faste.jpg`, 960 × 720. De togs
    genom att öppna varje exempel i skyltmotorn som inloggad, öppna offertvyn, som tar en bild
    i tre kvart och tre vinklar, och läsa bilderna ur förhandsvisningen. Ytan är bilden i tre
    kvart inzoomad, formen är skylten rakt framifrån och fästet är baksidan. Ändras ett
    exempels skylt ska dess tre bilder tas om på samma sätt.
  - Länken "Gör en liknande" räknas på servern (`encodeShareCode` i sidan), så sidan behöver
    inget eget skript.
  - Plastens oval och stora rektangel syns inte här.
    Nya exempel kräver nya personbilder, som är AI-bilder och kostar pengar: fråga först.
  - De äldre skyltbilderna från fotoläget (`<exempel>-badge.jpg`) används inte längre men
    ligger kvar i `public/inspiration/`, som personbilderna för de två borttagna exempel som
    inte har kommit tillbaka (MAX och Spotify).
  - Provat lokalt 2026-11-20 i Chrome, på dator och på 390 och 320 px, och kontrollerat i
    drift samma dag efter pushen (`bc007f1`): fyra exempel under varandra, alla bilder laddas,
    och "Gör en liknande" öppnar exemplets skylt.
- **Preliminärt tills verkstaden bekräftat:**
  - Metallämnenas mått och tjocklek är verkstadens egna sedan 2026-11-17. Uppskattade är
    fortfarande rektanglarnas hörnrundning (3 och 2 mm) och TV-brickans form.
  - Artikelkoden `namnskylt-metall` och priset 89 kr är antaganden.
  - Trycket visas svart på alla tre ytor när kunden inte anger en färg, och mässing och nickel
    ritas borstade.
  - Kuddens exponent (`CUSHION_EXPONENT`), som också ritar TV-brickan, är uppskattad från foto.
  - Avståndet mellan ämnena i fixturen (`BLANK_GAP_MM`, 4 mm) och att rubrikerna inte graveras.
  - Att verkstaden kan trycka i färg på både metall och plast, och vilken tryckfil den behöver.
    I dag finns bara bilden på 640 px; originalfilen sparas inte.

## Prismodellen — läge 2026-11-15

Alla priser kommer ur en prismodell (`PriceModel` i `src/engine/price-model.ts`) som ägaren ändrar
i `/admin/prismodell`. Den sparas i `settings` under nyckeln `price_model`; utan sparad modell
gäller `DEFAULT_PRICE_MODEL`, som är kalkylen från 2026-11-13.

- **Direktordrar följer en egen regel** (2026-11-17): hos namnskylt.com utan återförsäljare
  fakturerar verkstaden kunden slutkundens pris, och plattformens del är marginalen på det
  beloppet, inte trappstegens provision. Se Ordern till verkstaden.
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
  - Högst upp ligger snabblänkar till varje kort (`SECTIONS` i `price-model-editor.tsx`,
    2026-11-16), eftersom sidan är lång och kortet Märkningsmetod ligger mitt på den. Varje
    kort går också att länka till, till exempel `/admin/prismodell#price-model-marking`.
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
  - **Inga "från"-priser på själva skylten** (samma besked): priset per skylt beror på antalet,
    så materialkorten och inspirationsbanken visar inget pris. Företagssidan visar priset per
    skylt vid 10, 50, 100 och 500 skyltar, med startkostnaden inräknad. `withoutStartCost`
    används bara där återförsäljaren ställer in butikens priser. Tillvalen har däremot ett pris
    från, se nedan.
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
  - **Den som beställer kan välja paket i stället för varubrev** (beslut av ägaren 2026-11-20,
    efter mötet med verkstaden: tre skyltar gav 159 kr i frakt, och Mats godtog att det
    billigaste står förvalt och att kunden väljer). Fraktsättet `parcel` är paket också för en
    order som annars går som varubrev (`withShippingMethod`), och verkstaden får `dhl-paket`.
    - Paketet visas bara när det är ett annat val än standardfrakten, alltså när ordern går
      som varubrev (`TablePrice.parcelChoiceSek`, `orderShippingChoices`). Då heter
      standardfrakten "Varubrev, PostNord" i väljaren och står förvald, med "Paket, DHL"
      bredvid. Går ordern redan som paket finns bara standardfrakten.
    - Kundens webbläsare får paketets pris av `POST /api/shipping` (`parcelSek`), bredvid
      standardfrakten (`useOrderShippingChoices`). Samma val finns när kunden godkänner en
      offert (`shownShippingOptions`) och i panelens `DeliveryPanel`, där båda alltid visas.
    - **Gränsen för varubrev kan sättas i antal skyltar** (`ShippingRule.letterMaxSigns`,
      fältet "Varubrev upp till" i kortet Frakt i `/admin/prismodell`). Med ett antal där
      avgör orderns antal skyltar, och varuvärdet gäller inte. **Fältet står tomt**, så
      gränsen är fortfarande 500 kr i varuvärde: ägaren sa ja till "det antal Mats anger", och
      Mats har inte angett något än. När antalet finns skrivs det in där, utan ny kod.
      Sparade ordrar och offerter har sin egen modell och ändras inte.
    - Provat lokalt 2026-11-20 i kundens kassa i Chrome: en skylt ger Varubrev 75 kr förvalt
      och Paket 159 kr, och summan följer valet. Offertens val och panelen är bara provade i
      tester.
    - **I drift visas paketet inte, eftersom det kostar lika mycket som varubrevet där.**
      Prismodellen i drift har sedan 2026-11-16 varubrev 75 kr, paket 75 kr och gränsen
      3 000 kr (läst 2026-11-20, bara fraktens fält; vem som ändrade den vet jag inte). All
      frakt är alltså 75 kr där, också för tio skyltar. Valet visas av sig självt när paketet
      får ett högre pris i `/admin/prismodell`. Jag har inte ändrat priserna.
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
    - **Kunden väljer leveranssätt när en offert godkänns** (2026-11-15), om skyltarna ska
      till kunden: namnskylt.coms kunder bland alla tre, en återförsäljares kund bland
      standard och express, och alltid det sätt som redan står på offerten
      (`quoteShippingMethods`, `acceptedDelivery`). Knappen visar summan för valet. Ska
      skyltarna till återförsäljaren gäller offertens fraktsätt.
    - **Expressfraktens pris** (migrering 028, `orders.express_shipping_sek`) läggs på ordern
      när verkstaden har satt det: av sig självt när verkstadens status bär `shippingCost`
      (`applySupplierUpdate`), och tills deras system finns av admin i Tillverkning
      (`ExpressPriceField`, `setExpressShipping`). Summan räknas om, kunden ser beloppet på sin
      ordersida, och återförsäljarens inköpslista bär samma belopp som fast frakt
      (`priceListsFor`). Byts fraktsättet bort från express nollas priset.
    - Kända brister: upphämtning kräver fortfarande en ifylld adress. En kortbetald order
      kan inte ha expressfrakt, eftersom priset inte är känt när kunden betalar.
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
  ett fäste (nål, klämma eller magnet), märkningsmetoden när den har ett pris och skyltens del av
  startkostnaden, och ramen när skylten har en (se nedan). Textrader och logga ingår. Slutkundens delar avrundas var för sig till hela
  kronor.
- **Ramen kostar extra** (beslut av ägaren 2026-11-20: "Ram (enkel eller dubbel) kostar 10 kr extra").
  Prisraden heter `frame` (`PriceOptionId`, `PriceItem.frame`, delen `frame` i `PricePart`), med ett
  pris per trappsteg som övriga tillval. Enkel och dubbel ram kostar lika.
  - **10 kr är det som står i prismodellen, alltså det återförsäljaren betalar**, som alla andra
    belopp där. Slutkunden betalar det med marginalen: 17 kr vid 40 %. Provisionen gäller ramen
    som övriga delar. **Att 10 kr är modellens pris och inte slutkundens är min tolkning**: ägaren
    sa bara "10 kr extra". Jag valde det för att ett fel åt det hållet syns direkt i skyltmotorn
    (17 kr), medan 6 kr i modellen hade gett kunden 10 kr och verkstaden för lite utan att någon
    märkte det. Ska kunden betala 10 kr sätts raden Ram till 6 kr i `/admin/prismodell`.
  - Kalkylen har 10 kr på alla trappsteg, och **migrering 038 lägger samma rad i den sparade
    prismodellen**. Ordrar och offerter har sin egen sparade modell utan raden: den läses som
    0 kr (`LATER_OPTION_IDS`, `upgradeStoredModel`), så redan lagda ordrar och offerter med ram
    behåller sitt pris.
  - **I skyltmotorn** står "Pris från: 17 kr" vid ramens val i sektionen Form (`frameFrom`,
    `.frameHead`), och specifikationen vid priset har raden "Ram" eller "Ram, dubbel". På metall
    finns ingen ram och inget pris. Ramen står också i skyltens rad på offerten, offertsidan,
    kundens ordersida och orderns sida i panelen (`frameLabel` i `marking.ts`).
  - Raden "Ram" finns i `/admin/prismodell` (Tillbehör och tillval, och som tillval i kalkylen Vid
    order) och i `/admin/inkopspriser`. Fraktfrågan bär `frame`, eftersom ramen ändrar varuvärdet.
  - Butikens påslag gäller ramen som övriga delar. Butikernas prisinställning har ingen egen rad.
  - Provat lokalt 2026-11-20 i Chrome på dator och 390 px: priset per skylt går från 431 till
    448 kr med ram, och dubbel kostar lika.
- **Tillvalen visar "Pris från: X kr"** (beslut av ägaren 2026-11-17): fästena, "Egen form"
  och märkningsmetoderna visar sitt lägsta pris, alltså priset på sista trappsteget, 501 eller
  fler (`lastTierIndex` i `pricing.ts`, `fromPriceLabel` och `markingFrom`, `customShapeFrom`,
  `mountingFrom` i `shop-price.tsx`). Priset är slutkundens, med butikens påslag, och ändras
  inte med orderns antal. Ett tillval som kostar 0 kr visar "Ingår".
  - Ett fäste som inte går att välja på skylten visar raden om var det finns, och inget pris.
    Fästenas kort står i tre kolumner, så att priset ryms på en rad.
  - Startrutan visar samma pris på "Egen form" som panelen. Materialen visar inget pris.
  - Priset som gäller för just den här ordern står kvar i specifikationen per skylt bredvid
    antal och pris (`order-section.tsx`): skylten (med startkostnaden i), fästet, loggan och
    egen form, som summerar till priset per skylt (`badgePriceParts` i motorn,
    `shopPriceParts` med butikens påslag, `withStartInSign`). Märkningsmetodens sammanfattning
    "Pristillägg per skylt" visar också orderns pris, "+X kr".
  - Regeln läser sista trappsteget, inte det lägsta talet: sätter ägaren ett högre pris på
    501 eller fler än på ett tidigare steg stämmer inte ordet "från".
- **Mängdrabatten står sist i specifikationen** (besked via ägaren 2026-11-16): från två skyltar
  visas raden "Mängdrabatt −N kr (X %)", med jämförelsen i klartext som verktygstips. Jämförelsen
  är vad samma skylt hade kostat ensam i ordern (`shopPriceParts(doc, 1, …)`), alltså både
  startkostnadens del och trappsteget, med butikens påslag. Raden är en jämförelse och ingen
  del av priset: delarna ovanför summerar fortfarande till priset per skylt.
- **Sammanfattningen vid priset hålls tät** (besked via ägaren 2026-11-16, som inte kom åt valen
  ovanför): den ligger fast över panelen, så varje rad där tar plats från skyltens inställningar.
  Mängdrabatten och prisnoten är en rad var, återförsäljarens ruta har en rad per värde, och
  återförsäljarens knappar har vanlig storlek. Lägg inte till rader där utan att ta bort andra.
- **Fästen och tillval har ett pris per trappsteg**, precis som skyltarna (`PriceOptions` är
  `Record<PriceOptionId, number[]>`; läs med `optionPriceSek` och `mountingPriceSek` och ange
  trappsteget). I kalkylen är priset samma på alla trappsteg.
- **Märkningsmetoden har fyra egna prisrader** (2026-11-16): `markingEngrave`, `markingPrint`,
  `markingEngraveNamePrintLogo` och `markingPrintNameEngraveLogo`, ett pris per trappsteg som
  övriga tillval (`MARKING_OPTION`, `markingPriceSek`). Alla står på 0 kr tills ägaren sätter
  priser i `/admin/prismodell`, kortet "Märkningsmetod" (beslut av ägaren). Med 0 kr visas metoden
  som "Ingår", annars "Pris från: X kr" vid valet och "+X kr" i sammanfattningen under valen.
  - **Loggan kostar inget eget** (besked via ägaren 2026-11-16, efter att en kollega valde Endast
    gravyr och ändå fick ett logotillägg): `extraEngraving` är 0 kr i kalkylen, och migrering 029
    nollade priset i den sparade modellen i `settings`. Med 0 kr har loggan ingen egen del och
    ingen rad i specifikationen. Raden "Logga på skylten" finns kvar i prismodellen, så priset
    går att sätta igen. Ordrar och offerter med sin egen sparade modell behåller sitt logopris.
  - Priset följer metoden som faktiskt gäller (`markingOf`): en skylt utan valt fält men med en
    logga i färg räknas som den kombinerade metoden. En kombinerad metod gäller bara en skylt med
    logga. Sparade ordrar och offerter har sin egen modell och ändras inte.
  - En modell sparad före 2026-11-16 saknar raderna och läses med 0 kr (`upgradeStoredModel`),
    utan migrering.
  - Delen heter `marking` i `PricePart` och finns bara när priset är över 0. Den följer samma
    kedja som övriga delar: marginal, butikens påslag och provision. `itemBreakdown` parar därför
    ihop återförsäljarens och slutkundens delar på namn, inte på plats.
  - Raden syns i skyltmotorns specifikation ("Märkning, …"), i kalkylen "Vid order", där metoden
    går att välja, och i `/admin/inkopspriser`. Fraktfrågan (`POST /api/shipping`) bär metoden,
    eftersom den ändrar varuvärdet.
  - Kända brister: butikernas prisinställning har ingen egen rad för märkning (butikens påslag
    gäller delen som övriga), och kalkylen slår på loggan när en kombinerad metod väljs.
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

- **Fel inloggning ger en begriplig sida, inte "404"** (2026-11-21). Pär öppnade länken i
  ett besked till admin, "…har lagt en order", på en telefon som var inloggad som
  återförsäljare, och fick webbramverkets engelska "404 This page could not be found".
  Ordern fanns och hörde till namnskylt.coms panel. Panelen har en inloggning i taget (kakan
  `ns_admin` bär antingen admin eller en återförsäljare), och ordersidan letar bara bland
  den inloggades ordrar. **Den runda symbolen i sidhuvudet visar vem som är inloggad: "A" för
  admin och "Å" för en återförsäljare.**
  - `src/app/admin/not-found.tsx` säger nu "Sidan finns inte i din panel", att man är
    inloggad som återförsäljare, och har knappen **Logga in som admin** (`SwitchToAdmin`),
    som loggar ut och laddar om samma adress. Där står då adminens inloggning, och efter
    lösenordet öppnas sidan man försökte nå. För admin säger sidan att ordern eller offerten
    inte finns längre.
  - Sidan säger aldrig om en order finns hos någon annan: svaret är detsamma för varje
    adress som inte hör till den inloggade.
  - **Adminens egna sidor** (Tillverkning, Återförsäljare, Butiker, Utskick, Prismodell,
    Provision, Drift) visade förut en tom sida för en inloggad återförsäljare. De ger nu
    samma "finns inte i din panel". Två av dem är mål för länkar i adminens besked.
  - **Sajten har en egen sida för adresser som inte finns** (`src/app/not-found.tsx`), på
    svenska, i stället för ramverkets.
  - Provat lokalt 2026-11-21 i Chrome på 390 px och dator (26 kontroller): fel inloggning,
    bytet till admin på samma adress, ordern efter inloggningen, och adminens egna sidor.
  - Kontrollerat i drift samma kväll efter pushen (`86c5dc3`), bara läsning (7 av 7): utan
    inloggning visar länken adminens inloggning på samma adress, som admin ger en order som
    inte finns panelens sida, adminens egna sidor öppnas som förut, och en adress som inte
    finns ger sajtens svenska sida. **Sidan för en inloggad återförsäljare är bara provad
    lokalt**: jag har inget återförsäljarkonto att logga in med i drift.

Slutkunden har sedan 2026-11-17 ett eget konto, se avsnittet Kundkonton. Det ger aldrig
tillträde till panelen.

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
    (`changePasswordAction`).
  - **Glömt lösenord** (2026-11-15): `/aterforsaljare/glomt` mejlar en länk som gäller i två
    timmar (`requestPasswordReset` i `src/lib/reseller-auth/forgot.ts`). Svaret är detsamma
    oavsett om adressen har ett konto, och formuläret har en gräns per klient och per adress.
    Mejlet är påslaget sedan 2026-11-21 (se Mejl från sajten). Med strömbrytaren av
    hänvisar sidan och inloggningen till namnskylt.com.
  - Lösenordets minsta längd ligger i `src/lib/reseller-auth/limits.ts`, en fil utan
    Node-moduler, eftersom formulären i webbläsaren läser den.
- Vägarna tar bara emot sina egna fält (`z.strictObject`), så det ena formuläret kan aldrig ge det
  andra inlogget. `authenticate` och `createAccount` vägrar ägarens id.
- En återförsäljare utan ordrar möts av "Gör din första offert" med knappar för ny offert, ny
  order och inställningarna; namnskylt.com ser demodatans välkomstyta. Översikten har knapparna
  Ny offert och Ny order.
- **Återförsäljaren har ingen översikt** (besked av ägaren 2026-11-19: "ta bort översikt på
  återförsäljarens dashboard, så man kommer rakt in på listan över offerter"). `/admin`
  skickar en återförsäljare till `/admin/offerter`, så inloggningen och alla länkar till
  panelens början hamnar där, och menyn börjar med Offerter (`adminNav` i `nav.ts`). Admin
  har kvar sin översikt.
  - Beskeden "Nytt sedan sist" står överst på offertlistan för återförsäljaren, och antalet
    olästa sitter på menyposten Offerter (`AdminNavItem.news`).
  - De första stegen som stod på översikten (lägg in loggan, fyll med demodata) står i
    offertlistans tomma läge.
  - Borta för återförsäljaren: översiktens nyckeltal, "Kräver åtgärd" och förslagen om att
    höra av sig till kunder. Ordrar som väntar syns som siffra på menyposten Ordrar.
- **Logga ut är en knapp längst ner i panelens meny** för admin (besked av ägaren 2026-11-18,
  som inte hittade den). För en återförsäljare står den sedan 2026-11-23 bredvid Ny offert
  överst i panelen, se Återförsäljarens panel med flikar. Förut var den en liten understruken
  textrad under menyn, som hamnade under fönstrets kant när menyn var högre än fönstret, och
  på en smal skärm var den dold. Menyn rullar nu för sig när fönstret är lågt (`.nav` i
  `admin.module.css`), så att knappen alltid syns, och på en smal skärm står den sist i
  menyraden.
- Formuläret är `LoginForm` (`kind: "admin" | "reseller"`) i `src/features/admin/login-form.tsx`.
  Sajtens meny visar "Admin" eller "Mina sidor" för den som är inloggad i panelen. "Logga in"
  går sedan 2026-11-17 till kundens inloggning, som länkar vidare till `/aterforsaljare`.
- **Bara admin** ser Tillverkning, Återförsäljare, Butiker, Utskick, Prismodell och Provision
  (sidor, actions och API-vägar kontrollerar `isOwner`). Varje adminsida kontrollerar inloggningen själv med `adminTenant()`.
- **Provision** (`/admin/provision`) är adminens samlade vy över ordrarna verkstaden fakturerar:
  vad som faktureras, provisionen och verkstadens del, per order och per säljare
  (rena regler i `src/lib/orders/provision.ts`, frågan i `provision-store.ts`). Sedan 2026-11-17
  är direktordrarna hos namnskylt.com med, under säljaren "namnskylt.com, direkt", med
  marginalen som plattformens del (se Ordern till verkstaden). Demoordrar, avbrutna ordrar och
  ordrar betalda med kort är inte med. Vyn filtreras per månad
  (`?period=2026-11`, månaden ordern lades i svensk tid) och laddas ner som CSV
  (`/api/admin/provision/export`, `provisionCsv`): varor, frakt, provision och verkstadens del
  per order. Det är underlaget för plattformens faktura till Skylt & Gravyrteknik. Vyn läser
  alla ordrar varje gång, vilket håller så länge de är få. Innan den första riktiga ordern
  finns visar sidan åtta påhittade ordrar (`exampleResellerOrders`, nummer `EX-…`, två av dem direktordrar), räknade med
  dagens prismodell, så att fördelningen går att kontrollera. Med riktiga ordrar nås de via
  "Visa exempel" (`?exempel=1`). De ligger inte i databasen och är aldrig med i underlaget. Under Ordrar ser admin fortfarande
  bara ordrar under hyresgästen `namnskylt`; alla återförsäljares ordrar syns under Tillverkning.
- `next dev` skickar med serverns mellanresultat som felsökningsdata i sidan (React), så där syns
  hela prismodellen i sidkällan. Kontrollera läckor mot `next build` + `next start`.

## Återförsäljarens väg, genomgången 2026-11-18

Hela återförsäljarflödet gicks igenom lokalt 2026-11-18 på ägarens begäran, som en riktig
användare och med sajtspärren på som i drift, utan att någon skrev sajtkoden: ansökan,
adminens godkännande, lösenord, panelen, skyltmotorn, offert från varukorgen, kundens ja från
mejlet, ordern till en låtsasverkstad, statusbytena tillbaka och panelens vyer, samt en andra
offert som kunden nekade. Allt gick igenom (39 kontroller). **Inte kört i drift**: där har
ingen riktig order lagts än.

- **Vägen:** `/aterforsaljare/ansok` → admin godkänner under Återförsäljare och skickar länken
  för hand → den sökande väljer lösenord och kommer rakt in i panelen → Ny offert (kundens
  uppgifter och projektnamn) eller rakt till `/skapa` → skyltar i varukorgen → "Skicka
  offert" mejlar kunden → kunden godkänner eller nekar via mejlets knappar → en godkänd
  offert blir en order som går till verkstaden av sig själv, med återförsäljaren som
  beställare till inköpspris.
- **Det enda manuella steget** är adminens godkännande och att länken skickas för hand,
  eftersom sajten inte mejlar ansökningar (se Inlogg).
- **En återförsäljares inloggning öppnar också sajtspärren** (`sign-in.ts` sätter spärrens
  kaka), så skyltmotorn och API:erna fungerar utan sajtkoden. Kunden behöver aldrig koden:
  offerten, ordersidan och mejlets bilder är öppna för den som har länken.
- **Den låsta startsidan har en väg in för återförsäljare** (`SiteGate`): "Återförsäljare?
  Logga in eller skapa konto." Förut fanns ingen länk dit från rutan. Länkarna är vanliga
  `<a>`, inte `Link`: spärren sitter i rotlayouten, som inte ritas om vid en navigering i
  webbläsaren, och rutan skulle annars ligga kvar över inloggningen.
- **Översikten säger inte längre att en order "väntar på dig" när den redan är hos
  verkstaden** (`src/app/admin/page.tsx`). En ny order går dit av sig själv, så raden säger
  "1 ny order är mottagen hos tillverkningen. Du behöver inte göra något." Under "Kräver
  åtgärd" står bara en riktig order som inte har gått till verkstaden ("Har inte gått till
  tillverkningen än"), och ordersidan säger då varför under Tidslinje (`dispatchStatus`,
  till exempel att leveransadress eller organisationsnummer saknas). Demoordrar visas som
  förut, som "Ny order".
- **Marginalen räknas på varorna, utan frakt, både i skyltmotorn och i panelen**
  (`PricingEditor`). Förut räknade panelen procenten på summan med frakt, så samma offert
  visade 35 % i skyltmotorn och 30 % i panelen. Beloppet i kronor var redan detsamma.
- **Antal böjs rätt** (`plural` i `src/lib/format/`): "1 skylt", "1 order", "1 kund" i
  översikten, på order- och offertsidan, under Kunder och i statistiken.
- **Kundens organisationsnummer sparas som `556123-4567`** också när det skrivs utan
  bindestreck under Ny offert och Ny order (`formattedOrgNumber`). En text som inte är ett
  nummer sparas som den skrevs, eftersom fältet är fritt hos en återförsäljare.
- Panelens texter säger "verkstaden", inte "tryckeriet", och välkomsttexten och Ny offert
  säger att offerten mejlas från varukorgen till listpris och att priset kan ändras efteråt.
- Efter godkännandet får kunden tacket i kortet direkt ("Tack! Offerten är godkänd"), medan
  sidans rubrik byts till "Tack för ordern!" först när sidan laddas om.
- Kända brister: på inloggningen och ansökan visar sidhuvudet länkar till sidor som är
  låsta för den som saknar sajtkoden, och ansökans länk "designa och beställ direkt" leder
  också till spärren.

## Genomgången inför start, 2026-11-19

Hela flödet gicks igenom lokalt på ägarens begäran ("gå igenom hela flödet igen så att du ser
att allting funkar"), mot produktionsbygget med **sajten öppen som vid start, utan sajtspärr**,
en låtsasverkstad och en låtsasmottagare för mejl. **Inte kört i drift**: där har fortfarande
ingen riktig order lagts.

- **Kundens väg, 51 kontroller, i Chrome och i Safaris motor (WebKit):** startsidan och de
  publika sidorna, `robots.txt` och sitemapen, skyltmotorn från startsidans ruta, en
  metallskylt som printas med färg på trycket, färg per rad, logga i färg och magnet (10 st),
  en plastskylt som graveras med ram och klämma i tre namn, varukorgen med två designer,
  kassan med konto, ordern hos verkstaden med hela underlaget, statusbytena tillbaka, kundens
  ordersida, Mitt konto och Kopiera order.
  - Verkstaden fick kunden som beställare till kundens pris, 4 rader, paket för 159 kr, och
    per skylt rätt material, trycklagret i kundens färger, loggan som bild i tryckläge,
    ämnets benämning och fästet i klartext. Provision visade ordern som direktorder med 40 %.
- **Återförsäljarens väg, 39 kontroller**, samma som 2026-11-18 men från den öppna startsidan:
  Logga in → Logga in som återförsäljare → ansökan.
- **Varukorgen och kassan på 390 och 320 px**, i båda motorerna.
- **Safaris motor kräver https lokalt.** Över `http://localhost` sparar WebKit inte kakor som
  är märkta säkra, så inloggade sidor visar inloggningen igen. Det är provmiljön, inte ett fel
  i sajten: med en https-port framför servern gick allt igenom.
- **Rättat efter genomgången:**
  - Adminens och återförsäljarens ordersida beskrev bara orderns första design under
    Detaljer. En order med flera designer visar nu en rad per design, "Design 2, 3 st" med
    material, form, fäste och tryckfärg (`orderDesigns` i `src/engine/batch.ts`).
  - Tidslinjens not för verkstadens statusbyten sa "Från tryckeriet". Den säger "Från
    verkstaden". Noter som redan är sparade ändras inte.
  - Tryckfärgen följde med en skylt där bara en logga i färg printas (se Märkningsmetod).
  - På namnskylt.coms egna ordrar säger ordersidan nu att priset är kundens, som Skylt &
    Gravyrteknik fakturerar, och hänvisar till dem om adressen ska ändras. Förut stod
    texterna som är skrivna för en återförsäljare.
- **Sett men inte ändrat:**
  - Den öppna startsidan har ingen länk för den som vill bli återförsäljare. Vägen går via
    Logga in och "Logga in som återförsäljare".
  - På en direktorder visar adminens ordersida "Marginal 824,06 kr · 40 %", räknat ur
    inköpslistan, medan Provision visar 821,20 kr, alltså 40 % av varuvärdet. Provision är
    regeln; skillnaden är avrundning per del.
  - En skylt kostar 463 kr och tio kostar 173 kr styck (metall med nål respektive magnet),
    eftersom startkostnaden fördelas på orderns skyltar. Det är prismodellen, inget fel.
  - "Beställ fler med samma design" på kundens ordersida utgår från orderns första design.
  - Efter att en offert har godkänts står tacket i kortet, men sidans rubrik byts först
    när sidan laddas om.

## Ordern till verkstaden — läge 2026-11-14

Återförsäljaren är ett säljverktyg ovanpå verkstaden: den designar åt sina kunder, skickar offert
med eget namn och egen logga, och ordern går till Skylt & Gravyrteknik, som tillverkar, skickar
och **fakturerar återförsäljaren** (beslut av ägaren 2026-11-14). Plattformen fakturerar
verkstaden sin provision per period.

**namnskylt.com är bara provisionssäljare** (beslut av ägaren 2026-11-17). Vem verkstaden
fakturerar avgörs per order (`partyFor`, `DispatchParty` i `src/lib/supplier/dispatch.ts`):

- **En återförsäljares order faktureras alltid återförsäljaren**, till inköpspris, som förut.
  Plattformens del är trappstegens provision på det beloppet.
- **En direktorder sköter Skylt & Gravyrteknik helt mot kunden.** Direktorder är varje order
  under hyresgästen `namnskylt` som inte är betald med kort (`isDirectOrder` i
  `src/lib/orders/model.ts`, den enda platsen för regeln): en kund som
  beställer själv på namnskylt.com, en order eller godkänd offert som admin lägger åt en kund,
  och en order i en butik som ingen återförsäljare har tagit över. En sådan butik säger samma
  sak som namnskylt.com i kassan, på kvittot och i sina villkor (`ShopContext.direct`,
  `TermsPage` med `direct`).
  - Kunden är beställaren hos verkstaden (`customerBuyer` i `request.ts`): företaget, dess
    organisationsnummer och e-post, med kundens adress eller leveransadressen som fakturaadress.
    Raderna bär **kundens pris** (`DirectSale`, `priceWithPricing`), inte inköpspriset. Frakten
    är densamma som i övriga led.
  - Verkstadens system bekräftar ordern, mejlar, aviserar och fakturerar kunden. namnskylt.com
    fakturerar aldrig någon och skickar inga egna mejl.
  - **Plattformens del är prismodellens marginal på det verkstaden fakturerar kunden** (40 % i
    kalkylen, fältet Marginal i `/admin/prismodell`), i stället för trappstegens provision
    (`directOrderShare` i `src/lib/orders/provision.ts`). Ägarens ord: "istället ska vår
    provision vara 40 % och inte 15 %". Att procenten är just modellens marginal är min
    tolkning: det är påslaget en återförsäljare annars behåller, så verkstaden får listprisets
    inköpsvärde. Ändras marginalen ändras både kundens pris och plattformens del.
  - En direktorder stoppas ("Saknar uppgifter") när kunden saknar organisationsnummer eller
    e-post, när kunden är borttagen, eller när ordern har **rabatt i procent eller extrarader**
    (anropet har bara rader med à-pris, `isLineInvoiceable` i `pricing.ts`).
  - **Priset på en direktorder:** panelens prisredigerare sparar redan en rabatt som à-pris per
    skylt, så det som nekas i praktiken är extrarader (`DIRECT_PRICING_ERROR` i
    `updateOrderPricingAction` och `updateQuotePricingAction`). När ordern har gått till
    verkstaden, eller är på väg dit, går priset inte att ändra alls
    (`DIRECT_PRICE_LOCKED_ERROR`): verkstaden fakturerar det pris ordern skickades med.
    Båda kontrollerna görs i `updateOrderPricing` med raden låst. Demoordrar och demoofferter
    är undantagna, och en återförsäljares priser mot sin kund är orörda.
  - **En order betald med kort** är ingen direktorder: kunden har redan betalat namnskylt.com,
    så verkstaden fakturerar namnskylt.com till inköpspris, som före direktordrarna. Kunden
    aviseras ändå direkt av transportören: aviseringen följer säljaren, inte fakturan.
    Kortbetalningen är avstängd och går inte ihop med att verkstaden sköter allt mot kunden.
  - Provat lokalt mot skyltmotorn 2026-11-17: ordern blir en fakturaorder på kundens företag,
    till kundens pris, med bekräftelsen till kundens adress. Inte provat i drift.
  - Kända följder: verkstaden räknar momsen med ören, så fakturan kan skilja upp till 50 öre
    från summan kunden såg (633 kr mot 632,50). En offert som admin gör åt en direktkund bär
    sedan 2026-11-18 Skylt & Gravyrtekniks uppgifter (se avsnittet namnskylt.com är Skylt &
    Gravyrtekniks sajt), men villkoren i sidfoten är fortfarande adminens egen text ur panelen.
    Fakturaunderlaget i panelen behövs inte längre för direktordrar. Kundens telefon följer bara med på leveransadressen, inte på kundkortet.
  - Känd brist: beställaren läses ur kundens rad när ordern skickas, inte ur en kopia på
    ordern. Om ett utskick misslyckas och samma e-postadress hinner beställa åt ett annat
    företag innan omförsöket, skickas den första ordern med det nya företagets namn och
    organisationsnummer. En kopia av beställaren på ordern (ny migrering) löser det.

- **Kunden ser Skylt & Gravyrtekniks ordernummer på en direktorder** (beslut av ägaren
  2026-11-19: ordrarna "måste ju följa deras orderflöde, så att ordernumret följer deras
  ordernummerserie", och på frågan valdes deras nummer framför båda eller ingen ändring).
  Regeln ligger på ett ställe, `customerOrderNumber` i `src/lib/orders/model.ts`.
  - Verkstaden ger ordern ett nummer ur sin egen serie när den tas emot. Det är det numret
    som står i deras orderbekräftelse och på fakturan, och nu också hos oss: på kvittot i
    varukorgen ("Order 48213 mottagen. … Referens NS-1200."), på kundens ordersida, i Mitt
    konto, i rubriken när ordern kopieras och i tacket när kunden godkänner en offert från
    namnskylt.com. Vårt eget nummer, NS-…, står kvar som referens. Det är IO-numret hos dem.
  - Innan verkstaden har tagit emot ordern finns deras nummer inte, och då visas vårt.
    Sidorna byter nummer av sig själva när ordern har gått iväg.
  - **En återförsäljares kund ser alltid vårt nummer**, också i en återförsäljares butik:
    kunden ska inte möta verkstaden. `POST /api/orders` lämnar därför bara ut verkstadens
    nummer där verkstaden själv säljer. En demoorder och en order betald med kort visar
    också vårt.
  - **Panelen har kvar NS-numret som ordernummer**, i listor, adresser och besked, och
    visar verkstadens under Tidslinje och Detaljer ("Tillverkarens nr"). Ordern sparas och
    numreras hos oss innan den skickas, så vårt nummer behövs som referens och i
    `Idempotency-Key`.
  - Provat lokalt 2026-11-19 mot en låtsasverkstad, i hela kundflödet: numret på kvittot är
    det verkstaden svarade med. Inte provat i drift, där ingen riktig order har lagts.
  - Inte ändrat: sajtens egna mejl, som är avstängda, säger fortfarande NS-numret.
- **Kopplingen är påslagen i Namnskylts drift sedan 2026-11-17** (ägaren satte variablerna på
  Railway). Strömbrytaren är `SUPPLIER_API_URL` och `SUPPLIER_API_KEY`
  (`supplierApiConfigured`). Utan dem sparas ordrar och väntar. Värdena stämmer med
  hemligheterna i verkstadens AWS (jämfört 2026-11-17 utan att visas).
  - Verkstadens mottagare i skyltmotor-projektet är **öppen sedan 2026-11-17 16:35** (deploy
    efter ägarens ja): utan eller med fel nyckel svarar den 401, med rätt nyckel svarar den.
    Varje ny order blir alltså en riktig fakturaorder i verkstadens Mottagen, och verkstadens
    system mejlar orderbekräftelsen till beställarens adress och en notis till deras ordermejl.
  - **Ingen riktig order har gått genom kopplingen i drift än.** Kedjan är bara provad lokalt.
  - Basadressen får ha en egen sökväg (`supplierUrl` i `client.ts`): i drift är den
    `https://www.skyltochgravyr.com/api/partner`.
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
  organisationsnummer eller e-post saknas, organisationsnumret går inte att läsa som tio
  siffror (`orgNumberDigits` i `src/lib/company/org-number.ts`, verkstadens egen regel: även
  momsnummer och nummer med sekel går), eller ordern har inga skyltar som verkstaden gör.
  Beställaren (`SupplierBuyer`) är återförsäljaren ordern tillhör, läst ur dess
  företagsuppgifter. På en direktorder är beställaren kunden, och felen pekar då på kunden
  ("Kundens organisationsnummer saknas"). namnskylt.coms egna företagsuppgifter används där
  bara för aviseringen när skyltarna skickas till oss själva.
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
  - **Telefon krävs när skyltarna fraktas** (beslut av ägaren 2026-11-17: "Kräv telefon i
    formuläret"). Verkstadens fraktbokning behöver mottagarens nummer, och transportören
    aviserar på det. Regeln är `needsPhone` och `deliveryPhoneIssue` i `delivery.ts`: standard
    och express kräver ett nummer med minst sju siffror, upphämtning inget.
    - Formulären läser adressen med `shippingAddressFromDraft` och märker fältet
      (`DeliveryFields.phoneRequired`): kassan, återförsäljarens leveranssteg, kundens
      godkännande av en offert och `DeliveryPanel`. `addressFromDraft` prövar aldrig telefonen
      och är till för adresser som bara fylls i i förväg.
    - Servern prövar samma regel i `POST /api/orders`, `POST /api/admin/orders`,
      `decideQuoteAction`, `updateOrderDeliveryAction` och `updateQuoteDeliveryAction`.
    - På en offert till kunden får telefonen vänta: kunden ser adressen och fyller i numret när
      offerten godkänns. Godkänner återförsäljaren åt kunden frågas ingen, så då ska numret stå
      på offerten (`acceptanceIssue`, `MISSING_PHONE_ERROR` i `src/lib/quotes/accept.ts`). På en
      offert till återförsäljaren krävs numret i panelen.
    - Regeln gäller det som fylls i nu. "Beställ igen", "Ny personal" och en order från en mall
      ärver leveransen som den är. En äldre leverans utan telefon skickas ändå till verkstaden,
      som då bokar frakten för hand (ägarens besked). Ingen reserv till beställarens nummer.
- **Statusen tillbaka** går som förut via `/api/supplier/webhook` (signerad) och hämtas vid
  behov med `GET /orders/<nr>`.
- **Varukorgen ligger bakom symbolen längst upp till höger, för alla** (besked av ägaren
  2026-11-17: "en kundkorgssymbol längst upp till höger ... och därifrån skickas en offert
  istället för att man gör det direkt från motorn"). Det gäller kunder som beställer själva,
  butikerna och återförsäljarna.
  - **I skyltmotorn läggs skylten i varukorgen**, med knappen "Lägg i varukorgen" vid priset
    (`OrderSection` med `mode="price"`). Där finns ingen knapp "Beställ" längre, och panelen
    har ingen egen sektion för varukorgen. Skylten i editorn läggs undan och nästa börjar
    med samma design utan text (`addDesign`, `pending`).
  - **Symbolen** (`CartButton` i `src/features/designer/cart-button.tsx`) visar antalet
    skyltar. Skyltmotorn sätter den i sidhuvudets plats `[data-cart-slot]`, som finns i
    `SiteHeader` och i butikens `ShopFrame`. Utan en sådan plats ligger den fast längst upp
    till höger över sidan. På andra sidor än skyltmotorn finns ingen symbol.
  - **Varukorgen** (`CartDrawer`, en modal `dialog` från höger) öppnas av symbolen, och av
    sig själv när en skylt läggs dit. Den visar designerna (`CartList`: Ändra, Ta bort) och
    kassan (`OrderSection` med `mode="checkout"`, på varukorgens skyltar): kundens formulär
    och "Skicka order", eller återförsäljarens "Skapa offert" och "Lägg order".
  - Panelen finns kvar i sidan när den är stängd, så att det som är ifyllt i kassan står
    kvar. Efter kundens order töms varukorgen och kvittot står kvar där; nästa skylt som
    läggs dit ger en ny kassa (`checkoutRound`), och arbetet sparas igen (`saved.restart`).
  - Det som ligger i varukorgen är det som beställs. En ändrad skylt i editorn som inte är
    lagd dit följer inte med, och varukorgen säger det.
  - Kassan räknas som öppnad i statistiken när kunden börjar fylla i formuläret. Varukorgen
    öppnas av sig själv när en skylt läggs dit, så att bara se den är inget steg. Siffrorna
    för "kassan öppnad" före 2026-11-17 gällde ett klick på "Beställ" och går inte att jämföra.
  - Kundens uppgifter i kassan (företag, organisationsnummer, namn, e-post, kryss för
    villkoren) ligger i komponentens tillstånd, så att de står kvar när varukorgens enda
    skylt öppnas för ändring och formuläret försvinner en stund.
  - "Ändra" på en design lägger skylten i editorn på dess plats bara när den har ett namn.
    En tom skylt i editorn kastas, så att den inte hamnar i ordern av sig själv.
  - Kvittot säger att bekräftelsen kommer från Skylt & Gravyrteknik bara när verkstaden har
    tagit emot ordern (`status: "received"`).
  - Provat lokalt i webbläsaren 2026-11-17 på dator och mobil (390 och 320 px): kundens
    flöde, panelens offert och order, en order öppnad för ändring och en butik. Inte provat
    i drift.
- **Namnlistan under "Fler namn" läses ur Excel eller CSV i webbläsaren** (`readTable` i
  `src/lib/spreadsheet/read-table.ts`, `rosterFromTable` i `src/engine/roster.ts`). Rättat
  2026-11-17 efter att ägaren fick "Hittade inga namn" på en fil med 54 namn:
  - Ur en .xlsx läses första bladet som har något i sig. En fil gjord av ett skript har ofta
    ett tomt förvalt blad först och namnen på nästa, och gav då noll rader.
  - Rubrikraden är raden med flest rubriker vi känner igen. En överskrift ovanför tabellen,
    som "54 namn och titlar", togs förut för rubrikraden.
  - En kolumn med rubriken "Namn och titel" delas vid kommatecknet.
  - Felet försvinner när namnen skrivs eller klistras in för hand, och det säger att man
    kan klistra in.
  - Ägarens egen fil fanns inte på datorn. Felet är återskapat med egna filer från
    LibreOffice, openpyxl och xlsxwriter, där filen med tomt första blad gav just det
    meddelandet. Att det var orsaken i ägarens fil är alltså inte bekräftat.
  - **Samma fil gav samma fel igen 2026-11-18.** Orsaken som då hittades: filverktyg byggda
    på Open XML SDK, som AI-tjänsternas, skriver prefix på varje element (`<x:row>`,
    `<x:c>`, `<x:v>`), texten direkt i cellen (`t="str"`) och en tom tabell för delade
    strängar. Läsaren letade efter `<row>` och fick ett helt tomt blad. Den läser nu
    taggarna med en egen genomgång (`xmlTags`), som bortser från prefix och klarar tomma
    taggar (`<si/>`, `<row/>`), apostrofer kring attribut och bakstreck i zip-filens sökvägar.
    Bara `<sheetData>` läses, eftersom ett blad med ett inbäddat objekt har andra element som
    heter `row`.
    - Hittat genom att jämföra läsaren med en referensläsare på de 541 .xlsx-filer som låg
      på datorn (Excel för Mac och Windows, openpyxl, SheetJS): 537 lästes lika, och de
      fyra som blev tomma var alla av den sorten. Efter rättningen läses alla 541 lika.
    - **Bekräftat med ägarens egen fil 2026-11-18** (`54_namn_och_titlar.xlsx`, som ägaren
      lade på skrivbordet): den är av just den sorten. Läsaren före rättningen ger 0 rader,
      läsaren efter ger 54 namn med titel, och i drift läses den som "54 namn × 1 = 54 st".
    - En .xlsx som inte är en zip-fil (lösenordsskyddad) och en tom fil säger nu vad som är
      fel, och felet skiljer "ingen text" från "inga namn".
- **Antalet blir 1 när namnlistan får sina första namn** (besked via ägaren 2026-11-18, som
  valde 10 skyltar, laddade upp 10 namn och fick 100): `quantityForNames` i
  `src/engine/batch.ts`, anropad i `changeNames` i `designer.tsx`. Det gäller en fil, namn
  som klistras in och namn som skrivs för hand. Därefter är antalet kundens eget val per
  namn (3 ger 3 × antalet namn) och ändras inte av fler namn, inte heller av att hela listan
  byts. En varukorg som läses tillbaka, "Ändra" och "Beställ igen" rör inte antalet.
  - Under listan står "En skylt per namn. Antalet per namn ändrar du vid priset."
  - **En uppladdad fil fyller en tom skylt i editorn** (`importNames`): filens första namn
    tar dess plats, så att tio namn blir tio skyltar. Förut låg en skylt utan text först i
    listan, och då gick inget att lägga i varukorgen. Namn som skrivs eller klistras in
    flyttas upp först när kunden lämnar rutan, eftersom första tecknet annars skulle hoppa
    upp i editorn (se En skylt med bara logga).
- **Skylten syns kvar i 3D när den har lagts i varukorgen** (besked av ägaren 2026-11-20: "när
  jag klickar på varukorg så blir skylten tom, namnet försvinner"). Skylten i editorn läggs
  undan och nästa börjar utan text, så förut syntes en tom skylt bakom varukorgen. Nu visar
  3D-vyn den senast tillagda skylten så länge skylten i editorn är ny och orörd
  (`shownFromCart`, `stageDoc` i `designer.tsx`), med raden "Skylten ligger i varukorgen.
  Skriv ett namn för att börja på nästa." Så fort nästa skylt påbörjas visas den. Ritningen
  och På person visar fortfarande skylten i editorn, eftersom det är den som ändras där.
- **Listan under "Fler namn" står kvar när bara en skylt är kvar** (besked av ägaren
  2026-11-18: "tar jag bort 3 av 4 så försvinner även den 4e"). Listan visades bara med flera
  skyltar, så när den näst sista togs bort försvann hela listan, fast skylten i editorn fanns
  kvar. Den står nu kvar med den sista skylten, som inte har någon knapp för att tas bort.
  En skylt som aldrig har haft fler namn visar ingen lista, som förut, och inte heller en
  ensam skylt efter en omladdning (`listed` i `BatchSection`).
- **Platshållaren "Ditt namn" ritas bara på en helt tom skylt som håller på att skapas**
  (besked via ägaren 2026-11-18, som såg texten stå kvar på en skylt utan namn):
  `isBlankBadge` i motorn, `withPlaceholders` och `BadgePreview` med `placeholders`.
  - I skyltmotorns ritning visas den bara när skylten varken har text eller logga. Med en
    logga, eller text på en annan rad, ritas en tom rad inte alls.
  - En sparad skylt ritas alltid som den är: korrektur, offert, order, varukorg och panelens
    listor ritar aldrig platshållare. `placeholders` sätts bara på startsidans och
    startrutans reservbild, på skylten i editorn överst i namnlistan och i "Ny personal".
- **En skylt med bara logga går att beställa** (beslut av ägaren 2026-11-18, på frågan om en
  skylt helt utan text ska gå att beställa: "Ja, bara logga ska gå"). En skylt ska ha text
  eller logga (`badgeDocumentSchema`, `isBlankBadge`). En helt tom skylt går inte att lägga i
  varukorgen, och skälet står under knappen.
  - **Loggan står då mitt på skylten** och får ta hela ytan (`planLogo` i `layout.ts`), i
    stället för vid sidan av en text som inte finns. Skrivs ett namn flyttar den till sin
    plats bredvid texten. Loggans storlek och "Flytta text och logga" gäller som vanligt.
  - Skylten heter "Utan text" i varukorgen, på ordersidor och offerter och "Utan namn" i
    panelen. Priset är detsamma som för en skylt med text.
  - Verkstaden får ett dokument med loggans bildlager och inget textlager. Raden har vårt
    ordernummer som referens, så ingen text behövs där. Prövat 2026-11-18 mot verkstadens
    egna regler genom att läsa deras kod (`partnerDocument`, `partnerRulesDocument` och
    märkskyltens `validate`), utan att starta eller ändra något hos dem: metall och plast,
    graverad logga, logga i färg och svartvit logga som printas godkänns alla. **Ingen
    sådan order har gått till verkstaden på riktigt.**
  - **Namn i listan under en skylt utan text:** när kunden lämnar textrutan tar listans
    första namn skyltens plats i editorn (`withLeadName` i motorn, `settleNames`), och
    samma sak görs när skylten läggs i varukorgen. Annars följde en skylt utan text med
    namnen. Det görs inte medan kunden skriver. Följden är att en skylt utan namn och en
    lista med namn inte ryms i samma design: skylten utan namn läggs i varukorgen för sig.
  - "Ändra" på en design i varukorgen kastar fortfarande en skylt i editorn som saknar namn
    (`editDesign`), också en med logga: en skylt med bara logga hamnar i ordern först när
    kunden själv lägger den i varukorgen.
  - Kända brister: märkningsmetoden kan heta "Namn graveras · logotyp printas" på en skylt
    utan namn, och den prissätts då som den kombinerade metoden (alla metoder kostar 0 kr i
    dag). Skrivs ett enda namn i listan under en tom skylt blir antalet 1, fast kunden kan
    ha valt fler av den enda skylten.
- **Flera designer i samma order**: varje design är en rad i varukorgen (`BadgeGroup` i
  motorn). Priset räknas på hela ordern, så trappsteg,
  startkostnad och frakt delas. En order med flera designer sparas utan 3D-stillbild, eftersom
  bilden bara visar en av dem, och panelen fyller inte heller i en bild i efterhand
  (`sameDesign` i motorn, `missingBadgeShots`).
  - **Varje design visas som sin egen rad, med sitt antal och sin summa** (beslut av ägaren
    2026-11-18: "varje skylt måste vara en egen order i ordern", och på frågan valdes "Visa
    bara skylten jag gör"). Ägaren hade 107 skyltar i varukorgen, valde 10 på en ny skylt och
    såg "2 designer · 117 st · 15 261 kr" vid priset.
    - Vid priset i skyltmotorn står bara skylten i editorn när andra designer ligger i
      varukorgen: "10 st · 124 kr / st" och summan för just den (`alone` i `OrderSection`,
      `own` är antalet skyltar som hör till editorn). Raden under knappen säger hur många
      som redan ligger i varukorgen och att de räknas med i mängdrabatten.
    - I varukorgen har varje design antal och summa (`CartList` med `sums`).
    - **Prisregeln är oförändrad:** priset per skylt är orderns, så trappsteget och
      startkostnaden räknas på alla designer tillsammans (`designSums` i
      `src/lib/shops/price-list.ts`). Summorna per design blir orderns varuvärde. Att
      prissätta varje design helt för sig valde ägaren bort.
    - En inloggad återförsäljares ruta visar då "Ditt inköp, hela ordern" och "Kundpris, hela
      ordern", eftersom inköpet inte går att dela per design på samma sätt.
- **Den som är inloggad i panelen kan gå rakt till skyltmotorn** (besked av ägaren
  2026-11-17): `/skapa` öppnas då i säljarläge, också utan `?kund=`, och kunden väljs i
  varukorgen. Där finns "Befintlig kund", med säljarens kunder i en sökbar lista, och "Ny
  kund", med företag, organisationsnummer, kontaktperson, e-post och telefon
  (`ResellerCustomer` i `sections/reseller-customer.tsx`, `resolveOrderCustomer` i
  `src/lib/orders/order-customer.ts`). Sedan "Skicka offert" eller "Lägg order", som förut.
  - En vald kund får adressen från sin senaste order ifylld
    (`GET /api/admin/customers/<id>/delivery`). En ny kund med en e-post som redan finns hos
    säljaren är samma kund.
  - Hos namnskylt.com krävs företag och organisationsnummer, eftersom verkstaden fakturerar
    kunden: för en ny kund, och för en kund ur listan som saknar dem (annars mejlades en offert
    som inte går att göra till en order). Hos en återförsäljare får de saknas.
  - Vid knapparna står alltid vem ordern eller offerten går till, med e-postadressen, och den
    valda kunden står kvar överst i listan också när sökningen inte träffar den. En offert får
    aldrig mejlas till en kund som säljaren inte ser.
  - Följden är att en inloggad admin eller återförsäljare aldrig ser kundens egen kassa på
    `/skapa`. Den som vill se den använder ett privat fönster. Butikernas skyltmotor är orörd.
  - **Återförsäljarens priser visas bara för en inloggad återförsäljare** (besked av ägaren
    2026-11-18: "enbart slutkundspriset ska visas om man inte är inloggad som återförsäljare").
    Raderna Ditt inköp, Kundpris och Marginal (`PurchaseSummary`) och inköpslistan
    (`ResellerOrderContext.purchaseList`) går därför inte till admin: `/skapa` skickar listan
    bara när den inloggade inte är ägaren. Admin ser slutkundens pris som alla andra, och frågar
    servern om frakten som en kund. Hos namnskylt.com fakturerar verkstaden ändå kunden
    slutkundens pris, så återförsäljarens inköp gäller inte där.
    - I panelen står inköpspriserna kvar för admin (prisredigeraren på order och offert,
      `/admin/inkopspriser`, Prismodell och Provision). Det är adminens egna sidor.
  - Från panelen (`?kund=<id>`) är kunden vald i förväg, som förut, och valet visas inte.
  - **En demokund är märkt, och varukorgen varnar** (2026-11-19). En kollega till ägaren
    gjorde en offert till Demokund AB i drift, godkände den och väntade på ordern hos
    verkstaden: allt som görs till en demokund blir demo (`demo: customer.demo` i
    `POST /api/admin/quotes` och `/api/admin/orders`), så offerten mejlades inte och ordern
    NS-1111 skickades aldrig. Kundlistan visar nu "Demo" på demokunder (`CustomerChoice.demo`),
    och vid knapparna står att offerten inte mejlas och att ordern inte skickas till
    tillverkningen, också när kunden är vald i förväg från panelen (`customerDemo`).
    Ordersidan och offertsidan i panelen hade redan märket Demo.
- **Återförsäljaren utgår från varukorgen** (besked av ägaren 2026-11-16). Från panelen
  (`/admin/ny-order`, `/admin/ny-offert`) öppnas skyltmotorn rakt i editorn, utan startsida
  och startruta, med markören i skyltens första rad.
  - Knappen vid priset heter **"Lägg i varukorgen"** så länge skylten i editorn inte ligger
    där, och "Öppna varukorgen" när allt som är designat ligger där (`pending`).
    **"Skapa offert"** och **"Lägg order"** finns i varukorgen, båda två. Så ryms flera
    olika designer i samma offert eller order (`DesignerCart` i `order-section.tsx`).
  - Sättet återförsäljaren kom in på avgör bara vilken av knapparna som är framhävd
    (`reseller.mode`). "Lägg order" öppnar leveransen först, som förut.
  - En halvfärdig skylt i editorn kastas med "Fortsätt utan den här skylten"
    (`discardDesign`), och en design i varukorgen öppnas med "Ändra".
  - Varukorgen sparas per kund, inte per läge (`savedWorkKey`), så den är samma oavsett om
    den slutar som order eller offert.
  - Stillbilden till en order med en enda design tas när skylten läggs i varukorgen
    (`cartShot`), eftersom editorn är tom när ordern läggs. Efter en omladdning finns ingen
    bild, och panelen ritar den i efterhand.
  - När allt ligger i varukorgen visas bara dess summa vid priset. Antalsväljaren och
    specifikationen per skylt gäller skylten i editorn och visas medan man designar.
  - En kund som beställer själv gör sedan 2026-11-17 likadant: lägger i varukorgen och
    beställer därifrån.
- **Beställ igen med ändringar** (besked av ägaren 2026-11-16): dialogen "Beställ igen" har
  kvar samma order med ett klick, och dessutom "Ändra först", som öppnar
  `/skapa?kund=<id>&kopia=<ordernummer>`. Den gamla orderns skyltar ligger då i varukorgen
  som designer med sina namn (`badgeGroups` i motorn, inversen av `groupBadges`), och namn,
  antal och allt annat ändras med "Ändra" innan man lägger order eller skapar offert.
  - Sidan öppnar bara återförsäljarens egen order till just den kunden, och äldre skyltar
    flyttas till dagens sortiment (`toOfferedDocument`).
  - Den nya ordern får dagens listpris och pekar tillbaka på den gamla (`copyOf` i
    `POST /api/admin/orders`, källan `repeat`, noten "Beställd igen från NS-…, med ändringar").
    Den gamla orderns egna priser och rabatt följer inte med, och inte heller dess fraktsätt.
  - Den öppnade ordern ersätter det som låg sparat i webbläsaren för kunden, men ändringarna
    överlever en omladdning (`replaces` i `useSavedWork`, öppningen `kopia:<ordernummer>`).
  - Rutan "Skriv namnet. Vi gör resten." i skyltmotorn finns inte längre (`SmartInput` är
    borttagen); `smart-input.tsx` har bara kvar exemplen och skrivmaskinen till startsidan.
- **Startsidan fungerar utan namn** (besked av ägaren 2026-11-16): "Skapa skylt" öppnar
  skyltmotorn även när rutan är tom. Startsidans ruta skickar alltid med `t`, även tomt, och
  sidan ger då `fromStart` till `Designer`, som visar startrutan för material och form utan
  text och sedan ställer markören i skyltens första rad. En direkt länk till `/skapa` utan `t`
  visar ingen startruta, som förut. Samma sak gäller butikernas startsida.
- **3D-skylten var svart på äldre Apple-enheter** (ägarens kollega 2026-11-19, på telefon:
  mässingsskylten på startsidan nästan svart, med svart text). Ljusmiljön lästes som hela
  flyttal, som äldre Apple-kretsar inte kan läsa av mjukt (`OES_texture_float_linear` saknas).
  Bilden blev då svart, och metall, som bara speglar sin omgivning, ritades svart. three.js
  varnar för det i konsolen. Ljusmiljön läses nu som halva flyttal (`configure` och
  `desaturate` i `three/studio-environment.tsx`), som alla enheter klarar.
  - Återskapat lokalt genom att stänga av funktionen i Chrome: skyltens yta #120D00 före,
    #8E7C52 efter, samma som på en vanlig enhet. **Inte bekräftat på kollegans enheter.**
    Ägarens egna Mac och iPhone hade aldrig felet.
  - Sätt aldrig tillbaka `FloatType` på ljusmiljön, och lägg inte in andra bilder i hela
    flyttal som ska läsas av mjukt.
  - Kollegan såg också felet på sin dator. Vad som syntes där vet jag inte: en Mac klarar
    hela flyttal. Kvarstår det behövs en skärmbild därifrån.
- **Plastens färger i 3D är katalogens** (besked av ägaren 2026-11-19, som såg en orange
  skylt som laxrosa i 3D bredvid rätt orange i panelen). Scenen är ljus: en matt yta blev
  1,7 gånger sin egen färg, och färgomvandlingen (`NeutralToneMapping`) bleker det som är
  ljusare än skärmen kan visa. Orange #FF6A00 ritades som #F9825A och blått #0057B8 som
  #1C73E8. Plastens färger läggs nu i materialet delade med `STUDIO_GAIN` (`litColor` i
  `three/materials.ts`): ytan, kärnan, den frästa fickan och tryck i förvald färg.
  - Mätt på alla 17 plastfärger: störst avvikelse per kanal 90 före och 44 efter. Det som
    återstår är ytans glans, som lyfter de mörkaste kanalerna (orange blir #F16B2C).
    Vit plast ritas en aning mörkare än förut (#F0F0F1 mot #F9F9F9).
  - Metallen, guld- och silverplastens metallfilm och den lackade vita ytan är orörda: de
    är inställda för ögat och är inga färger att träffa. Tryck i kundens egen färg och en
    logga i färg ritas som förut utan ljussättning, alltså exakt.
  - Ändras ljuset (`StudioEnvironment`, riktljuset) ska `STUDIO_GAIN` mätas om.
- **Startsidans platta ritning rymmer sin egen skugga** (besked via ägaren 2026-11-18: en
  kollega såg en blek ruta med skugga bakom 3D-skylten på startsidan, i Safari på Mac och
  iPad). Ritningen (`BadgePreview`, `.flat` i `home-hero.module.css`) visas tills 3D-vyn har
  startat och tas sedan bort. Rutan i kollegans bild var exakt ritningens ruta, 420 × 210 px,
  med ritningens skugga runt om och sidans bakgrund i mitten. Min slutsats är att Safari
  ritade om rutan när ritningen togs bort, men inte skuggan utanför den (`filter:
  drop-shadow` på en SVG med `overflow: visible`), och att inget ritade om ytan sedan,
  eftersom 3D-vyn ligger i ett eget lager ovanpå.
  - Rättningen: `.flat` har en ruta som är 48 px större åt alla håll, med lika stor negativ
    marginal, så att skuggan ligger innanför det som ritas om. Ritningen står exakt där den
    stod (mätt i Chrome och WebKit på fyra skärmbredder).
  - **Felet är inte återskapat**: varken ägarens Safari, Chrome eller Playwrights WebKit
    visar det, och en skärmbild i ett testverktyg ritar ändå om hela sidan. Rättningen är
    alltså inte bekräftad på en enhet som hade felet. Syns rutan igen: be den som ser den
    rulla eller ändra fönstrets storlek. Försvinner rutan då är det samma slags fel.
  - Ta inte bort marginalen och rutans storlek som överflödiga: de har ingen synlig verkan
    i en webbläsare som ritar om rätt.
- **Skyltmotorns arbete sparas i webbläsaren** (2026-11-15, `useSavedWork`, regler i
  `src/lib/designer-work/`): skylten i editorn, namnlistan och varukorgen ligger i
  `localStorage` och finns kvar när sidan laddas om. En nyckel per sammanhang (webben, en
  butik, en återförsäljares kund), sparat 300 ms efter senaste ändringen.
  - Det sparade kastas om det är trasigt, äldre än 14 dagar eller innehåller en skylt som
    inte säljs längre, och rensas när ordern är mottagen. Vid kortbetalning ligger det kvar
    tills ordern är betald, eftersom kunden kan avbryta.
  - Öppnas sidan med en annan skylt än den sparade (en delad länk eller ett nytt namn från
    startsidan) gäller den nya i editorn, och varukorgen kommer tillbaka (`restoredWork`).
  - Raden "Vi hämtade tillbaka din varukorg" har knappen "Börja om", som tömmer direkt utan
    att fråga. Får det sparade inte plats sparas ingenting, hellre än en halv varukorg.
  - En inbäddad butik på en återförsäljares sajt kan sakna `localStorage`; då sparas inget.
- `/verkstad`, produktionssidan här i projektet, visar fortfarande bara demoordrar. Riktiga
  ordrar är tänkta att gå via kopplingen till verkstadens eget system.
- Öppet: underlaget per period räknar på månaden ordern lades, inte när den skickades eller
  fakturerades. Ingen har bestämt vilket som gäller för plattformens faktura till verkstaden.
- **Offerten mejlas till kunden sedan 2026-11-17**, se avsnittet Offertmejlet. När kunden
  svarar får återförsäljaren ett besked i panelen (se avsnittet Besked). Sajtens övriga mejl
  (kundens orderbekräftelse och fraktbesked) är byggda men avstängda, se Mejl från sajten.
- Kontrollerat 2026-11-17 mot den riktiga skyltmotorn, lokalt på samma dator (båda i
  utvecklingsläge): en ny order skickas av sig själv och blir en order i Mottagen där, och
  statusbytena Tillverkning och Skickad kommer tillbaka med spårningslänk. Aldrig provat mot
  skyltmotorn i drift på AWS.
  - Samma dag, efter rättningarna: ordrar från kassan, panelen, en godkänd offert och en
    återförsäljare kom fram med rätt mottagare, telefon och aviseringsadress, upphämtning utan
    mottagare, och expressfraktens pris kom tillbaka med statusbytet. Telefonkravet är provat i
    alla fyra formulär i webbläsaren.
- Kontrollerat 2026-11-14 mot en låtsasverkstad på datorn (produktionsbygget med kopplingen
  på): en ny order skickas en gång, ett fel går att göra om, en väntande order skickas från
  översikten och statusen kommer tillbaka. Aldrig provat mot verkstadens riktiga system.
- Kontrollerat i produktion 2026-11-14 med kopplingen av, för alla roller: ansökan, godkännande,
  val av lösenord, order med leverans, offert med två designer, kundens godkännande och nej,
  korrektur, en kunds egen beställning och adminens sidor. Testordrarna togs bort genom
  gränssnittet.
- **Produktionen städades 2026-11-16** på ägarens begäran, genom panelens egna knappar: all
  demodata, alla ordrar, kunder och offerter under admin och alla tre återförsäljarkonton med
  sina ansökningar togs bort. Efteråt finns inga konton, ordrar, kunder eller offerter i
  produktion. Kvar är admininlogget och de 327 butiker som byggdes åt tänkta återförsäljare
  2026-10-27 (ägarens besked: behåll dem). Demofunktionerna i koden ("Fyll med demodata" och
  `/verkstad`) är också kvar.
  - Adminens företagsnamn är nu namnskylt.com. Övriga företagsuppgifter under Inställningar
    (logga, undertitel, organisationsnummer, e-post, telefon, hemsida, adress och färger) är
    inte ändrade och tillhör fortfarande företaget som stod där förut. Sedan 2026-11-18 visas
    de inte för kunden: offerter, ordersidor, korrektur och köpvillkor bär Skylt & Gravyrtekniks
    uppgifter. De syns i panelen, i utskickets signatur och i anropet till verkstaden när
    namnskylt.com själv står som beställare (en kortbetald order, eller aviseringen när skyltar
    skickas till oss själva). Offertens villkor under Inställningar står däremot på offerten.
- Skyltmotorn på mobil och låga skärmar: beställningsformuläret öppnas sist i panelen, och
  sidan rullar dit först när formuläret har vecklat ut sig (`FORM_OPEN_MS`, `[data-order-form]`
  med `scroll-margin-top`). Rullas det direkt avbryts rullningen av att sidan ändrar höjd.
- `/verkstad` ligger bakom sajtspärren: utan sajtkoden nekas verkstadens inloggning (401).

## Skyltmotorns knappar, telefon och surfplatta — läge 2026-11-19

- **Panelens ordning: skylten byggs uppifrån** (förslag från Mats på verkstaden 2026-11-20, som
  ägaren bad mig bygga "utan att ändra funktionen": material och färg först, "så att man
  först sätter förutsättningarna för vad som kan göras innan finjusteringarna kommer").
  Sektionerna står så här sedan 2026-11-21: **01 Material & färg, 02 Form, 03 Text,
  04 Märkningsmetod, 05 Logga, 06 Fäste, 07 Fler namn.** Förut stod Text, Märkningsmetod och
  Logga först, och Material och Form som 04 och 05.
  - **Ordningen står på ett ställe**, `PANEL_SECTIONS` i `src/features/designer/panel-steps.ts`:
    varje sektion läser sitt nummer därifrån (`panelStep`), och genvägarna på telefon läser
    samma lista. Ordningen sektionerna ritas i står i `designer.tsx` och ska vara densamma.
  - Mats lista var "Material, Färg, Namn, Titel, typsnitt, Logga, fästmetod". **Var Form och
    Märkningsmetod hamnar valde jag:** Form direkt efter materialet, eftersom formen också
    sätter förutsättningarna (klämman, ramen, textens yta), och Märkningsmetod kvar före
    Logga, som ägaren bestämde 2026-11-16. Det enda som har flyttats är alltså att Material
    och Form står före Text. Inget val, ingen text och inget pris är ändrat.
  - **Markören ställs fortfarande i skyltens första rad**, men namnfältet står inte längre
    först, och webbläsaren rullar annars själv fram ett fält som får markören: då hamnade
    fältet mitt i panelen med material och form utanför bild (`focusFirstRow` i `designer.tsx`).
    - **Efter startrutan**, där material, färg och form just har valts, rullas textens sektion
      fram till panelens början (`reveal`), så att kunden fortsätter på namnet.
    - **En säljare som kommer rakt in i editorn** ser panelen från början, alltså material.
      Markören står ändå i första raden, så namnet går att skriva direkt, och textens sektion
      rullas fram när första tecknet skrivs. Ett fält som redan syns flyttas inte.
    - Rullningen görs utan mjuk rörelse: sidan rullar annars mjukt (`globals.css`), och nästa
      tecken avbryter då rullningen halvvägs.
    - Att säljaren möts av material och inte av namnfältet valde jag: annars hade den som
      använder motorn mest aldrig sett den nya ordningen.
  - Provat lokalt 2026-11-21 i Chrome (86 kontroller) och i Safaris motor (71) på 1366 × 900,
    1366 × 700, 820, 390 och 320 px: ordning och nummer, genvägarna, de tre vägarna in
    (direkt, från startsidan och som säljare) och att varje sektion har kvar sina val. Säljarens
    väg är inte provad i Safaris motor, som inte sparar inloggningens kaka över http lokalt.
    Inte provat på en riktig telefon.
  - Kontrollerat i drift 2026-11-21 efter pushen (`879756a`), bara läsning, med alla anrop som
    sparar stoppade i webbläsaren (7 av 7): ordningen och numren, genvägarna på telefon,
    markören efter startrutan, och som admin att panelen börjar på material och att textens
    sektion rullas fram när namnet skrivs. Åtta skärmbilder ligger i mappen
    `Namnskylt-ny-ordning-2026-11-21` på ägarens skrivbord (utanför repot).
- **Över skylten finns bara Video, och Offert för den som är inloggad i panelen** (besked av
  ägaren 2026-11-19, i två omgångar: först togs Gravera, Vänd och Snurra bort, sedan Fotoläge
  och Dela). Skylten vrids fortfarande genom att dra i den, vänds av sig själv när ett fäste
  väljs, och graveras fram en gång när skyltmotorn öppnas.
  - Fotolägets strålspårning ligger kvar i `Badge3D` (`photo`, `PathTracer`), men ingen sida
    slår på den. Skyltmotorn skickar `photo={false}`.
  - Dela: `src/features/designer/share.ts` är borttagen. En delad länk (`/skapa?d=…`) öppnas
    som förut, och `encodeShareCode` används fortfarande av inspirationsbanken och
    ordersidorna. `POST /api/share-image` anropas inte längre av någon sida.
  - **Video och Offert finns i alla vyer av skylten** (besked via ägaren 2026-11-20: de syntes
    bara med 3D markerat, och "ska alltid finnas även i skiss-läget"): 3D, Ritning och På
    person. Filmen spelas in ur 3D-vyn, så från en annan vy byter Video först till 3D och
    börjar när vyn har ritats (`recordVideo`: inspelaren läses efter väntan, eftersom den som
    fanns när knappen trycktes hör till en vy som är borta). I Ritning står "Återställ
    placering" i samma rad. Ryms tre knappar inte på en smal telefon börjar raden från
    vänster och går att rulla (`.stageActions` i `designer.module.css`).
- **Sajten ska vara lika lätt att använda på telefon och surfplatta som på dator** (besked av
  ägaren 2026-11-19: "Motorn är exempelvis inte mobile-vänlig. Det är alldeles för liten
  skrollyta för val"). Förut tog skylten 48 % av höjden och prisdelen cirka 220 px, så på en
  iPhone blev ungefär 60 px kvar till valen.
  - **Telefon (under 700 px, `designer.module.css`):** skylten står fast överst i en tredjedel
    av höjden (`--stage-height`, i `svh` så att den står still när adressfältet fälls in),
    med vyväljaren ovanför och knapparna under. Måttraden och tipsen visas inte där, bara
    varningar (`data-tip` på tipsen). Rubriken "Din namnskylt" är dold för ögat.
    - **Genvägar mellan sektionerna** står fast under skylten (`SectionNav` i
      `section-nav.tsx`), i panelens ordning: Material, Form, Text, Metod, Logga, Fäste,
      Fler namn. Ett tryck rullar fram sektionen (`scroll-margin-top` ur `--panel-sticky-top`), och den man står i
      är markerad. Raden finns bara på telefon.
    - **Prisdelen är en rad** (`sections.module.css`): antal, pris och "Lägg i varukorgen",
      med "exkl. moms och frakt" och knappen Prisdetaljer under. Prisets delar fälls ut med
      Prisdetaljer (`details` i `OrderSection`). Blir summan lång, eller skärmen smal
      (320 px), hamnar knappen på en egen rad.
      - **Samma täta rad gäller alla skärmar** (besked av ägaren 2026-11-19, om en bärbar
        dator: "denna rutan tar för stor plats", och på frågan valdes "Tät rad överallt").
        Rutan tog 330 av panelens 540 px för en återförsäljare, och är nu cirka 130 px med
        ett namn på skylten. Den utfällda varianten med allt synligt finns inte längre.
      - **Antalets snabbval (1, 10, 50, 101 st) ligger under Prisdetaljer**, bredvid prisets
        delar och mängdrabatten (`.quick`). Det valde jag, så att de finns kvar.
      - Återförsäljarens inköp, kundpris och marginal står alltid kvar vid priset, utan
        ruta. Med en skylt ryms de på en rad. Med fler står inköpet också per styck, och då
        bryts raden till två (sett i drift 2026-11-19). I kassan i varukorgen har de sin
        ruta som förut.
      - Regeln från 2026-11-16 gäller fortfarande: lägg inte till rader vid priset utan att
        ta bort andra.
    - Ytan för valen är nu cirka 240 px på en iPhone (390 × 664), 310 px på en större
      Android och 150 px på de minsta telefonerna.
  - **Kameran följer rutans storlek** (`adaptive` i `three/camera-distance.tsx`, bara i
    skyltmotorn): i en låg ruta går den så nära som skylten ryms, annars blev skylten 88 px
    bred på telefon. I en smal, hög ruta backar den tills skylten ryms på bredden.
  - **Surfplatta (från 700 px):** skylten och valen står bredvid varandra, som på dator, med
    en smalare panel upp till 900 px. Scenens rader och panelens kort följer sin egen bredd
    med behållarfrågor (`container: stage` och `container: panel`), inte fönstrets.
  - **Övriga sidor** stack inte ut på bredden på 320, 390, 768 eller 1024 px. Rättat:
    sidfotens länkar står på en egen rad med tryckytor på 44 px, startsidans skrivfält var
    24 px högt på telefon (nu 48), och länkarna "Så funkar det" och i stegen har större
    tryckyta på pekskärm (`@media (pointer: coarse)`).
  - **Panelen:** tabellen på Tillverkning fick hela sidan att rulla i sidled, också på dator
    (dolda etiketter i tabellen räknades mot sidans bredd). Rättat med `position: relative`
    på tabellens rullyta. Övriga sidor i panelen höll sig inom skärmen på 390 och 768 px.
  - Provat lokalt 2026-11-19 i Chrome med pekskärm på 320, 375, 390, 412, 768, 820 och
    1024 px. **Inte provat på en riktig telefon eller surfplatta, och inte i Safari.**
  - Kända brister: sidhuvudet (64 px) står kvar över skylten på telefon. På de minsta
    telefonerna är ytan för valen fortfarande liten. Panelens sidor är bara mätta på bredden,
    inte genomgångna för tryckytor.

## Offert från skyltmotorn — läge 2026-11-19

Den som är inloggad i panelen har knappen **Offert** till höger om Dela (beslut av ägaren
2026-11-19). Den visar offerten på skyltens plats, och offertens uppgifter i panelen bredvid,
som i Merchins offertverktyg (dokumentet i mitten, inmatningen bredvid). Koden ligger i
`src/features/designer/quote/` och `src/lib/quotes/draft.ts`.

- **Flödet:** Offert → säljaren ser dokumentet, ändrar texterna direkt i det, lägger till och
  tar bort delar med ikonraden, väljer kund (befintlig eller ny) och giltig till → **Spara**.
  Då sparas offerten, PDF:en och en 3D-film per skylt laddas ner till säljarens enhet, och
  säljaren skickar dem själv till kunden. **Inget mejlas härifrån.** Offerten väntar sedan
  under Offerter i panelen, där säljaren trycker **Godkänn** eller **Neka** åt kunden. En
  godkänd offert blir en order som går till verkstaden, som förut.
- **Texterna ändras genom att klicka i offerten**, som i Merchins offert (besked av ägaren
  2026-11-19): rubriken (projektet), hälsningen och den avslutande texten är redigerbara i
  dokumentet (`data-edit`, `QuoteSheet`). Ändringen sparas när fältet lämnas, Escape ångrar,
  och Enter sparar rubriken. Kunden och "Giltig till" ändras i panelen: ett klick på dem i
  dokumentet ställer markören i rätt fält (`data-jump`, `QUOTE_FIELD_IDS`).
  - Dokumentet ligger i en skuggrot i sidan, inte i en ram, så att sajtens stil inte når det
    och texterna går att skriva i. Det byts på plats utan att blinka, och bytet väntar medan
    säljaren skriver i ett fält.
  - Pris och antal går inte att ändra i dokumentet. Antalet hör till skylten, och priset
    ändras i panelen efteråt.
- **Ikonraden till vänster om offerten** (`QuoteRail`, samma besked) lägger till och tar bort
  delar: Logga, Hälsning, Bilder, Vinklar, Alla skyltar, Moms, Avslutande text, Löften,
  Svarsruta, Villkor, Våra uppgifter och 3D-film till mejlet. På telefon står raden ovanför offerten. Valen
  sparas i `quotes.options` (`QUOTE_ELEMENTS`, `QuoteOptions`, `storedQuoteOptions` sparar
  bara det som avviker från förvalet), och den avslutande texten som `options.closing`.
  - **Valen gäller PDF:en och kundens offertsida** (sedan 2026-11-20, se nedan). Förut följde
    sidan bara valet om loggan.
- **Kundens offertsida visar samma uppgifter som PDF:en** (besked via ägaren 2026-11-20, med
  PDF:en och sidan bredvid varandra: "PDF o mail visar inte samma info"). Sidan
  (`/offert/<kod>`, dit mejlets länk leder) hade en egen rubrik ("Offert till X" mot PDF:ens
  "Namnskyltar till X") och en enda bild, och saknade offertdatum, vinkelbilderna, rutan med
  alla skyltar, den avslutande texten, löftena och säljarens val av delar.
  - **Det som står på offerten bestäms på ett ställe, `src/lib/quotes/view.ts`**: rubriken
    (`quoteHeading`), kundens rader och dagarna (`quoteInfoRows`), bilderna per design med
    vinklar (`quoteGalleries`), alla skyltar (`quoteAllBadges`), löftena, villkoren och
    säljarens uppgifter. PDF:en (`document.ts`) och sidan ritar båda ur de delarna. **Lägg
    det som ska stå på offerten där, inte i den ena av de två.**
  - Sidan ritar delarna i sin egen form, som fungerar på telefon: bilden först på en smal
    skärm, uppgifterna bredvid bilden på en bred, och alla skyltar två eller fyra i bredd.
    Att sidan inte är PDF:ens A4-sida inlagd som den är valde jag: den blir oläslig på telefon.
  - Det som skiljer med flit: PDF:ens ruta "Godkänn offerten — svara …" är på sidan
    knapparna Godkänn och Tacka nej med leveransformuläret. Sidan har kvar en liten ritning
    per rad, och när offerten är besvarad säger sidans rubrik hur det gick ("Tack för
    ordern!"), med offertens rubrik i kortet.
  - Hälsningen visas nu i alla lägen, inte bara medan offerten väntar på svar. Leveransen
    står som en rad bland kundens uppgifter, som i PDF:en, i stället för under summan.
  - **Offertmejlet är oförändrat**: en kort sammanfattning med bild, summa och knappar, som
    leder till sidan. Jag läste "mail" som sidan bakom mejlets länk, eftersom bilden i
    beskedet var den.
  - Provat lokalt 2026-11-20 genom att läsa texten ur den nedladdade PDF:en och jämföra med
    sidan (16 kontroller, och 390 och 320 px): rubrik, kundens rader, vinklarnas bildtexter,
    alla skyltar, hälsning, löften, villkor och alla belopp står på båda. Inte provat i drift.
- **Bilderna: en stor och tre små per design** (samma besked), tagna ur 3D-vyn: tre kvart,
  rakt framifrån, från sidan och baksidan med fästet (`QuoteShots`, `stillAt` i
  `three/recorder.tsx`). Skyltarna ritas en i taget i en osynlig 3D-vy med kameran nära
  (`fit`), beskärs i webbläsaren och kodas om på servern (`normalizeBadgeShot`). De sparas i
  `quotes.shots` (migrering 033, `QuoteShot`), en plats per design i den ordning
  `orderDesigns` ger, och läses bara när en enskild offert hämtas. Högst fyra designer får
  bilder; fler, och äldre offerter, ritas som ritningar. Flera designer står två i bredd.
  - **Alla skyltar syns på offerten** (besked av ägaren 2026-11-19, som gjorde en offert med
    fyra namn och bara såg den första skylten: "vill att alla skyltar ska synas på offerten").
    Bilderna ur 3D-vyn visar en skylt per design. Har en design flera namn står därför rutan
    "Alla skyltar" under: en ritning per namn, fyra i bredd, med namnet under
    (`everyBadge` i `document.ts`, valet `badges`). Högst 60 ritas; fler står i raderna, och
    det sägs. Ritningarna sparas per skylt (`drawing`), så att förhandsvisningen inte ritar om
    dem för varje tecken. Rutan gäller alla offerters PDF, också äldre och dem från varukorgen.
  - **En vridbar 3D-skylt i PDF:en är inte byggd**, och jag avrådde: formatet finns, men bara
    Adobe Acrobat på dator visar det. Webbläsarens visare, Förhandsvisning på Mac och
    telefoner visar en tom ruta.
  - Den osynliga 3D-vyn ligger utanför panelen i sidan. Panelens innehåll är dolt i
    offertvyn, och en dold ruta har ingen yta att rita på: då tas inga bilder.
- **En 3D-film per design laddas ner med PDF:en** (besked av ägaren 2026-11-19: så att
  återförsäljaren kan skicka med filmerna i mejlet). Samma osynliga vy spelar in ett varv
  runt skylten efter bilderna, 6 sekunder i 4 Mbit/s, cirka 3 MB per film (`recordTurn`).
  Filen heter `namnskylt-<namn>-<offertnummer>.mp4`. Spara väntar bara på bilderna, inte på
  filmerna (se Spara väntar inte på 3D-filmen). Filmerna sparas inte på servern: de ligger i
  webbläsarens minne, och den sparade rutan har knappar för att ladda ner dem igen.
  - Filmen är en per design, inte en per namn: fyra namn i samma design ger en film, med
    det första namnet. Ägaren sa "på respektive skylt"; en film per namn skulle ta sex
    sekunder och 3 MB per namn.
  - Väljs "3D-film till mejlet" bort i ikonraden spelas inget in.
  - Webbläsaren kan fråga om lov när flera filer laddas ner samtidigt. Två olika skyltar tog
    14 sekunder att filma i provet.
- **Panelens "Ny offert" öppnar skyltmotorn direkt** (besked av ägaren 2026-11-19: från
  panelen ledde vägen genom kundformuläret och varukorgen, och den snabba offerten nåddes bara
  via startsidan). `/admin/ny-offert` skickar vidare till `/skapa?offert=1`, med `?kund=` när
  kunden är vald i förväg. Kundformuläret (`StartOrderForm`) används bara för Ny order.
- **Knappen vid priset är "Skapa offert" när säljaren kom in för att göra en offert**
  (`quoteFirst` i `OrderSection`, när `reseller.mode` är `quote`; byggt 2026-11-19 på ägarens
  fråga om vägen gick att förenkla). Den öppnar offerten rakt från skylten, utan varukorg.
  "Lägg i varukorgen" är då en länk på raden under, för den som vill ha flera olika skyltar i
  samma offert. Raden överst i panelen säger "Ny offert. Gör skylten och tryck på Skapa
  offert. Kunden väljer du där." Knappen Offert över skylten finns kvar, utan framhävning.
  Kommer säljaren in för en order (Ny order, eller rakt till `/skapa`) är knappen vid priset
  "Lägg i varukorgen", som förut.
  - **Vägen är nu:** logga in (offertlistan) → Skapa offert → skriv namnet → Skapa offert →
    skriv kundens företag → Spara.
- **En offert går att spara som utkast, utan kund** (besked via ägaren 2026-11-20, med tre
  förslag: ett val "utkast / utan kund" vid kunden, en knapp "ladda ner" utan kund, eller ett
  tredje alternativ "utkast" i kundvalet, "så slipper man fylla i massa info"). Jag byggde
  det tredje, som täcker alla tre: kundvalet i offertvyn har **Befintlig kund, Ny kund och
  Utkast** (`CustomerTarget` med `kind: "none"`, `allowDraft` i `ResellerCustomer`). Med
  Utkast sparas offerten utan kund, och PDF:en och filmen laddas ner som vanligt. Någon
  särskild knapp för nedladdning finns inte, eftersom Spara redan laddar ner.
  - **Dokumentet ritas utan kundrader**, och rubriken är "Namnskyltar" tills säljaren ger
    offerten ett projektnamn (`noCustomer` i `draftQuote`, `defaultQuoteTitle` i `document.ts`).
  - **Offerten sparas som Utkast**, inte som skickad: den har ingen kund som kan svara
    (`unassigned` i `createQuote`, `noCustomer` i `POST /api/admin/quotes`). Den mejlas aldrig.
  - **Kunden väljs i panelen innan offerten skickas eller godkänns.** Offertens sida visar
    "Välj kund" med samma val som i offertvyn (`QuoteCustomerForm`,
    `assignQuoteCustomerAction`, `assignQuoteCustomer`), och har bara Makulera tills kunden är
    vald. Listan visar "Utan kund" och "Utkast utan kund. Öppna offerten och välj kund." i
    stället för Godkänn och Neka. Skicka och Godkänn nekas också på servern
    (`NO_CUSTOMER_ERROR` i `sendQuote`, `sendQuoteAction` och `acceptQuote`). Att kunden måste
    väljas före Godkänn valde jag: en order ska höra till en kund.
  - **I databasen pekar utkastet på en platshållare**, en per säljare
    (`src/lib/orders/unassigned-customer.ts`, `unassignedCustomerId`): `quotes.customer_id`
    kräver en kund, och en platshållare behövde ingen migrering. Den känns igen på adressen
    `utan-kund@utkast.invalid`, som en borttagen kund känns igen på sin. **Platshållaren visas
    aldrig som en kund**: den finns inte i kundlistan eller kundvalen, `getCustomer` ger
    `null` för den, och `toQuote` läser offerten med tomma kunduppgifter och
    `StoredQuote.noCustomer`. Dess adress når alltså aldrig offertmejlet eller en sida. Läs
    offertens kund i panelen med `quoteCustomerLabel`, som ger "Utan kund".
  - En offert som har en kund byter aldrig kund den vägen: `assignQuoteCustomer` ändrar bara
    en offert som pekar på platshållaren. Offerten blir demo när den valda kunden är det.
  - Valet finns också för admin. Hos namnskylt.com krävs kundens företag,
    organisationsnummer, kontaktperson och e-post när kunden sedan väljs.
  - Provat lokalt 2026-11-20 som återförsäljare i Chrome (12 kontroller, och 390 och 320 px):
    Utkast i offertvyn, Spara med PDF och film, listan, Välj kund på offertens sida, och att
    Godkänn finns först när kunden är vald. Inte provat i drift, och Godkänn trycktes inte.
  - Kända brister: kunden går inte att byta eller ta bort när den väl är vald. Kundens
    offertsida (`/offert/<kod>`) visar ett utkast som "Offerten är inte klar än".
- **En återförsäljares kund behöver bara ett företagsnamn på en offert** (beslut av ägaren
  2026-11-19, på frågan om vad som mer gick att korta: "Båda"). Offerten mejlas inte
  härifrån, så kontaktperson och e-post är frivilliga (`newCustomerOf` och
  `quoteCustomerFields` i `order-customer.ts`, `minimal` i `resolveOrderCustomer`,
  `customerOf` och `ResellerCustomer`).
  - **Kunden sparas med tom e-post**, och med företagets namn som namn när kontaktpersonen
    saknas. Migrering 034 gör att flera kunder utan e-post får finnas hos samma säljare: det
    unika indexet gäller bara kunder som har en e-post, och de tre `on conflict`-satserna bär
    samma villkor (`where email <> ''`). Regeln "samma e-post är samma kund" gäller som förut
    för kunder med e-post.
    - **Varje sats som sparar en kund med `on conflict (reseller_id, email)` måste bära
      villkoret**, annars svarar Postgres att ingen unik regel matchar (42P10). Det gällde
      också ett test med egen SQL, som föll tills det rättades.
    - Vid driftsättningen körs migreringen när den nya versionen startar, medan den gamla
      fortfarande svarar en kort stund. Under den stunden kan den gamla versionen inte spara
      en kund. Sajten har inga riktiga kunder än; senare bör en sådan ändring göras i två steg.
  - **Gäller bara återförsäljare, och bara offerter som sparas utan mejl.** Hos namnskylt.com
    krävs företag, organisationsnummer, kontaktperson och e-post, eftersom verkstaden
    fakturerar och aviserar kunden. En order från varukorgen kräver kontaktperson och e-post
    som förut.
  - **En godkänd offert blir en order på offertens kund** (`customerId` i `NewOrder`,
    `placeOrder` och `acceptQuote`). Förut letades kunden upp på e-posten, och en kund utan
    e-post hade då blivit en ny kundrad vid varje order.
  - Där kunden saknar kontakt visas ingen tom rad: offertens dokument och kundens offertsida
    hoppar över "Kontakt", kundväljaren visar bara namnet, och kundens sida i panelen säger
    "ingen e-post sparad". Offertmejlet från panelen vägrar med ett begripligt besked.
  - Verkstadens mottagare godtar en tom e-post för slutkunden (läst i deras kod 2026-11-19,
    inget ändrat där): fältet är fri text, och de använder bara namnet och företaget i sin
    anteckning. Ett test vaktar vårt anrop.
  - Känd brist: en kund som sparats utan e-post kan inte få en i panelen efteråt, eftersom
    det inte finns något formulär för att ändra en kund. Väljs "Ny kund" med e-post nästa
    gång blir det en ny kundrad.
- **Spara väntar inte på 3D-filmen** (samma beslut). Knappen går att trycka så fort bilderna
  är tagna, cirka två sekunder efter att offerten öppnas. PDF:en laddas ner direkt, och
  filmen när den är inspelad, några sekunder senare. Offertens designer hålls kvar efter att
  varukorgen har tömts (`frozen` i `use-quote.ts`), så att inspelningen går klart, och den
  sparade rutan säger att filmen spelas in (`filmsLeft`, `savedFilms`). Lämnar säljaren sidan
  innan filmen är klar får offerten ingen film.
- **Er marginal, bredvid summan** (besked av ägaren 2026-11-19, som ringade in den tomma
  ytan till vänster om summan: "er marginal - ska kunna ändra enligt merchin", "syns bara för
  dig"). Rutan visar säljarens inköp, kundens pris och marginalen på varorna, utan frakt, och
  har ett fält för marginalen i procent (`QuoteMargin`, `privateBox` i `document.ts`).
  - **Rutan ritas bara i förhandsvisningen** (`render.editable` med `render.margin`), aldrig
    i PDF:en eller på kundens offertsida. Ett test vaktar det.
  - **Ändras procenten räknas kundens pris om**: à-pris = säljarens inköp per skylt delat med
    (1 − marginalen), i hela kronor (`marginPercent` och `pricing` i `use-quote.ts`), högst
    90 %. Priset sparas på offerten som à-pris per skylt (`Pricing.unitOverrides`,
    `pricing` i `POST /api/admin/quotes`), så panelens prisredigerare visar samma pris.
    "Återställ till listpris" tar bort ändringen. Marginalen som visas är den verkliga efter
    avrundningen, så 55 % kan visas som 55 eller 54.
  - **Bara en inloggad återförsäljare ser rutan.** Admin har inga inköpspriser i
    skyltmotorn (se Återförsäljarens priser visas bara för en inloggad återförsäljare).
  - **Ett överstruket listpris visas bara när kunden får ett lägre pris**, i PDF:en och på
    kundens offertsida. Förut ströks listpriset också när priset höjdes, vilket såg ut som
    en rabatt åt fel håll. Sänks priset visas rabatten mot listpris, som förut.
  - Hos namnskylt.com gäller regeln för direktordrar också här: bara à-priser, ingen rabatt
    i procent och inga extrarader (`DIRECT_PRICING_ERROR`).
  - Provat lokalt som återförsäljare 2026-11-19 (10 kontroller): höja, återställa, sänka,
    spara, och att en utloggad kund ser det nya priset men varken inköp eller marginal.
- **Varukorgens knapp heter Offert och öppnar samma offertvy** (beslut av ägaren 2026-11-19),
  med kunden som valdes i varukorgen (`DesignerCart.onQuote`). Förut hette den "Skicka
  offert" och mejlade offerten direkt till kunden. Det finns nu en väg till en offert, och
  ingenting mejlas förrän säljaren väljer det i panelen. Varukorgens andra knapp, Lägg order,
  är orörd.
- **Offerten gäller varukorgen och skylten i editorn** (`orderBadges`), till listpris. Efter
  Spara töms varukorgen och skylten börjar om, som efter en lagd order.
- **Dokumentet i förhandsvisningen är samma som PDF:en** (`quoteDocument`, som `quoteHtml`
  slår in till en fristående sida), ritat i webbläsaren ur ett utkast (`draftQuote`). Säljarens
  uppgifter, logga och platta kommer från servern och är dem PDF:en ritas med
  (`quoteSellerView` i `src/lib/quotes/seller-view.ts`, `ResellerOrderContext.quoteSeller`).
  Utkastet bär numret "Utkast" tills offerten har sparats.
- **Servern:** `POST /api/admin/quotes` tar `send: false`, `message`, `validUntil` och
  `options`. Med `send: false` mejlas ingenting, också när offertmejlet är påslaget, och
  offerten sparas som **skickad** (`createQuote` med `manual`), inte som utkast: kundens länk
  ska gå att öppna om säljaren delar den, och offerten väntar på svar. Svaret bär `pdfPath`.
  Varukorgens "Skicka offert" är orörd och mejlar som förut.
- **Offertens val** sparas i `quotes.options` (migrering 032, `QuoteOptions`), se ikonraden
  ovan. `logo: false` sätter säljarens namn i stället för loggan i PDF:en, på kundens
  offertsida och i offertmejlet (`showsSellerLogo`).
- **En offert som inte har mejlats härifrån** säger i dokumentet "svara … att ni godkänner"
  i stället för "öppna länken i mejlet" (`quote.emailedAt`). Det gäller också äldre offerter
  som säljaren har skickat själv.
- **Panelen:** offertsidans del heter "Kundens svar", med knapparna Godkänn (förut "Godkänn
  åt kunden → order"), Neka och Makulera. Offertlistan har Godkänn och Neka på varje offert
  som väntar. **Neka är ny** (`declineQuoteForCustomer`, `declineQuoteForCustomerAction`):
  offerten blir nekad men finns kvar och kan ändras och skickas igen. Makulera drar tillbaka
  den helt.
- **Godkänn kräver leveransadress och telefon**, som förut (`acceptanceIssue`). Offerten
  sparas med leverans till kunden utan adress, så säljaren fyller i den under Leverans på
  offertsidan före Godkänn. Felet säger vad som saknas.
- **Knappen visas för alla som är inloggade i panelen**, också admin, fast ägaren sa
  "inloggad som återförsäljare". Det är min tolkning: `/skapa` är i säljarläge för båda, och
  admin gör offerter åt namnskylt.coms kunder. Hos namnskylt.com krävs kundens företag och
  organisationsnummer, som i varukorgen.
- Statusen heter "Skickad" i panelen, fast ägaren sa "väntande". Jag lade inte till en ny
  status: en skickad offert är den som väntar på svar.
- **Provat i drift 2026-11-19, på ägarens begäran**, med skärmbilder i mappen
  `Namnskylt-prov-2026-11-19` på ägarens skrivbord (utanför repot):
  - Som admin, mot demokunden: från panelens Skapa offert, fyra namn, redigering i
    dokumentet, ikonraden, Spara med PDF och 3D-film utan mejl, och Neka i listan (14 av 15
    kontroller; den femtonde var provets egen gräns för prisradens höjd). Offerten
    **OF-1019** ligger kvar i drift som nekad demooffert. Godkänn trycktes aldrig.
  - Som återförsäljare, med ett tillfälligt provkonto som skapades i driftens container
    (`pnpm reseller:create`) och togs bort i panelen efteråt: marginalrutan vid listpris, höjd
    till 55 %, sänkt till 25 % och återställd, utan att någon offert sparades.
- **Flödet är provat som återförsäljare** (2026-11-19, efter att ägaren misstänkte att det
  bara gällde admin; mina första prov kördes som admin): från panelens Ny offert, fyra namn i
  samma design, ny kund utan organisationsnummer, Spara med PDF och film, och offerten i
  återförsäljarens lista med Godkänn och Neka. Offerten bär återförsäljarens namn och nämner
  varken namnskylt.com eller verkstaden.
- Provat lokalt 2026-11-19 i Chrome (18 kontroller, och två skyltar i samma offert, och
  telefon): knapparna, bilderna, redigering i dokumentet, ikonraden, Spara med PDF och film
  utan mejl, och den sparade offerten. Godkänn utan adress och Neka i listan provades i
  omgången före. **Inte provat i Safari eller på en riktig telefon**, där filminspelningen
  och flera nedladdningar på en gång är det som mest kan skilja sig. Ingen offert har
  godkänts till en order i provet.
- Kända brister: en ny kund i offertpanelen får inget uppslag på organisationsnumret.
  Förhandsvisningen visar kundens namn ur kundlistan, inte adress eller telefon, som den
  sparade offerten har. Leveransen och priset går inte att ändra i offertvyn, bara i panelen
  efteråt. Texterna i dokumentet går inte att nå med skärmläsare på ett bra sätt; projektet
  och dagen har egna fält i panelen, men hälsningen och den avslutande texten skrivs bara i
  dokumentet. Filmerna försvinner om sidan laddas om innan de har laddats ner.
- **Offertens färger föreslås ur säljarens logga** (2026-11-19). Ägaren såg en mörkblå offert
  bredvid en logga i helt andra färger och frågade varför. Offertens färger är Huvudfärg och
  Accentfärg under Inställningar (`CompanyProfile.primaryColor`, `accentColor`), och ett nytt
  konto har förvalet, mörkblått och grönt. De lästes aldrig ur loggan. På mitt förslag sa
  ägaren "Ja, gör det".
  - **Regeln** är `quoteColorsFromLogo` i `src/lib/brand/match.ts`: huvudfärgen är loggans
    färgstarkaste färg som syns på vitt papper, annars dess mörkaste, eftersom den bär
    rubriker, summan och rutan om hur offerten godkänns. Accentfärgen är en annan av loggans
    färger, och huvudfärgen när loggan bara har en. En logga utan färg som syns på vitt, till
    exempel en helt vit, ger inget förslag. Gränserna (`HEADING_CONTRAST`, `SAME_TONE`) valde jag.
  - **Laddas en logga upp när färgerna aldrig har valts** (de är förvalet) tar formuläret
    loggans färger av sig självt (`hasDefaultColors`, `upload` i `company-form.tsx`).
    **Färger säljaren själv har valt rörs aldrig**: då står raden "Loggans färger" med koderna
    och knappen "Använd loggans färger". Följer färgerna redan loggan står det i klartext.
    Loggans färger står också som snabbval under de två färgfälten, före hemsidans.
  - Ingenting sparas förrän säljaren trycker Spara uppgifter. **Ett konto som redan har en
    logga och förvalets färger ändras inte av sig självt**: säljaren öppnar Inställningar,
    trycker på knappen och sparar. Offerter som redan är sparade ritas med de uppgifter som
    gäller när de visas, alltså i de nya färgerna.
  - "Hämta från hemsidan" sätter som förut hemsidans färger. Loggans färger föreslås då med
    knappen, de väljs inte av sig själva.
  - Avläsningen är samma som skyltmotorns (`logoPalette`). Den ligger nu i
    `src/hooks/use-logo-colors.ts` (`useLogoColors`, `readLogoColors`), flyttad från
    `print-color-field.tsx`, så att panelen kan läsa den utan att importera skyltmotorn.
  - Gäller bara återförsäljare. Hos namnskylt.com visas panelens färger aldrig för kunden.
  - Provat lokalt 2026-11-19 som återförsäljare i Chrome (12 kontroller, och 390 och 320 px)
    med fyra påhittade loggor: röd, tre färger på vit botten, svart med orange och helt vit.
    Offerten i skyltmotorn ritades i loggans färger.
- **Kontrollerat i drift 2026-11-19 efter pushen (`6f30cb3`), bara läsning**, som provkontot
  för återförsäljare (10 av 10): inloggningen leder till offertlistan, menyn saknar Översikt,
  "Skapa offert" står vid priset och öppnar offerten utan varukorg, en ny kund behöver bara
  företagets namn, Spara var redo efter 2,2 sekunder, och en röd provlogga under
  Inställningar gav röda färger i formuläret. Migrering 034 är tillämpad: indexet gäller
  bara kunder med e-post. **Spara trycktes aldrig**, varken på offerten eller under
  Inställningar, så ingen offert utan e-post har sparats i drift än.

## Kundens egen offert — läge 2026-11-20

En slutkund kan själv göra en offert i skyltmotorn och ladda ner den (besked av ägaren 2026-11-20:
"Även en slutkund som kommer in (inloggad eller icke inloggad) ska kunna ladda hem en offert exakt
som en återförsäljare men då med sina slutpriser osv med samma knapp som en återförsäljare har upp
till höger"). Koden ligger i `src/app/api/quotes/`, `src/features/designer/quote/` och
`src/lib/quotes/` (`customer-quote.ts`).

- **Inget behöver fyllas i** (ägarens besked senare samma dag, när den första versionen krävde
  kassans uppgifter: kunden ska kunna få offerten "bara så att han eller hon kan visa sina
  kollegor hur det skulle kunna se ut med bilder och så, som det är för en återförsäljare").
  Offerten är till för att visas upp. Uppgifterna krävs först när den godkänns.
  **Att det var kravet på uppgifter som skulle bort är min tolkning** av ett meddelande via
  tal-till-text ("kan handla den här offerten").
- **Knappen Offert över skylten visas för alla** (`customerQuote` på `Designer`, `selfQuote`): för
  den som är inloggad i panelen är den säljarens offertvy som förut, för alla andra kundens egen.
  Den finns på namnskylt.com och i butikerna, men inte i en butik som bara är en förhandsvisning
  för utskicket (`isOutreachPreviewShop`), och inte utan databas.
- **Vyn:** samma dokument som säljaren ser, till kundens pris (butikens priser i en butik,
  `shopOrderPricing`), med säljarens uppgifter: Skylt & Gravyrteknik på namnskylt.com, butikens
  ägare i en återförsäljares butik. Kunden ändrar inga texter i dokumentet, och ikonraden och
  marginalrutan finns inte. Panelen bredvid (`CustomerQuotePanel`) har "Era uppgifter (valfritt)":
  organisationsnummer med uppslag, företag, namn och e-post, och projekt och inköpsnummer. Det
  kunden fyller i står på offerten medan den skrivs. En inloggad kund får dem ifyllda ur kontot.
- **"Ladda ner offert" sparar offerten och laddar ner PDF:en** (`POST /api/quotes`,
  `saveCustomerQuote`, `submitSelf` i `use-quote.ts`), också med alla fält tomma. En 3D-film per
  design spelas in efteråt och hämtas med en knapp, inte av sig själv. Varukorgen står kvar, och
  varje nedladdning är en ny offert med eget nummer. Kunden får inget mejl.
- **Offerten sparas utan kund i kundregistret.** Den ligger på säljarens platshållare
  (`unassignedCustomerId`, alltså `noCustomer`), är märkt `quotes.by_customer` (migrering 039,
  `StoredQuote.byCustomer`) och sparas som **Skickad**, så att den går att godkänna.
  - **Det kunden skrev om sig själv ligger i `quotes.requester`** (migrering 040,
    `QuoteRequester`, `parseQuoteRequester`), obekräftat, och står på offerten tills den har en
    kund i registret: `toQuote` lägger det i `customer`. `hasQuoteParty` avgör om offerten har
    någon att nämna, och rubriken, kundraderna och `quoteCustomerLabel` följer den. Ett utkast
    som säljaren sparade utan kund har tomma uppgifter och ritas som förut.
  - **`noCustomer` betyder att offerten saknar kund i registret**, inte att den saknar namn att
    visa. Panelens Godkänn och offertmejlet nekar fortfarande en sådan offert
    (`NO_CUSTOMER_ERROR`).
- **Kunden lägger upp sig när offerten godkänns** (`acceptCustomerQuote`,
  `decideQuoteAction`). På offertens sida (`/offert/<kod>`) har svarsrutan då delen "Era
  uppgifter" (`QuoteDecision` med `party`): organisationsnummer med uppslag, företag, namn och
  e-post, förifyllda med det kunden skrev, och leveransadressen under. Kraven är kassans. Kunden
  sparas då hos säljaren (`upsertCustomer`, som i kassan), offerten får kunden
  (`assignQuoteCustomer`) och godkänns sedan som vilken offert som helst: den blir en order som
  går till tillverkningen. Ett utkast som säljaren sparade utan kund får aldrig sin kund den vägen.
  - Länken står i PDF:ens ruta: "Godkänn offerten — öppna www.namnskylt.com/offert/<kod>, fyll i
    era uppgifter och klicka Godkänn" (`QuoteRenderOptions.acceptUrl`, satt i PDF-vägen med
    `publicOrigin()`). I förhandsvisningen står att länken kommer med den nedladdade offerten.
  - Säljarens uppgifter hämtas först när offerten öppnas (`GET /api/quotes/seller`), så att loggan
    inte följer med varje besök i skyltmotorn. Fakturabrevlådan lämnar inte servern.
- **Kundregistrets uppgifter visas aldrig för den som har länken.** Ingen kundrad rörs när
  offerten laddas ner. När offerten har fått sin kund, genom att någon godkänner med en
  e-postadress som redan finns hos säljaren, töms kundens telefon och adress när offerten läses
  åt kunden (`guarded` i `toQuote`), och leveransen sparas alltid utan adress. Annars hade den
  som känner någons e-post fått ut dess adress. Säljaren ser kunden som vanligt i panelen.
  **Ta inte bort det skyddet.**
- **Den som äger panelen får ett besked** (ägarens "Ja tack!" 2026-11-20, på frågan om besked
  och mejl om en ny offert): slaget `quote-created`, "Exempel AB har laddat ner offert OF-2001",
  eller "En besökare har laddat ner offert…" när kunden inte skrev något om sig själv
  (`ANONYMOUS_REQUESTER`), med antalet skyltar och summan. Det leder till offerten och blir läst
  när den öppnas. **Hos namnskylt.com går beskedet också som mejl till adminens adresser**, genom
  strömbrytaren som redan är på (se Adminens besked som mejl). En återförsäljare får det i sin
  panel; dess mejl är avstängda som förut.
  - **Varje nedladdad offert ger ett mejl per adress, också från en besökare som inte uppgav
    något.** Det kan bli många. Ska bara offerter med uppgifter ge mejl är det en rad i
    `saveCustomerQuote`.
- **I panelen** står offerten under Offerter som Skickad, med raden "Nedladdad av kunden, som inte
  har lagt upp sig än". På offertens sida står rutan "Kunden laddade ner offerten själv", med det
  kunden skrev ("Uppgifterna är inte bekräftade") och länken till kundens offertsida. Säljaren
  kan också välja kund där, som för ett utkast.
- **Städning:** jobbet `customer-quote-prune` tar en gång per dygn bort offerter som kunder har
  laddat ner och som aldrig fick en kund, 60 dagar efter sista giltiga dag
  (`pruneUnclaimedCustomerQuotes`). Offerter med en kund i registret rörs aldrig. Gränser i
  processens minne: 8 offerter per klient och timme och 300 per dygn för hela sajten.
- Integritetssidan säger att en nedladdad offert sparas, och att uppgifterna om kunden är frivilliga.
- Bildernas kod delas av de två vägarna som sparar en offert (`src/lib/quotes/shots.ts`).
- Provat lokalt 2026-11-20 i Chrome som utloggad besökare, på dator och 390 px (12 kontroller
  var), mot en låtsasmottagare i stället för Resend: nedladdning utan att fylla i något, PDF:en,
  beskedet som två mejl, offertsidan med "Era uppgifter", och godkännandet som blev en order
  lokalt, utan kopplingen till verkstaden. Dessutom en offert med bara företagets namn, som stod
  på offerten, var förifyllt på offertsidan och syntes i panelen. Säljarens offertvy är
  kontrollerad som admin och är oförändrad. Butikernas skyltmotor är inte provad i webbläsaren,
  och inget är provat i Safari. **Inget riktigt mejl har skickats.**
- Kontrollerat i drift 2026-11-20 efter den första pushen (`8a214da`), bara läsning: migrering 038
  och 039, ramens pris i den sparade prismodellen, släppytan, och att en utloggad besökare får
  knappen Offert och kundens offertvy. Den versionen krävde kassans uppgifter vid nedladdningen.
- Kontrollerat i drift samma dag efter den andra pushen (`7c2cd76`), bara läsning, med alla anrop
  som sparar stoppade i webbläsaren: migrering 040 är tillämpad, städjobbet har körts, och en
  utloggad besökare får offertvyn utan kundrader, med "Era uppgifter (valfritt)" och knappen
  "Ladda ner offert" tryckbar utan uppgifter. **Ingen offert har sparats i drift**: nedladdningen,
  mejlet till adminens adresser och godkännandet på offertsidan är bara provade lokalt.
- Det jag valde själv: att offerten sparas (ägaren sa "ladda hem"), att varukorgen står kvar,
  att filmen hämtas med en knapp, att butikerna är med, att uppgifterna som fylls i är
  frivilliga fält i stället för att tas bort helt, att också en besökare utan uppgifter ger
  besked och mejl, och städningen efter 60 dagar.
- Kända brister: offerten på skärmen bär numret "Utkast" också efter att den har sparats. En
  offert som kunden har laddat ner hamnar inte på kundens konto när den blir en order. Den som
  godkänner med en e-postadress som redan finns hos säljaren skriver över den kundens namn,
  företag och organisationsnummer, som i kassan. Uppslaget på organisationsnummer fungerar inte
  på offertsidan för den som saknar sajtkoden, medan sajtspärren är på.

## Återförsäljarens panel med flikar — läge 2026-11-23

**Återförsäljarens panel har flikar i stället för sidomeny** (besked av ägaren 2026-11-23: "samma
design (inte brandbook, färger osv.) med tabbar osv. som projektet Merchin och /godis"). Förlagan
är Godis-sajtens panel i Merchin (`src/components/produktsajt/PanelMock.tsx` och `MockParts.tsx` i
`~/Desktop/Merchin/merchin-app`), som ägaren valde framför en sidomeny där 2026-11-22. Färgerna
och typsnitten är Namnskylts: papper, bläck, Instrument Serif i rubrikerna.

- **Ramen** (`ResellerTabs` i `src/features/admin/admin-shell.tsx`, klasserna `tabs…` sist i
  `admin.module.css`): överst raden "Återförsäljare · <inloggningens adress>", företagets namn
  stort, och knapparna **Ny offert** och **Logga ut**. Under dem flikarna som piller: Offerter,
  Ordrar, Kunder, Statistik, Inköpspriser, Export, Inställningar och Min butik när en butik är
  övertagen. Offerter, Ordrar och Kunder bär antalet i listan (`panelCounts` i
  `src/lib/orders/repository.ts`), och Offerter antalet olästa besked som "2 nya".
  - Sidomenyn är borta för återförsäljaren, och med den raden "Inloggad som återförsäljare".
    Logga ut står nu bredvid Ny offert.
  - Antalet ordrar som väntade, som stod på Ordrar i sidomenyn, är ersatt av antalet ordrar.
    Det valde jag, som i Godis.
  - Sidans egen rubrik står kvar under flikarna, mindre än förut, med sina knappar
    (till exempel "+ Skapa order").
- **Listorna är tabeller** för återförsäljaren: en rubrikrad (Order, Läge, Belopp; för kunder
  Kund, Senaste order, Ordrar, Skyltar, Försäljning), och varje order och offert tonad efter
  läget, med en kant i lägets färg (`data-tone` på raden): lila i produktion, grönt skickad och
  godkänd, gult väntar och skickad offert, rött avbruten, nekad och utgången. Rubrikraden syns
  inte under 1000 px, där raden blir två rader. Tokenen `--color-production` kom till för lila.
- **Adminens panel är orörd**: sidomenyn står kvar, och listorna har varken rubrikrad eller ton.
  Det valde jag, eftersom beskedet gällde återförsäljaren och admin har dubbelt så många delar.
- **Översikten kom inte tillbaka**: Godis-panelen börjar på en översikt med nyckeltal, men
  ägaren tog bort återförsäljarens översikt 2026-11-19, så panelen börjar fortfarande på
  Offerter.
- Inte gjort som i Godis: ordersidan har kvar sin uppbyggnad (skyltarna, priset och detaljerna
  till vänster, leveransen, tidslinjen och korrekturet till höger), utan Godis rad med status,
  nästa steg, kund och belopp, och tidslinjen står kvar på höjden.
- Rättat på vägen: inställningarna stack ut 56 px på en 320 px bred telefon (`.companyLayout`
  under 1100 px hade `1fr` i stället för `minmax(0, 1fr)`).
- Provat lokalt 2026-11-23 i Chrome med ett provkonto fyllt med demodata (35 kontroller): sju
  sidor på 1440, 820, 390 och 320 px utan att något sticker ut, flikarnas antal och markering,
  rubrikraden och tonen, Ny offert, Logga ut, och att adminens panel är orörd. Bilder före och
  efter ligger i mappen `Namnskylt-panel-med-flikar-2026-11-23` på ägarens skrivbord. Inte
  provat i Safari eller på en riktig telefon.

## Panelens listor — läge 2026-11-20

- **Offerter, ordrar och kunder står som rader, inte kort** (besked via ägaren 2026-11-20:
  "radannonser" för bättre ordning, med skylten längst till vänster i mindre format på
  offerter och ordrar, och företagets namn längst till vänster på kunder). Stilen är
  `.listRows` och `.listRow` i `admin.module.css`: listan äger kolumnerna och varje rad lånar
  dem (`subgrid`), så att status, belopp och knappar står rakt under varandra. Under 1000 px
  blir raden två rader, med status, belopp och knappar under namnet.
  - Ordrar ritas av `OrderRow` (`src/features/admin/order-row.tsx`, förut `OrderCard`), på
    orderlistan, kundens sida och adminens översikt. Offertlistan och kundlistan ritar sina
    rader i sidan.
  - Beskedet sa "offerter o kunder syns aktuell skylt längst till vänster" och sedan "kunder -
    företagsnamnet längst till vänster". Jag läste det första som offerter och ordrar.
  - Första kolumnen är `auto`, inte ett fast mått: radens kantluft räknas in i kolumnen, och
    med 84 px fast åt den upp luften mellan skylten och texten.
- **Orderlistan har två filter, I produktion och Skickad** (besked via ägaren 2026-11-20:
  "räcker väl att ha I produktion, lila som nu, och Skickad, grön, ta bort resten"). Förut
  fanns Pågående, Mottagen, Korrektur skickad, I produktion, Skickad, Levererad och Alla.
  Reglerna ligger i `src/lib/orders/list-status.ts`.
  - **Inget filter är valt från början, och då visas alla ordrar.** Ett klick på det valda
    filtret tar bort det igen. Det valde jag, så att ingen order blir oåtkomlig utan "Alla".
  - **Märket på raden följer samma två lägen** (`ListStatusPill`, `listStatusOf` i
    `src/lib/supplier/sync.ts`): mottagen, korrektur, godkänd och i produktion visas som
    I produktion, och skickad och levererad som Skickad. Skickad är grön överallt, också på
    orderns sida. Orderns sida och tidslinjen har kvar alla steg.
  - **Två undantag har eget märke men inget filter**, och dem lade jag till själv: **Väntar**,
    när ordern inte har gått till tillverkningen än (annars stod en order som har fastnat som
    I produktion), och **Avbruten**. En order som väntar står under filtret I produktion.
    En demoorder visas som I produktion, fast den aldrig skickas.
  - Lokalt, utan kopplingen till verkstaden, står därför varje riktig order som Väntar.
- **Kontrollerat i drift 2026-11-20 efter pushen (`ebbcee1`), bara läsning**, som provkontot
  för återförsäljare och som admin: orderlistan har de två filtren och ingen papperskorg för
  återförsäljaren, listorna ritas som rader, Video och Offert finns i Ritning, kundvalet har
  Utkast och utkastet ritas utan kund, och kundens offertsida för demoofferten OF-1019 har
  PDF:ens rubrik och rader. Spara, Godkänn, Neka och Ta bort trycktes aldrig i drift.

## Besked — läge 2026-11-15

När någon annan än panelens ägare har gjort något sparas ett besked (`notices`, migrering 022)
som syns i panelen. Det återförsäljaren gör själv ger inget besked.

- **Det som ger besked** (`NOTICE_KINDS` i `src/lib/notices/model.ts`):
  - kunden godkänner en offert via sin länk (`acceptQuote`, inte när återförsäljaren godkänner
    åt kunden) eller tackar nej (`declineByCustomer`),
  - kunden godkänner sitt korrektur eller vill ändra (`answerProof` i `src/lib/orders/proof-answer.ts`),
  - en kund lägger en order själv i webbshoppen eller i en butik (`placeOrder`, källorna `web`
    och `shop`, inte demoordrar),
  - ett företag ansöker om konto (`saveApplication`), som går till namnskylt.com,
  - en kund gör en offert själv i skyltmotorn och laddar ner den (`saveCustomerQuote`, sedan
    2026-11-20).
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
- **Verkstaden har skickat** ger också ett besked (`order-shipped`, 2026-11-15), eftersom det
  är något som hänt utan att panelens ägare gjort det (`announceShipped`).
- **En återförsäljares besked går som mejl sedan 2026-11-21** (ägarens beslut, se Mejl från
  sajten): strömbrytaren är `NOTICE_RESEND_API_KEY` och `NOTICE_FROM_EMAIL`
  (`noticeEmailSettings`); `OUTREACH_DISABLED=true` stänger också av det. Mottagaren är
  adressen i återförsäljarens företagsuppgifter, annars kontots inloggningsadress. Länken
  byggs på `NOTICE_PUBLIC_URL` (standard `https://www.namnskylt.com`), aldrig på förfrågans
  värdnamn. Mejlet väntar kunden inte på, och `notices.emailed_at` sätts när Resend har tagit
  emot det.
  - **namnskylt.coms egna besked går bara via adminens strömbrytare** (`emailNotice` i
    `notify.ts`), aldrig via den här. Adressen under adminens Inställningar är inte adminens
    brevlåda: den tillhör företaget som stod där förut. Ändra inte det.
- Kända brister: lästa besked visas ingenstans (historiken står i orderns och offertens
  tidslinje) och tas aldrig bort.

### Adminens besked som mejl — läge 2026-11-20

Beskeden till namnskylt.coms egen panel mejlas till adminens adresser (besked av ägaren
2026-11-20: "När vi får en förfrågan för en registrering av ny återförsäljare så måste vi
godkänna eller neka i admin dashboard. Ett mejl kring detta och alla om orders osv." ska gå
till två adresser). Koden ligger i `adminNoticeEmailSettings` (`src/lib/notices/email.ts`)
och `emailAdminNotice` (`notify.ts`).

- **Egen strömbrytare**, skild från `RESEND_API_KEY` och `NOTICE_FROM_EMAIL`, som
  offertmejlets: `ADMIN_NOTICE_RESEND_API_KEY`, `ADMIN_NOTICE_FROM_EMAIL` och
  `ADMIN_NOTICE_TO` (adresser med komma emellan, högst fem). Alla tre krävs. Med dem satta
  mejlas bara besked till hyresgästen `namnskylt`. Återförsäljarnas besked, kundens
  orderbekräftelse, fraktbeskedet, lösenordslänken och utskicket är fortfarande avstängda.
  Nödstoppet `OUTREACH_DISABLED=true` stänger av även det här.
- **Mejlen går via Skylt & Gravyrtekniks Resend-konto**, samma konto som offertmejlet
  (ägarens val 2026-11-20: "Samma konto, slå på nu"). Nyckeln i
  `ADMIN_NOTICE_RESEND_API_KEY` har samma värde som offertmejlets, och avsändaren är
  `namnskylt.com <besked@skyltochgravyr.com>`. Adressen valde jag: domänen är den som är
  bekräftad i deras Resend.
- **Varje mottagare får sitt eget mejl**, med en egen nyckel hos Resend
  (`notice:<id>:<adress>`). Med samma nyckel hade det andra mejlet räknats som en upprepning
  av det första och aldrig skickats.
- **Det som mejlas** (ägarens val: "Ansökningar och alla ordrar"):
  - en ny ansökan från en återförsäljare,
  - varje ny order på plattformen. Två nya slag av besked bär det (`notifyOwner` i
    `place-order.ts`): `reseller-order` för en order hos en återförsäljare, som nämner
    återförsäljaren och inte dess kund och leder till Tillverkning, och `order-created` för
    en order som läggs i namnskylt.coms egen panel. En order som kunden själv lägger hos
    namnskylt.com hade redan sitt besked (`order-placed`). Demoordrar ger inget besked,
  - de besked namnskylt.com redan fick: svar på egna offerter och korrektur, och när
    verkstaden har skickat,
  - en offert som en kund har gjort själv och laddat ner (`quote-created`, ägarens "Ja tack!"
    senare samma dag, se Kundens egen offert).
- Beskeden om återförsäljarnas ordrar är lästa när Tillverkning har öppnats
  (`NoticesSeen` med `kind: "reseller-order"`).
- Driftsidan visar strömbrytaren "Adminens besked som mejl", med antalet adresser men aldrig
  adresserna.
- `ADMIN_NOTICE_RESEND_API_URL` är bara till för prov på datorn: en låtsasmottagare i
  stället för Resend, och bara på samma dator.
- Provat lokalt 2026-11-20 mot en låtsasmottagare: en ansökan och en återförsäljares order
  gav var sitt mejl till två adresser, och inga andra mejl gick iväg.
- **Påslaget och provat i drift 2026-11-20** (`dc27fc2`): driftsidan visar strömbrytaren som
  på, till två adresser, och sajtens övriga mejl som av. En påhittad ansökan skickades in
  genom formuläret, Resend tog emot mejlet (`notices.emailed_at` sattes), och ansökan togs
  bort i panelen efteråt. Att mejlen faktiskt kom fram i de två brevlådorna har bara
  mottagarna sett.
- Kända brister: går ett mejl inte iväg görs inget nytt försök, och det syns bara i
  serverns logg. Beskedet står ändå i panelen. Adminens två inloggade delar på samma panel,
  så ett besked som den ena har öppnat är läst också för den andra.

## Mejl från sajten — läge 2026-11-21

Sajten har, utöver offertmejlet, adminens besked och utskicket, fyra egna mejl. **De är
påslagna sedan 2026-11-21** (ägaren frågade "Kan vi inte sätta på dessa?" om de fyra
avstängda mejlen, och svarade på mitt förslag: "Ja, slå på dom två och bygg så att
orderbekräftelse och fraktbesked går ut för butiksordrar. Men i de fall där en slutkund lägger
en order via en återförsäljares sida eller om en återförsäljare skickar en offert osv. så ska
återförsäljarens design vara med deras färger, logo osv."). Det upphäver beskedet från
2026-11-17 om att sajten inte skulle skicka egna mejl, för just de här mejlen.

- **Egen strömbrytare:** `NOTICE_RESEND_API_KEY` och `NOTICE_FROM_EMAIL`
  (`noticeEmailSettings` i `src/lib/notices/email.ts`, `sendTransactional` i
  `src/lib/email/transactional.ts`). Båda krävs, och `OUTREACH_DISABLED=true` stänger av
  dem. **De är skilda från `RESEND_API_KEY`**, som bara gäller utskicket: förut delade mejlen
  den nyckeln, så att de inte gick att slå på utan att utskicket fick sin sändare.
  - Mejlen går via Skylt & Gravyrtekniks Resend-konto, som offertmejlet och adminens besked.
    Nyckeln har samma värde som offertmejlets, och avsändaren är
    `namnskylt.com <besked@skyltochgravyr.com>`. I butikens mejl byts namnet mot butikens,
    men adressen är densamma.
  - `NOTICE_RESEND_API_URL` är bara till för prov på datorn: en låtsasmottagare i stället för
    Resend, och bara på samma dator.
- **Besked** till en återförsäljare, se avsnittet Besked.
- **Glömt lösenord** för en återförsäljare, se avsnittet Inlogg.
- **Orderbekräftelse och fraktbesked går bara till en kund som själv har beställt i en
  återförsäljares butik** (`customerGetsSiteMail` i `src/lib/orders/model.ts`):
  - **En direktorder får aldrig mejl härifrån.** Hos namnskylt.com, och i en butik utan
    ägare, bekräftar och aviserar Skylt & Gravyrtekniks system ordern mot kunden, i vårt
    utseende. Med vårt mejl också hade kunden fått två.
  - I en återförsäljares butik går verkstadens mejl till återförsäljaren, som är beställare
    hos dem. Butikens kund fick förut inget mejl alls.
  - En order som återförsäljaren har lagt åt kunden, eller en godkänd offert, ger inget mejl
    till kunden. Återförsäljaren har kontakten där och får beskedet. Det valde jag: ägaren sa
    butiksordrar.
  - Regeln ger också mejl för en order betald med kort hos namnskylt.com, eftersom verkstaden
    då fakturerar oss och inte mejlar kunden. Kortbetalningen är avstängd.
- **Butikens mejl har butikens utseende**: dess logga, namn och färg på knappen, och ingenting
  om namnskylt.com eller verkstaden utom i länkarnas adress (`sellerBrand` med butikens
  profil, `shop.profile`). Svar går till butikens e-post, annars återförsäljarens.
  - Loggan hämtas från `/order/<kod>/logga.png` (ny väg 2026-11-21), som är öppen för den
    som har orderns kod, som ordersidan själv. Förut stod bara butikens namn som ordmärke.
  - **Orderbekräftelsen** (`sendOrderConfirmation`, `composeOrderConfirmation` i
    `src/lib/orders/`): skyltar, frakt, moms, summa, betalning, leveransadress och länken
    till kundens ordersida. `orders.confirmation_emailed_at` sätts när Resend har tagit emot
    mejlet.
  - **Fraktbeskedet** (`announceShipped`, `composeShippedEmail`): spårningslänken och länken
    till ordersidan. Går skyltarna till återförsäljaren får kunden inget mejl.
- **Offertmejlet från en återförsäljare hade redan återförsäljarens logga och färg**, liksom
  offertens PDF, offertsidan, ordersidan och följesedeln. Inget ändrades där.
- Provat lokalt 2026-11-21 mot en låtsasmottagare i stället för Resend, med en provbutik och
  ett provkonto med påhittade uppgifter (18 kontroller): lösenordsmejlet, en order i butiken
  med bekräftelse i butikens utseende och besked till återförsäljaren, fraktbeskedet med
  spårningslänk, och att en order hos namnskylt.com inte ger något mejl härifrån.
  **Inget riktigt mejl har skickats**, och ingen butik har en ägare i drift än.
- **Påslaget i drift 2026-11-21** (`2636c2f`): `NOTICE_RESEND_API_KEY` och `NOTICE_FROM_EMAIL`
  är satta på Railway, och `RESEND_API_KEY` är fortfarande tom. Kontrollerat samma dag
  (8 av 8): driftsidan visar "Mejl till återförsäljare och butikskunder" som på, utskicket
  som av, offertmejlet och adminens besked som på och kortbetalningen som av. Inloggningen för
  återförsäljare har länken Glömt lösenordet, och formuläret svarar likadant för en adress
  utan konto.
  - **Det finns tre återförsäljarkonton i drift** (räknat 2026-11-21, inte läst; det senaste
    skapades 2026-11-19). Jag skrev först att det inte fanns något, vilket var fel: jag gick
    på städningen 2026-11-16 utan att räkna. De tre får alltså besked och lösenordsmejl
    sedan strömbrytaren slogs på. Inget sådant mejl hade gått vid kontrollen samma kväll:
    dagens två besked var båda adminens. Ingen butik har en ägare.
- Exempel på de fyra mejlen ligger i exempelmappen på ägarens skrivbord (se Leverantören och
  systerprojektet), i mapp 3.
- Länkar byggs på `publicOrigin()` (`src/lib/http/public-url.ts`, `NOTICE_PUBLIC_URL`), aldrig
  på förfrågans värdnamn. Kundens namn och butikens namn rensas från radbrytningar innan de
  hamnar i ämnesrad och avsändare.

## Mejlmallen — läge 2026-11-18

Alla mejl från sajten ritas med samma mall (besked av ägaren 2026-11-18, som såg offertmejlet
som nakna textstycken: "gör en mycket snyggare mejlmall som följer vår brandbook för alla
olika utskick som går via Resend"). Mallen ligger i `src/lib/email/layout.ts`.

- **Skalet** (`emailDocument`) är det utskicket till återförsäljare redan hade: papper i
  botten, ett vitt kort på 600 px med rundade hörn, tabeller och inbäddad stil, dold
  förhandstext och ett mörkt läge. Det flyttades från `src/lib/outreach/email-layout.ts`.
  Utskickets mejl är orört i text och uppbyggnad. Det enda som ändrats där är de två
  gråtonerna (`MUTED`, `FAINT`), som nu är sajtens varma i stället för de kalla.
- **Byggstenarna** för sajtens egna mejl: `brandRow` (logga eller namn), `headRow` (liten
  rad i versaler, rubrik i serif och ingress), `textRow`, `quoteRow` (någons egna ord),
  `pictureRow`, `factsRow` (uppgifter i två kolumner med tunna linjer), `linesRow` (en
  adress), `actionsRow` (knappar), `noteRow`, `signatureRow` och `footerLines`. Ett nytt mejl
  byggs av dem, aldrig med egen HTML.
- **Fem mejl ritas med byggstenarna:** offertmejlet, orderbekräftelsen, fraktbeskedet,
  beskedet till panelens ägare och mejlet för nytt lösenord. Alla skickas sedan 2026-11-21,
  orderbekräftelsen och fraktbeskedet bara för butiksordrar (se Mejl från sajten).
- **Vem mejlet kommer ifrån** (`EmailBrand`, `sellerBrand` i `seller-brand.ts`):
  - namnskylt.com har sajtens logga (`siteBrand`) och bläcksvart knapp. Loggan är en PNG,
    `public/logo-namnskylt-mejl.png`, ritad ur SVG:n i tre gånger visningsmåtten, eftersom
    Gmail och Outlook inte visar SVG. Ändras sajtens logga ska den filen göras om.
    `public/logo-namnskylt.png` är en äldre logga och används inte.
  - En återförsäljare har sin egen logga, sitt namn som ordmärke när loggan saknas, och
    sin egen färg på knappen. Mallens form och typografi är sajtens, men mejlet nämner
    aldrig namnskylt.com eller verkstaden (utom i länkarnas adress). Att återförsäljarens
    mejl ser ut så är min tolkning av "vår brandbook": det är samma regel som på
    offertsidan.
  - Säljarens färg går rakt in i mejlets stil. Bara en hexkod släpps igenom, på ett
    ställe (`actionButton`), annars blir knappen bläcksvart.
- **Ett mejl från namnskylt.com säger att sajten är en del av Skylt & Gravyrteknik** (besked
  av ägaren 2026-11-20: mejlen ska ha "vår brandbook och vår logo fast ändå typ
  'namnskylt.com - en del av Skylt och Gravyrteknik AB'. Kanske även Skylt och Gravyrs logo
  längst ner"). Under kortet står raden "namnskylt.com – en del av Skylt & Gravyrteknik AB"
  (`PARENT_LINE`), och längst ner deras logga (`EmailBrand.parent`, som bara `siteBrand`
  sätter). Textversionen slutar med samma rad (`withParentLine`).
  - Det gäller alla mejl där namnskylt.com är avsändare: offertmejlet från admin, beskeden
    till admin, och de avstängda orderbekräftelsen, fraktbeskedet och lösenordsmejlet.
    **En återförsäljares mejl får varken raden eller loggan.** Ett mejl måste skicka med
    sitt märke till `emailDocument` (`brand`) för att få dem.
  - Loggan är `public/logo-skyltochgravyr-mejl.png`, en beskuren kopia av `logo-navy.png`
    ur verkstadens projekt i tre gånger visningsmåtten. Ändrar de sin logga ska filen göras
    om. Bilden har inga rundade hörn i ljust läge, eftersom loggans rutor går ända ut i
    hörnen.
- **Bilder i mejl ska ligga på en öppen adress**, som PNG eller JPEG. Data-URL:er, SVG och
  WebP visas inte av alla e-postklienter. Sajtens statiska filer släpps förbi sajtspärren,
  och offertens egna vägar är öppna för den som har länken.
- **Mörkt läge:** kortet blir mörkt, loggan får en ljus platta (`.plate`), den bläcksvarta
  knappen vänds (`.btn-ink`) och en säljares egen färg står kvar.
- `pnpm email:preview` skriver alla fem mejl med påhittade uppgifter till
  `tmp/mejl-forhandsvisning/` (öppna `index.html`). Inget skickas.
- Provat 2026-11-18 i Chrome och WebKit, på dator och mobil och i mörkt läge, både
  förhandsvisningarna och riktiga offertmejl ur en låtsasmottagare med bilderna hämtade
  från den lokala servern. **Inte provat i riktiga e-postklienter** (Gmail, Outlook, Apple
  Mail): Outlooks knappar ritas med VML som ingen har sett, och inget riktigt mejl med
  den nya mallen har skickats.

## Kassan, betalning och köpvillkor — läge 2026-11-15

Beslut av ägaren 2026-11-15, samma upplägg som hos Skylt & Gravyrteknik: **företag beställer
på faktura, privatpersoner betalar med kort.**

- **Företag:** kassan kräver företagsnamn och organisationsnummer (tio siffror,
  `orgNumberSchema` i `src/lib/company/org-number.ts`), både på namnskylt.com och i butikerna.
  Numret sparas på kunden (`customers.org_number`). Ordern läggs direkt, som förut.
- **Privatpersoner** kan bara beställa på namnskylt.com och bara när kortbetalningen är
  påslagen (`paymentsConfigured`: `STRIPE_SECRET_KEY` och `STRIPE_WEBHOOK_SECRET`). Då visar
  kassan valet Företag eller Privatperson. Utan nycklarna finns valet inte, och bara företag
  kan beställa. I en butik säljer återförsäljaren och fakturerar själv, så där finns ingen
  kortbetalning.
- **Ingen order finns förrän betalningen är klar.** `POST /api/orders` med
  `customerType: "private"` sparar en väntande kassa (`checkouts`, migrering 024) och svarar
  med adressen hos Stripe (`startCheckout`). Ordern läggs av `completeCheckout`, som anropas
  både av Stripes webhook (`POST /api/payments/webhook`, öppen förbi sajtspärren, kräver
  Stripes signatur) och av sidan kunden kommer tillbaka till (`/betalning/klar`).
  - Stripes eget svar avgör om sessionen är betald, aldrig adressen kunden kom på. Belopp,
    valuta och referens jämförs med kassan, och skiljer de läggs ingen order.
  - Raden låses, så webhooken och sidan ger samma order hur de än körs. Ordernumret läses i
    en egen fråga efter låset; i samma fråga syns inte en order som en annan körning just lade.
  - Ordern sparas med prismodellen från kassan och bär betalningen (`orders.payment`,
    `OrderPayment`). Panelen visar "Betald med kort", och fakturaunderlaget har kolumnen
    Betalning, så att en betald order inte faktureras en gång till.
  - Avbryter kunden kommer den till `/betalning/avbruten`, som länkar tillbaka till skylten.
    En kassa som aldrig betalas tas bort efter 7 dagar (jobbet `checkout-prune`).
- **Begränsningar med kort:** ingen expressfrakt (priset är inte känt när kunden betalar) och
  inga skyltar som tillverkas på förfrågan. En återbetalning görs i Stripe, inte i panelen.
- **Kontrollerat** mot en påhittad Stripe på datorn, i tester
  (`src/lib/payments/checkout.integration.test.ts`) och i webbläsaren. Aldrig provat mot
  Stripes riktiga system. Stripe anropas med `fetch` och formulärkodning; kontrollera mot
  Stripes dokumentation när nycklarna läggs in.
- **På namnskylt.com är Skylt & Gravyrteknik säljare** (följd av ägarens beslut 2026-11-17),
  och kassan säger "Betalas mot faktura från Skylt & Gravyrteknik". I en butik som en
  återförsäljare äger är återförsäljaren säljare, som förut.
  Kortbetalningen går inte ihop med upplägget: en kortbetald order faktureras namnskylt.com.
- **Kortbetalningen väntar, och ska gå via verkstadens Stripe när den tas upp** (besked av
  ägaren 2026-11-17: "Vänta lite med kortbetalning då"). Ägarens tanke är att använda Skylt &
  Gravyrtekniks Stripe-konto, så att verkstaden får betalningen direkt och namnskylt.com får sin
  del som på övriga direktordrar. Inget av det är byggt, och kassan är oförändrad: företag
  beställer på faktura utan konto. Beslutat inför den dagen:
  - **Kassan ska fungera som på verkstadens sajt:** gäster betalar med kort, och faktura finns
    bara för den som är inloggad på sitt kundkonto med företag och organisationsnummer.
  - **Verkstadens projekt ska inte röras.**
  - Det som då måste lösas (läst i deras kod 2026-11-17, utan att ändra något):
    - Deras webhook tar emot alla betalningar på kontot och slår upp ordern på
      `metadata.orderId` eller `client_reference_id`. Våra betalningar får alltså inte bära de
      fälten (`createSession` skickar i dag kassans id som referens), annars felar deras webhook.
    - En order vi skickar blir alltid en fakturaorder hos dem. En kortbetald order faktureras
      därför en gång till om inget görs. Utan ändring hos dem återstår en tydlig rad i ordern
      och att personalen stänger fakturan för hand, med risk för dubbel debitering.
    - Nyckeln och en egen webhook för namnskylt.com i deras Stripe-konto. Ägaren har inte
      sagt hur de ska ordnas.
- **Köpvillkor** finns på `/villkor` och, för butiker, `/butik/<slug>/villkor`
  (`TermsPage` i `src/features/terms/`). Sidorna är öppna förbi sajtspärren. Kassan kräver ett
  kryss i "Jag godkänner köpvillkoren" (`acceptedTerms`).
  - **Där verkstaden är säljare gäller Skylt & Gravyrtekniks egna köpvillkor, ordagrant**
    (på ägarens begäran 2026-11-17, `WorkshopTerms` i `workshop-terms.tsx`): på namnskylt.com
    och i en butik utan ägare. Texten, företagsnamnet, organisationsnumret och adressen är
    hämtade från skyltochgravyr.com/villkor 2026-11-17, och sidan länkar dit. Ändrar
    verkstaden sina villkor ska samma ändring göras här: ingenting hämtas automatiskt.
  - Under deras villkor står två egna stycken: "Om namnskylt.com" och "Personuppgifter".
    Sedan 2026-11-18 säger det första att namnskylt.com är Skylt & Gravyrtekniks sajt för
    namnskyltar och att det är dem kunden beställer av och vänder sig till, med deras e-post
    och telefon. Förut stod namnskylt.com där som ett eget företag som förmedlade
    beställningen, med företagsuppgifterna ur panelen.
  - Deras villkor säger "Leveranstid meddelas per order" och att produktionen börjar när
    betalningen har bekräftats. Sajten lovar på andra ställen leverans inom fem arbetsdagar,
    och företag betalar mot faktura i efterhand. Ägarens besked 2026-11-17: samma villkor
    gäller ändå, skillnaden spelar ingen roll.
  - I en återförsäljares butik gäller den äldre texten, med återförsäljaren som säljare ur
    dess företagsuppgifter. Den texten är inte granskad av en jurist.
- **Integritetssidan** (`/integritet`, `PrivacyPage` i `src/features/privacy/`) är Skylt &
  Gravyrtekniks integritetspolicy, ordagrant, med dem som personuppgiftsansvariga (ägarens
  besked 2026-11-17: "Kör Skylt och Gravyrs information här. De är ansvariga").
  - Texten är hämtad från skyltochgravyr.com/integritetspolicy 2026-11-17, och sidan länkar
    dit och till deras konto och cookiepolicy. Ingenting hämtas automatiskt: ändrar de sin
    policy ska samma ändring göras här. Verkstadens företagsuppgifter ligger i
    `src/lib/company/workshop.ts` (`WORKSHOP_COMPANY`) och delas med köpvillkoren.
  - Sist står ett eget stycke, "På namnskylt.com": att namnskylt.com är Skylt &
    Gravyrtekniks sajt för namnskyltar (inget eget företag, se nedan), vad som sparas här, att bara nödvändiga kakor
    används och att Google Analytics, Google Ads och Meta Pixel inte används här, att
    varukorgen sparas i webbläsaren, statistiken utan kakor, och sedan 2026-11-17 vad ett
    kundkonto sparar och att inloggningen bärs av en nödvändig kaka. Lägg till något där om
    sajten börjar använda annat, till exempel ett analysverktyg.
  - **Avsnittet om utskicket till återförsäljare är borttaget**, eftersom det hade
    platshållare för avsändare, rättslig grund och lagringstid. Utskickets mejl och
    landningssida länkar fortfarande hit. Det ska tillbaka, med besluten fattade, innan
    något mejl skickas (se Utskicket, Öppet innan Fas 1). Texten finns i git, i
    `src/features/privacy/privacy-page.tsx` före 2026-11-17.
  - Meningen om att kortbetalning sköts av Stripe är också borttagen. Den ska tillbaka om
    kortbetalningen slås på.

## namnskylt.com är Skylt & Gravyrtekniks sajt — läge 2026-11-18

**namnskylt.com visas aldrig som ett eget bolag mot kunden** (besked av ägaren 2026-11-18: "ska
ju inte namnskylt.com vara ett separat bolag, utan allt det här sköts ju av Skylt &
Gravyrteknik AB", "vår sida är ju deras sida. Det är de som står för allt och de man
kontaktar"). Deras uppgifter ligger i `WORKSHOP_COMPANY` (`src/lib/company/workshop.ts`).

- **Köpvillkoren och integritetspolicyn** (`/villkor`, `/integritet`) säger att namnskylt.com
  drivs av Skylt & Gravyrteknik. Ägarens företagsuppgifter ur panelen visas inte längre där,
  och sidorna läser dem inte. En butik utan ägare säger samma sak om verkstaden. I en
  återförsäljares butik är återförsäljaren säljare, som förut.
- **Sidfoten** säger "namnskylt.com drivs av Skylt & Gravyrteknik" och länkar till Om oss,
  Kontakta oss, Köpvillkor och Integritet.
- **Om oss** (`/om-oss`, `AboutPage` i `src/features/about/`): teambilden från deras egen
  sida (`public/team/`, kopierad ur deras projekt på ägarens begäran, i en liggande och en
  stående beskärning), deras beskrivning, korta fakta om företaget, de tre värdena och
  personalen med roll och presentation.
- **Kontakta oss** (`/kontakt`, `ContactPage`): telefon, e-post, adress, öppettider i Högsbo
  och de direkta vägarna för beställningar, ekonomi och vd, som de står på deras sida.
- **Texterna är deras egna**, hämtade från skyltochgravyr.com/om-oss och /kontakt 2026-11-18
  (`about-copy.ts`). Det som där gäller märkskyltar har jag skrivit om för namnskyltar:
  rubriken, ingressen och två av tre stycken. Resten står som hos dem. Ingenting hämtas
  automatiskt: ändrar de sin sida, sin personal eller sina nummer ska samma ändring göras här.
  - Inte med: deras formulär för förfrågan, kartan och raden om att hämta samma dag, som
    gäller märkskyltar. Här står i stället att man väljer Hämta i Högsbo i kassan.
- Sidorna ligger bakom sajtspärren, som startsidan, och finns i sitemapen när spärren är borta.
- **Säljaren som kunden möter hos namnskylt.com är Skylt & Gravyrteknik** (besked av ägaren
  2026-11-18, om offerten som admin gör: "det ska vara Skylt och Gravyrs uppgifter"). Regeln
  ligger på ett ställe: `getSellerProfile(tenant)` i `src/lib/orders/repository.ts`, som ger
  `workshopSeller` (`src/lib/company/seller.ts`) för namnskylt.com och återförsäljarens egna
  företagsuppgifter annars. **Allt som visar eller mejlar en säljare för kunden läser den**,
  aldrig `getCompanyProfile`: offertsidan, offertens PDF, offertmejlet, kundens ordersida och
  sajtens avstängda mejl (orderbekräftelse och fraktbesked). Korrekturet följer samma regel
  (`resolveSender`).
  - Hos namnskylt.com ser kunden **sajtens logga och färger** (`SellerProfile.site`,
    `SellerLogo` i `src/features/quote-public/`; i PDF:en läggs loggan in som data med
    `siteLogoDataUrl`) och i sidfoten "Skylt & Gravyrteknik i Sverige AB · Org.nr 556464-2261",
    deras adress, telefon och `order@skyltochgravyr.com` (`SellerProfile.legalName`,
    `companyFooter`). Att loggan och färgerna är namnskylt.coms och inte verkstadens valde jag:
    ägaren sa uppgifterna.
  - **Offertmejlet från admin** har avsändarnamnet "Skylt & Gravyrteknik", och **svar går till
    `order@skyltochgravyr.com`** (ägarens val 2026-11-18, på frågan om svarsadressen), alltså
    verkstadens orderbrevlåda, inte till ägarens adress i panelen. Verkstaden ser inte offerten
    i sitt eget system; den finns i panelen här.
  - **Ur panelens uppgifter följer bara offertens villkor med** (`quoteTerms`): de är adminens
    egen text om offerten och ingen företagsuppgift. Panelens logga, färger, namn och
    kontaktuppgifter visas aldrig för kunden. Inställningarna säger det för admin, och visar
    där ingen förhandsvisning av offerten (`CompanyForm` med `preview`).
  - `getCompanyProfile` läses fortfarande av panelen, utskicket, beskedens mejl, "Till oss"
    som leveransadress och anropet till verkstaden (`supplierBuyer`). Ändra inte dem till
    säljarregeln: verkstaden ska inte stå som sin egen beställare.
  - En återförsäljares offert, mejl, ordersida och korrektur är orörda och nämner aldrig
    verkstaden.
  - Provat lokalt 2026-11-18 i webbläsaren, på dator och mobil: offertsidan, PDF:en, mejlet
    (till en låtsasmottagare), ordersidan och korrekturet hos namnskylt.com, och samma sidor
    hos en återförsäljare. Inget riktigt mejl har skickats.
- **Sidhuvudets meny** (besked av ägaren 2026-11-18): Inspirationsbank, Om oss och Kontakta
  oss. "Så funkar det" är borta ur menyn; länken under skrivrutan på startsidan finns kvar,
  och butikernas egen meny är orörd. Under 900 px ligger länkarna bakom knappen Meny
  (`SiteMenu` i `src/components/site-menu.tsx`), eftersom de inte ryms bredvid loggan,
  inloggningen och varukorgen. Provat ner till 320 px, med och utan varukorgens symbol.
  - **På 360 px och smalare är loggan en aning mindre och luften snålare** (rättat
    2026-11-18 på ägarens ja): i skyltmotorn stack sidhuvudet ut 6 px på en 320 px bred
    skärm, så att varukorgens symbol klipptes i högerkanten. Det tidigare provet mätte den
    svävande menyn, som inte har någon varukorg. Butikernas eget sidhuvud (`ShopFrame`)
    är inte mätt på 320 px.
  - **Menyn står still mellan sidorna i den** (besked av ägaren 2026-11-18: "menyn och
    headern måste vara statisk oavsett om man är på förstasidan, om oss eller kontakta oss").
    Startsidans svävande meny gäller också Om oss, Kontakta oss och Inspirationsbank:
    sidans `main` bär `data-floating-header`, som ger samma form som startsidans `data-home`
    (`site-header.module.css`) och flyttar ner innehållet under menyn (`globals.css`).
    Inspirationsbank lade jag till själv, eftersom den ligger i samma meny.
  - Sidan man är på markeras bara med färg, aldrig med fetare stil: då ändras länkens bredd
    och menyn flyttar sig.
  - Skyltmotorn, villkoren, integritetssidan, inloggningen och kontot har kvar den raka
    menyn över hela bredden. Skyltmotorn och panelen räknar sin höjd på den.

## Typsnitt — läge 2026-11-20

Skyltmotorn har 186 typsnitt: verkstadens två, Arial och Arial Narrow, och 184 fria från Google
Fonts (besked från Mats på verkstaden via ägaren 2026-11-20: typsnitten behöver inte begränsas,
"så länge vi får färdiga filer", och ägarens "Kör så många du kan hitta som går att använda och
som är gratis").

- **Urvalet** står i `scripts/fonts-fetch.ts`, i sju grupper: Raka, Smala, Med seriffer,
  Rundade, Skrivstil, Rubrikstil och Skrivmaskin (`FONT_CATEGORIES`). `pnpm fonts:fetch`
  hämtar varje familj som färdiga TTF-filer i normal och, där den finns, fet stil (119 av 184
  har fet), kontrollerar att filen går att läsa och har å, ä, ö, æ, ø, é och ü, och skriver
  `src/engine/font-list.ts`. **Ändra inte listan för hand**: lägg familjen i skriptet och kör
  det. Vilka familjer som är med valde jag, efter läsbarhet och bredd i stil. Tre föll bort:
  Orbitron saknar Ø, och licensen för Tinos och M PLUS Rounded 1c gick inte att hämta.
  - Filerna ligger oförändrade i `public/fonts/google/` (16 MB), med varje familjs licens i
    `licenses/` och en förteckning i `LICENSES.txt`. Licenserna (SIL OFL 1.1, Apache 2.0 och
    Ubuntu Font Licence) tillåter att filerna sprids vidare när licensen följer med.
    **Filerna görs inte om till delmängder**: en ändrad fil får inte alltid bära typsnittets
    namn.
- **Ett typsnitt hämtas först när det används.** Webbläsaren hämtar bara verkstadens två från
  början (`CORE_FONT_FILES`). Ritas en rad i ett annat typsnitt begär motorn dess fil
  (`onMissing` i `createFontEngine`, `fetchMissing` i `load-browser.ts`), raden ritas i Arial
  så länge, och allt som använder `useFontEngine` ritas om när filen har kommit
  (`onBrowserFontsChanged`). Servern läser filen från disk i samma stund (`read` i
  `load-node.ts`). Ingen sida behöver veta vilka typsnitt den ritar.
- **Typsnitt vars regler för sammansatta tecken biblioteket inte kan läsa ritas glyf för glyf**
  (`plainRun`, `needsPlainRun` i `font-engine.ts`). opentype.js kastar annars ett fel för varje
  rad på mer än ett tecken i 32 av familjerna, bland dem Oswald, Inter och DM Sans. Bredder och
  parkerning är typsnittets egna. Ligaturer används inte, och det gör de inte för övriga
  typsnitt heller. Verkstadens två ritas av biblioteket självt, exakt som förut, och ett test
  vaktar det: en första version av kontrollen ritade av misstag alla typsnitt glyf för glyf.
- **Väljaren** (`FontPicker` i `sections/font-picker.tsx`) är en knapp med det valda
  typsnittet, som öppnar en rullista med sökruta ("scrollist som man har i typ Word"). Varje
  namn står i sitt eget typsnitt, och filen till en rad hämtas först när raden rullas fram.
  Listan står kvar öppen när ett typsnitt väljs, så att flera går att prova.
- **Fet stil:** ett typsnitt utan egen fet stil ritar en fet rad i normal stil (`hasBold`,
  `fontFileKey`), och knappen Fet går då inte att välja.
- **Till verkstaden:** verkstadens motor har bara sina egna typsnitt.
  - En **graverad** rad i ett annat typsnitt skickas som färdiga banor i ett bildlager som
    graveras (`engravedTextLayer` i `src/lib/supplier/map.ts`), på samma sätt som en graverad
    logga. Ramen är fortfarande deras ramlager.
  - En **printad** rad ligger i trycklagret som förut, vilket typsnitt den än har.
  - Texten och typsnittet står då i klartext på orderpappret ("Typsnitt", "Graverad text"
    eller "Tryckt text") och i kommentaren. **Personalen kan inte ändra en sådan text hos
    sig.** Jag frågade om det var okej och fick inget eget svar: jag läste Mats "färdiga
    filer" som ett ja.
  - Arial och Arial Narrow skickas som text, som förut.
  - Prövat 2026-11-20 mot verkstadens egna regler och orderpapper genom att köra deras kod
    (Pacifico och Oswald graverade i plast, Playfair Display printad på metall): alla
    godkänns. **Ingen sådan order har gått till verkstaden på riktigt.**
- Provat lokalt 2026-11-20 i Chrome, på dator och 390 px (20 kontroller): listan, sökningen,
  att bara synliga rader hämtar sin fil, Pacifico och Oswald på skylten i ritning och 3D, och
  Fet. Inte provat i Safari eller på en riktig telefon.
- Kända brister: en skylt som fotograferas eller sparas i samma ögonblick som typsnittet
  byts kan ritas i Arial, innan filen har kommit. Hämtningen från en hemsida väljer
  inget typsnitt längre (sedan 2026-11-20, se Sortimentet); servern räknar fortfarande ut ett
  förslag mellan Arial och Arial Narrow (`matchFont`), som ingen sida använder. Tunna skrivstilar är inte
  prövade i gravyr.

## Följesedeln — läge 2026-11-20

Varje order har en följesedel som verkstaden skriver ut och lägger i paketet (beslut av ägaren
2026-11-20, efter mötet med verkstaden: "Ja" till en följesedel utan priser som verkstaden når
via en länk, eftersom det inte kräver någon ändring hos dem).

- **Sidan** är en PDF på `/f/<kod>` (`src/app/f/[code]/route.ts`, `packingSlipHtml` i
  `src/lib/orders/packing-slip.ts`): säljarens logga, ordernummer, orderdatum, inköpsnummer
  och märkning, mottagaren, beställaren, skyltarna design för design med text och antal, och
  antalet skyltar i leveransen. **Inga priser.**
  - Säljaren följer samma regel som övriga sidor kunden möter (`getSellerProfile`): en
    återförsäljares följesedel bär dess logga och uppgifter och nämner aldrig namnskylt.com
    eller verkstaden. Hos namnskylt.com bär den sajtens logga och Skylt & Gravyrtekniks
    uppgifter. Ordernumret följer `customerOrderNumber`.
  - Den är en PDF och inte en webbsida, så att utskriften aldrig bär webbläsarens sidhuvud
    med adressen.
- **Koden** är tolv hextecken (`orders.packing_code`, migrering 036), kort nog att skriva av
  från ett papper. Den är behörigheten, som koden till kundens ordersida. Vägen är öppen förbi
  sajtspärren, märkt `noindex`, och har ett tak på 120 försök per klient och timme.
- **Verkstaden får länken på sitt orderpapper**, som två rader på varje skylt
  (`packing` i `buildSupplierRequest`, satt i `supplierRequestFor`):
  "Följesedel: www.namnskylt.com/f/<kod>" och "Packning: …". Packningen säger hur ordern ska
  packas (`packingInstruction`): neutralt för en återförsäljares order, och med namnskylt.coms
  följesedel och klistermärken för våra egna. **Raden Packning lade jag till själv**, eftersom
  Mats bad om att det skulle vara "snortydligt"; ägaren sa bara följesedeln.
- **I panelen** står länken under Detaljer på orderns sida ("Följesedel").
- Provat lokalt 2026-11-20: två följesedlar med påhittade uppgifter ritade och sedda, och
  länken ger en PDF för en riktig kod och 404 för en felaktig. **Ingen order med raderna har
  gått till verkstaden**, och ingen där har skrivit ut en följesedel.
- Kända brister och det som inte är gjort:
  - Länken på orderpappret är text, inte klickbar: personalen kopierar eller skriver av den.
    En klickbar länk kräver en ändring i deras orderpapper.
  - **Verkstadens egen fraktsedel skrivs inte ut för våra ordrar**, när ändringen där är
    utrullad (ägarens ja 2026-11-20, efter Mats önskemål). Hos dem öppnas och skrivs en
    fraktsedel med deras logga ut av sig själv när en order sätts till Skickad
    (`/admin/ordrar/[id]/fraktsedel`). För en order från namnskylt.com visar den sidan i
    stället raden Packning, en knapp till vår följesedel och fraktetiketten, utan utskrift.
    Länken läses ur raderna vi skickar och godtas bara på `namnskylt.com/f/<kod>`
    (`partnerPacking` i deras `lib/partner-orders.ts`). **Deployat till deras produktion
    2026-11-20 cirka 13:35** (ägarens "Få ut detta"), efter bug-hunt utan allvarliga fynd,
    och sajten svarade likadant före och efter. Sidan är inte sedd med en riktig order.
    Fraktetiketten öppnas där med ett klick, inte av sig själv som på deras egen fraktsedel.
    Deras egna ordrar är orörda, liksom Fortnox-följesedeln och fakturan.
  - Fraktsedeln och transportörens avisering anger fortfarande verkstaden som avsändare.
  - Följesedeln gäller hela ordern. Delleveranser finns inte.

## Mötet med verkstaden 2026-11-20: gjort och kvar

Ägaren och Pär hade möte med Mats på Skylt & Gravyrteknik. Det som är byggt står i sina
avsnitt: typsnitten, följesedeln, paketvalet i frakten (Prismodellen), klämmans vikning
(Sortimentet) och friskrivningen om färg.

- **Friskrivningen om färg** (ägarens "Ja, sätt den på lämplig plats"): raden "Färgen i
  trycket kan skilja sig något från skärmen. En exakt nyans kan vi inte lova." står vid
  textfärgen och vid en logga som printas (`PRINT_COLOR_NOTE` i `print-color-field.tsx`).
  Köpvillkoren har ett eget stycke, "Färger i tryck", både under verkstadens villkor och i
  återförsäljarnas butiker. Meningen om att en mindre skillnad i nyans inte räknas som ett fel
  skrev jag, och ingen jurist har läst den.
- **Kontrollerat i drift 2026-11-20 efter pushen (`1ca7dd0`), bara läsning:** migrering 036 är
  tillämpad och varje order har sin kod, en följesedel för en demoorder kommer som PDF och en
  felaktig kod ger 404, typsnittens filer och licenser nås, väljaren visar 186 typsnitt och
  hämtar Pacifico när det väljs, friskrivningen står vid textfärgen och stycket "Färger i
  tryck" i köpvillkoren. Ingen order lades. Paketvalet syns inte i drift, se Prismodellen.
- **En riktig order finns i drift och har gått till verkstaden** (räknat 2026-11-20, inte
  läst). Det stämmer med att Mats på mötet hade fått filer från en testskylt. Det som på
  andra ställen i den här filen står om att ingen riktig order har gått genom kopplingen
  gäller alltså inte längre.
- **Svar från Mats 2026-11-20**, via ägaren:
  - **Tryckfilen bör vara i CMYK**: "för att printern ska fatta färgerna rätt, kan vara så
    att den konverterar men för att vi ska vara på den säkra sidan". **Byggt 2026-11-20 på
    ägarens "Bygg", och ute i båda projekten samma dag** (ägarens "Ja till båda"): Namnskylt
    pushad (`8585b53`) och skyltmotor deployad cirka 14:00, efter bug-hunt utan allvarliga
    fynd. Verkstadens sajt svarade likadant före och efter.
    - **Vi skickar** `printColorSpace: "cmyk"` och `printCmyk` i dokumentet när skylten har
      ett trycklager: tryckfärgerna för varje färg i lagret, i hela procent (`hexCmyk` i
      `src/engine/color-code.ts`, `printCmykOf` i `supplier/map.ts`). Omräkningen är den
      enkla, omvändningen av `cmykHex`: #0057B8 blir 100/53/0/28, och svart text blir ren
      svart (bara K). Ingen profil används, så värdena är inte en färgmatchning.
    - **Kunden ser samma värden** vid textfärgen ("I tryckfilen: CMYK 100/53/0/28."), och
      raden Tryckfärg på orderpappret bär dem: "#0057B8 (CMYK 100/53/0/28), rad 2 …". Raden
      står nu också när kunden inte har valt en färg, med färgen skylten visades i.
    - **Hos verkstaden** ritar `vectorPrintColor` i `packages/production/src/print-pdf.ts`
      trycklagrets banor i DeviceCMYK när dokumentet begär det. **Det gäller bara dokument
      med fältet, alltså våra**: deras egna tryckta produkter ritas i RGB som förut. Det
      valde jag, efter ägarens besked att deras egen motor inte ska ändras.
    - **En logga i färg är fortfarande en RGB-bild** i tryckfilen. Att räkna om en bild
      kräver en färgprofil, och det är inte byggt.
    - **Kunden kan ange tryckfärgerna själv** (ägarens "Lös det" 2026-11-20, på frågan om
      CMYK-fält): under "Egen färg" vid textfärgen står fyra fält, C, M, Y och K
      (`CmykFields` i `print-color-field.tsx`). De visar alltid det tryckfilen får. Ändras
      ett fält sparas alla fyra som en kod, `CMYK 100/60/0/20`, i `printColor`
      (`printColorCode`, `withTextColor`), och **just de värdena går till tryckfilen**
      (`printCmykOf` slår upp dem på lagrets skärmfärg). Skärmen visar färgen ungefärligt.
      - Koden sparas, inte skärmfärgen, eftersom olika blandningar ger samma skärmfärg:
        50/50/50/95 ser svart ut och hade annars blivit 0/0/0/98.
      - **Det upphäver delar av beslutet från 2026-11-18**, då CMYK-fälten togs bort: en
        skylt med en CMYK-kod säljs nu som den är (`hasScreenPrintColors`), och koden står
        kvar när skylten öppnas. En kod som inte går att trycka efter, som PMS, säljs
        fortfarande inte och tas bort. Pantone finns fortfarande inte.
      - Radernas egna färgrutor är fortfarande skärmfärger. Det valde jag, för att panelen
        inte ska växa. En enfärgad logga som printas följer textfärgen och får samma värden.
      - Provat lokalt i Chrome på dator, 390 och 320 px (30 kontroller). Inte pushat.
    - Provat lokalt 2026-11-20: ett riktigt dokument från Namnskylt med blått namn och röd
      andra rad gick genom verkstadens tryckfil, som då bara bär "1 0.53 0 0.28 k" och
      "0 0.88 0.85 0.11 k". **Ingen sådan fil har tryckts**, och hur RIP:en läser en fil med
      CMYK-banor och RGB-bild vet ingen än. Ordningen de två sidorna rullas ut i spelar
      ingen roll: utan fältet ritas RGB, och ett fält deras kod inte känner hoppas över.
  - **Texter som banor är okej**, och valet mellan många typsnitt och att kunna ändra texten
    efter beställning är vårt. Det valet finns i praktiken inte: personalen kan ändå inte
    ändra rader på en order från oss i sitt admin, vilket typsnitt texten än har. Ett
    felstavat namn rättas genom att ordern makuleras och en ny skickas.
  - **Varubrev rymmer i stort sett hur många skyltar som helst.** Nackdelen är PostNord:
    utdelning varannan dag, och paket som kommer bort. **Skriv aldrig ut kartongens mått på
    sajten**: måtten Mats nämnde var en uppskattning.
    - **Varubrev för 75 kr är standard för varje order, och paket för 159 kr är ett val**
      (beslut av ägaren 2026-11-20: "75 kr är bra. Bygg detta som standard men även en
      lösning för 159 kr"). Kalkylen har gränsen 100 000 kr i varuvärde, som betyder alltid
      varubrev (`LETTER_ALWAYS_SEK`), och **migrering 037 skriver samma regel i den sparade
      prismodellen**: den skriver över det som stod i drift (75, 75 och 3 000 kr). Fältet
      för antal skyltar står tomt. Varubrevets rad i väljaren säger att PostNord delar ut
      varannan vardag, och paketets att det är snabbare och säkrare. Pushat 2026-11-20
      (`8585b53`) och kontrollerat i drift genom läsning: migreringen är tillämpad, och
      frakten svarar 75 kr med paket för 159 kr som val för 1, 10 och 200 skyltar.
    - Testerna för regelns gräns använder `TIERED_SHIPPING` i `src/engine/testing.ts`.
  - **Fraktsedeln** behöver troligen en avsändare, för returer. Mats kollar upp det.
- **Väntar fortfarande på Mats:** vad paketet ska kosta (i drift står det på 75 kr, som
  varubrevet), och vilket format klistermärkena ska ha.
- **Väntar på ägaren:** ja till att läsa och ändra hur verkstadens egen följesedel skrivs ut,
  bokningslänken för demo vid ansökan, när sajtlösenordet ska bort, och när den skarpa
  testordern ska läggas.
- **Tre småsaker ur mötet är byggda 2026-11-20** (ägarens "Ja, kör"), inte pushade än:
  - **Skälet under Märkningsmetod står i rött**, på en egen rad: "Lägg till en logotyp nedan
    för att välja." eller "Gravyr finns bara på plastskyltar." (`.markingWhy`). Förut stod
    det i grått som en del av beskrivningen, och Mats missade det.
  - **Återställ för loggans avlästa färger.** Första gången kunden ändrar en färg sparas de
    avlästa (`BadgeLogo.readColors`, `withLogoColors` i `logo-color.ts`). Rutan visar då
    "Avläst från början:" med färgerna som prickar och knappen Återställ. Är färgerna
    tillbaka på de avlästa finns inget sparat.
  - **En färg kunden själv har ändrat styr förslaget på skyltfärg.** Mats bytte en av
    loggans färger till grönt, tryckte Välj och fick en vit skylt med blå gravyr: förslaget
    räknade fortfarande på loggans övriga färger, och regeln om att loggan ska synas mot
    ytan valde bort det gröna. Återskapat i kod: med den blå bytt mot ljusgrönt fanns inget
    förslag alls, och med den gula bytt blev det "Vit / Blå". Nu är förslaget plastfärgen
    vars yta ligger närmast just den ändrade färgen (`pickedColorCombo` i
    `src/lib/brand/match.ts`), utan tak för avståndet, och raden heter "Närmast din färg i
    plast". **Regeln om att en tryckt logga ska synas mot ytan gäller inte ett sådant val**:
    kunden har pekat ut färgen. Det valde jag; regeln gäller fortfarande förslaget ur
    loggans egna färger. På metall, som bara har tre ytor, gäller loggans färger som förut.
  - Provat lokalt i Chrome på dator och 390 px (24 kontroller), med en påhittad logga i
    blått och gult.
- **Ramen kostar extra sedan senare samma dag** (ägarens beslut 2026-11-20, 10 kr, se Prismodellen).
  På mötet bestämdes först att den inte skulle kosta extra, fast den tar lika lång tid att
  gravera som hela skylten.

## Inköpsnummer — läge 2026-11-20

Beställaren kan ange sitt eget inköpsnummer, som följer ordern och står på fakturan (besked av
ägaren 2026-11-20: "en kund oavsett ÅF eller slutkund kommer vilja kunna lägga in eget
inköpsnummer"). Fältet är frivilligt, fri text på högst 40 tecken, och heter "Inköpsnummer".
Reglerna ligger i `src/lib/orders/customer-po.ts`, och numret sparas i `orders.customer_po` och
`quotes.customer_po` (migrering 035).

- **Var det fylls i:**
  - kundens kassa i varukorgen ("Ert inköpsnummer (valfritt)"), bara för företag,
  - säljarens leveranssteg när en order läggs i varukorgen: hos en återförsäljare är det
    återförsäljarens eget nummer, eftersom verkstaden fakturerar återförsäljaren, och hos
    namnskylt.com kundens,
  - offertvyn i skyltmotorn och "Villkor och hälsning" på offertens sida i panelen,
  - kundens svarsruta när en offert godkänns. Det kunden skriver där gäller före det säljaren
    skrev på offerten (`acceptQuote`).
- **Var det syns:** bland kundens rader på offerten, i PDF:en och på kundens offertsida
  (`quoteInfoRows`), under Detaljer på orderns sida i panelen, på kundens ordersida, och sist
  på varje rad i orderlistans CSV och fakturaunderlaget. Orderlistans sökning hittar numret.
- **Ett nummer per order.** Det är numret från den som lägger ordern. Godkänner en
  återförsäljares kund en offert och skriver sitt nummer, följer det numret med till
  verkstadens faktura till återförsäljaren, som en märkning. Två skilda nummer, kundens och
  återförsäljarens, går inte att ange. Det valde jag, för att hålla det till ett fält.
- **Verkstaden får numret i orderns märkning** (`supplierOrderName` i `request.ts`):
  "Projektets namn · Inköpsnr 4500 012345", högst 120 tecken, där projektets namn kortas och
  aldrig numret. Verkstadens mottagare har inget eget fält för beställarens inköpsnummer: deras
  "Ert ordernummer" (`customerPo`) är vårt ordernummer. Märkningen står på deras orderpapper
  och på fakturan som "Märkning: …" (läst i deras kod 2026-11-20, `fortnoxOrderRefs`, inget
  ändrat där). **Ska kundens nummer stå som "Ert ordernummer" på fakturan behöver deras
  mottagare ändras**, vilket kräver ägarens ja.
- "Beställ igen", "Ny personal" och en order från en mall ärver inte numret: varje inköp har
  sitt eget. De tre vägarna har inget fält för det.
- En order som redan har gått till verkstaden får inte ett nytt nummer dit: numret går inte
  att ändra på en order i panelen, bara på en offert.
- Provat lokalt 2026-11-20 utan kopplingen till verkstaden (12 kontroller): kundens kassa,
  kundens ordersida, panelen, sökningen, underlaget till verkstaden, offertvyn, PDF:en och
  kundens godkännande med ett ändrat nummer. Pushat 2026-11-20 (`dc27fc2`), och migrering
  035 är tillämpad i drift. Fälten är inte provade i drift, och ingen order med ett
  inköpsnummer har gått till verkstaden.

## Kundens ordersida — läge 2026-11-15

Varje order har en hemlig länk till kunden: `/order/<kod>` (`orders.customer_token`, 64
hex-tecken, migrering 028, `getOrderByCustomerToken`). Koden är behörigheten, som för en
offert, och sidan är öppen förbi sajtspärren. Sidan läses åt kunden, aldrig med inköpspriser.

- **Sidan visar** orderns status som en tidslinje (`customerTimeline` i
  `src/lib/orders/customer-view.ts`; korrekturens steg bara när ett korrektur skickades),
  spårningslänken när verkstaden har lämnat en, skyltarna, summan, betalningen och leveransen.
  En borttagen kunds länk ger 404.
- **Kunden hittar länken** i kvittot efter beställningen, på sidan efter kortbetalningen, på
  en godkänd offert och, när mejlen är på, i orderbekräftelsen och fraktbeskedet. Panelens
  ordersida har raden "Kundens ordersida", som återförsäljaren kan skicka vidare.
- **Beställ fler med samma design** (nyanställda är det återkommande köpet): kunden skriver
  namnen, ett per rad, och får en **offert som är klar att godkänna** (`createReorderQuote` i
  `src/lib/quotes/reorder.ts`, `quotes.reorder_of`). Kunden ser priset, bekräftar leveransen
  och godkänner som vilken offert som helst, och återförsäljaren får sitt besked då. Inget
  beställs förrän offerten är godkänd.
  - Mallen är orderns första skylt (`staffBadges`), som i panelens "Ny personal".
  - Priset är dagens listpris. En order från en butik följer butikens priser, och kundens
    rabatt i procent följer med (`reorderPricing`); à-priser och extrarader gör det inte.
  - En kortbetald order går inte att fakturera, så där länkar sidan till skyltmotorn med
    designen i stället (`reorderMode`).
  - Formuläret har en gräns per klient och per order.
- Kända brister: en order med flera designer kan bara beställas om med den första. Kunden kan
  inte öppna sitt korrektur från ordersidan; det har en egen länk.

## Uppslag på organisationsnummer — läge 2026-11-18

När någon skriver ett organisationsnummer fylls företagets namn och adress i av sig själva
(besked av ägaren 2026-11-18: "allt som vi kan hitta fyllas i automatiskt"). Koden ligger i
`src/lib/company/lookup-model.ts` (regler), `lookup.ts` (anropet) och `src/hooks/use-company-lookup.ts`.

- **Källan är EU:s momsregister VIES**, som svarar gratis och utan nyckel med namn och adress
  för ett momsregistrerat företag. Ägaren bad om tjänsten från BillboardBee-projektet: det var
  ABPI (`abpi.se`), som är **nedlagd** (svarar `api_sunset`). Det nyare BillboardBee-projektet
  skrapar i stället Allabolags webbsida, vilket inte är kopierat hit: det är skört och
  knappast tillåtet. Valet av VIES är mitt.
  - Registret ger namn, gata, postnummer och ort. Telefon, e-post och kontaktperson finns inte
    där. Bara momsregistrerade företag finns med, så myndigheter och många föreningar saknas.
  - Bolagsverkets eget öppna API ger mer och täcker alla, men kräver att ägaren ansöker om
    en nyckel. Det är inte gjort.
- **En enskild firmas nummer slås aldrig upp** (`lookupNumber`): det är ägarens personnummer,
  känns igen på att tredje siffran är 0 eller 1, och får inte lämna sajten.
- **Var det fyller i:** kundens kassa, säljarens "Ny kund" i varukorgen, Skapa konto och Mitt
  konto (`ProfileFields`) och ansökan om att bli återförsäljare. Organisationsnumret står
  därför först i de formulären, före företagsnamnet. Företagets namn blir också mottagare på
  leveransadressen.
- **Det kunden har skrivit själv skrivs aldrig över** (`filled`, `withCompanyAddress`): ett
  fält fylls i när det är tomt, eller bär det registret fyllde i förra gången. Byts numret
  ersätts alltså bara registrets egna uppgifter.
- Uppslaget görs på den som skriver (`lookup` anropas i fältets `onChange`), aldrig på ett
  nummer som redan står ifyllt, till exempel ur ett kundkonto.
- `GET /api/company/lookup?orgNumber=` svarar bara `found` sant eller falskt. Svaren sparas i
  processens minne (ett dygn för ett företag, en timme för ett nummer som saknas), och
  gränserna är 40 uppslag per klient och timme och 3 000 per dygn för hela sajten.
- Går uppslaget inte att göra (registret svarar inte, gränsen är nådd, sajten är låst) sägs
  ingenting och formuläret fungerar som förut. Bara ett riktigt svar får säga att numret inte
  finns. Med sajtspärren på fungerar uppslaget därför inte i ansökan för den som saknar sajtkoden.
- Integritetssidan säger att numret slås upp i VIES.
- Provat lokalt och i produktion 2026-11-18 med kända börsbolags nummer.
- Kända brister: panelens "Ny kund" under Ny order och Ny offert (`StartOrderForm`) och
  företagsuppgifterna under Inställningar har inget uppslag. Registrets adress är företagets
  säte, som inte alltid är dit skyltarna ska. Adresser skrivs om från versaler, så "F O
  Petersons gata" blir "F O Petersons Gata".

## Offertmejlet — läge 2026-11-17

**Sedan 2026-11-19 mejlas ingen offert när den skapas** (beslut av ägaren, på frågan om de två
vägarna till en offert: "Öppna nya offerten"). Varukorgens knapp heter Offert och öppnar
offertvyn, där offerten sparas som PDF som säljaren skickar själv (se Offert från
skyltmotorn). Offertmejlet finns kvar och skickas bara när säljaren själv väljer det på
offertsidan i panelen ("Mejla offerten", "Mejla igen"). Det som står nedan om att mejlet går
direkt från varukorgen, och om knappen "Skicka offert", gäller alltså inte längre.
`POST /api/admin/quotes` utan `send: false` mejlar fortfarande, men ingen sida anropar den så.

En offert mejlas till kunden när den skickas (beslut av ägaren 2026-11-17). Det är det enda
mejl sajten skickar. Koden ligger i `src/lib/quotes/quote-email.ts` (regler och text) och
`src/lib/quotes/send.ts` (`sendQuote`).

- **Mejlet går via Skylt & Gravyrtekniks Resend-konto**, med en egen nyckel som bara gäller
  offerter (ägarens val: "Via deras Resend-konto"). Strömbrytaren är `QUOTE_RESEND_API_KEY`
  och `QUOTE_FROM_EMAIL` (`quoteEmailSettings`). Den är skild från `RESEND_API_KEY`, så att
  offertmejlet inte slår på sajtens övriga mejl eller utskicket. Ingenting är ändrat i
  verkstadens projekt.
  - I driften är båda satta sedan 2026-11-17. Avsändaradressen är
    `offert@skyltochgravyr.com`; domänen är den enda som är bekräftad i deras Resend. Adressen
    valde jag, ägaren angav bara nyckeln: byt den med `QUOTE_FROM_EMAIL` om en annan ska gälla.
  - Driftsidan visar strömbrytaren "Offertmejl". Utan variablerna skickas inget, och säljaren
    skickar länken själv från panelen, som förut.
  - `QUOTE_RESEND_API_URL` är bara till för prov på datorn (en låtsasmottagare i stället för
    Resend) och gäller bara adresser på samma dator. En adress som inte duger stänger av mejlet,
    så att ett prov med felskriven adress aldrig blir ett riktigt mejl. Nyckeln går aldrig någon
    annanstans än till Resend.
- **Avsändarens namn är säljaren** (ägarens val: "Återförsäljarens namn"): återförsäljarens
  företagsnamn, och för namnskylt.coms egna offerter Skylt & Gravyrteknik (sedan 2026-11-18,
  `getSellerProfile`). Svar går till säljarens e-post i företagsuppgifterna, annars kontots;
  för namnskylt.coms offerter till `order@skyltochgravyr.com`. Själva adressen ligger på
  verkstadens domän, eftersom mejlet går via deras Resend. En återförsäljares mejl nämner
  aldrig verkstaden vid namn.
- **Mejlet går direkt när offerten skapas i varukorgen** (ägarens val: "Direkt"), med
  listpris. Knappen heter då "Skicka offert". Priset och villkoren går att ändra i panelen
  efteråt, och "Mejla igen" skickar ett nytt mejl. En demooffert mejlas aldrig.
  - Går mejlet inte iväg är offerten ändå skickad: kundens länk gäller, och panelen säger att
    offerten inte har mejlats och låter säljaren mejla igen eller skicka länken själv.
  - En offert som har gått ut mejlas inte: knapparna skulle leda till en offert som inte går
    att svara på. Giltigheten förlängs först.
  - `quotes.emailed_at` (migrering 031) är när offerten senast mejlades. Gränser i processens
    minne: 60 mejl per säljare och timme, 10 per mottagare och timme och 500 per dygn för hela
    sajten.
- **Mejlet ritas med mejlmallen** (2026-11-18, se avsnittet Mejlmallen): säljarens logga
  eller namn, offertens nummer och projekt som rubrik, en bild av offertens första skylt,
  antal och summor, de två knapparna och säljarens uppgifter under kortet.
  - **Bilden av skylten** hämtas från `/offert/<kod>/skylt.png` (`renderMailBadge` i
    `src/lib/quotes/mail-image.ts`): samma ritning som på offerten, på papper med skugga,
    1056 × 528 px. Raden under säger vad som står på skylten, material, färg och mått, och
    hur många skyltar till offerten har (`quotePictureCaption`).
  - **Säljarens logga** hämtas från `/offert/<kod>/logga.png` (`mailLogo` i
    `src/lib/email/seller-logo.ts`): loggan ur företagsuppgifterna gjord till PNG i lagom
    storlek, med mörk platta bakom en ljus logga, som på offerten. Vägen svarar 404 för
    namnskylt.coms egna offerter, som har sajtens logga, och för en säljare utan logga.
  - Båda vägarna är öppna för den som har offertens kod, som offertsidan själv, och visar
    inget som inte redan står där. De har en gräns på 600 hämtningar per klient och timme.
  - Kunden kan ha bilder avstängda: då står säljarens namn, rubriken, uppgifterna och
    knapparna kvar, och bilden ersätts av sin text.
- **Mejlet har knapparna Godkänn och Neka**, som går till `/offert/<kod>?svar=godkann` eller
  `?svar=neka`. Länken bestämmer ingenting: valet är förvalt på sidan, och ett klick där
  bekräftar (ägarens val: "Knapp plus ett bekräftande klick", `quoteAnswerOf`, `answer` i
  `QuoteDecision`). Mejlprogram öppnar länkar av sig själva, och ett godkännande blir en
  riktig order hos verkstaden. Saknar offerten leveransadress fyller kunden i den då.
- Länkarna byggs på `publicOrigin()`, aldrig på förfrågans värdnamn.
- Provat lokalt 2026-11-17 mot en låtsasmottagare i stället för Resend och en låtsasverkstad:
  säljaren skickar offert från varukorgen, kunden godkänner från mejlet, ordern går till
  verkstaden och syns hos säljaren och hos admin. **Inget riktigt mejl har skickats**, varken
  lokalt eller i drift: första offerten i drift är första provet mot Resend.
- Granskat av en oberoende agent 2026-11-17: bara en inloggad säljare kan skicka, bara om
  sin egen offert och bara till offertens kund, och ingenting bestäms av en länk. Fynden är
  rättade och står som regler ovan.
- **Avsändaren på namnskylt.coms egna offerter är Skylt & Gravyrteknik** sedan 2026-11-18:
  namnet, svarsadressen och raderna under mejlet är deras, inte panelens (se avsnittet
  namnskylt.com är Skylt & Gravyrtekniks sajt). Bara offertens villkor kommer ur
  Inställningar.
- Kända brister:
  - Mejlet går inte att förhandsgranska innan det skickas. Studsar och klagomål syns bara i
    verkstadens Resend, inte i panelen.
  - Nyckeln i driften har full åtkomst till deras Resend-konto; en nyckel som bara får skicka
    räcker och är säkrare.
  - Svarar Resend inte i tid räknas mejlet som inte skickat, fast det kan ha gått. Mejlar
    säljaren då igen kan kunden få offerten två gånger.
  - En ny kund med en e-post som redan finns hos säljaren skriver över den kundens namn och
    företag, som när kunden läggs upp i panelen.

## Kundkonton — läge 2026-11-17

En slutkund kan ha ett konto med e-post och lösenord, för att slippa fylla i sina uppgifter
igen och för att se sina ordrar (beslut av ägaren 2026-11-17, som valde "E-post och lösenord"
och "Också i återförsäljarnas butiker"). Det är ett tredje inlogg, skilt från admin och
återförsäljare. Koden ligger i `src/lib/customer-auth/` och `src/features/customer-account/`.

- **Ett konto hör till ett ställe:** namnskylt.com (`customer_accounts.shop_slug` tomt) eller
  en butik. Samma e-post får ha ett konto på varje ställe, och ett konto i en butik gäller
  aldrig i en annan eller på namnskylt.com. Kakan heter `ns_kund` eller `ns_kund_<butik>`,
  eftersom butikerna ligger på samma adress som namnskylt.com. Tabellerna kom med migrering 030.
- **Sajten skickar inga mejl, så e-postadressen bekräftas aldrig.** Följden är regeln som
  bär hela upplägget: **kontot visar bara ordrar som lades inloggad** (`orders.account_id`),
  aldrig äldre ordrar med samma e-post. Annars kunde vem som helst skapa ett konto med någon
  annans adress och läsa dess ordrar. Av samma skäl har kontot sina egna uppgifter
  (`customer_accounts.profile`) och läser aldrig kundens rad i `customers`.
  - En order hamnar på kontot på tre sätt: kunden var inloggad i kassan, kontot skapades med
    ordern, eller kunden bad om fler skyltar från en order på kontot och godkände offerten
    (`reorderAccountId` i `src/lib/quotes/repository.ts`; det sista är min tolkning).
  - En order byter aldrig konto (`attachOrderToAccount` flyttar bara en order utan konto).
- **På inloggningssidan går uppgifterna att fylla i direkt** när kontot skapas (besked av
  ägaren 2026-11-17): företag, organisationsnummer, namn och leveransadress, allt valfritt
  (`ProfileFields`, `profileFromDraft`). Kassan är då ifylld redan vid första ordern. En
  påbörjad adress ska vara hel, och ett ifyllt organisationsnummer rätt.
- **Kontot skapas i kassan eller på inloggningssidan.** I kassan är det ett kryss, "Skapa
  konto, så är uppgifterna ifyllda nästa gång och du ser dina ordrar", och ett lösenord på
  minst 8 tecken (`NewAccountField` i `sections/checkout-account.tsx`). Kontot skapas efter
  att ordern är lagd (`POST /api/orders`), så ett fel med kontot aldrig stoppar en order. Har
  e-postadressen redan ett konto säger kassan det före ordern, så att kunden kan logga in.
  Krysset finns inte för en privatperson som betalar med kort.
  - Frågan om e-postadressen redan har ett konto ställs sist, när ordern annars skulle läggas,
    och har en gräns på 10 per klient och timme. Annars gick det att fråga sig fram till vilka
    som har konto utan att beställa.
- **Inloggningen** är `POST /api/customer/session` (e-post, lösenord och butik), utloggningen
  `DELETE` på samma väg och kontot från inloggningssidan `POST /api/customer/account`.
  Inloggningar är rader i `customer_sessions`, där bara kakans SHA-256 ligger, och gäller i
  180 dagar. Gränser i processens minne: 20 försök per klient och 10 per konto och timme.
  - **Bara sajtens egna anrop får logga in eller skapa konto** (`isSameSiteJson` i
    `src/lib/http/same-site.ts`): anropet ska bära `application/json` och får inte komma från
    en annan sajt. Annars kunde en främmande sida logga in besökaren på någon annans konto, så
    att besökarens nästa order och uppgifter hamnade där. Ta inte bort kontrollen.
  - Sidhuvudets "Logga in" går till kundens inloggning `/konto/logga-in` (förut till
    återförsäljarnas), som länkar vidare till "Logga in som återförsäljare". Inloggad kund ser
    "Mitt konto". Butikens sidhuvud har samma länk till butikens konto.
  - **Högst upp i varukorgen** står "Har du beställt förut? Logga in, så är dina uppgifter
    ifyllda." med ett formulär som fälls ut, och på namnskylt.com länken "Logga in som
    återförsäljare" (besked av ägaren 2026-11-17, `CartAccount` i `cart-account.tsx`).
    Inloggningen fyller i kassan direkt, utan att sidan laddas om. Formuläret är delat med
    inloggningssidan (`CustomerLoginForm` i `src/components/`).
- **Kassan fylls i ur kontot** (`contactFor`): företag, organisationsnummer, namn, e-post och
  leveransadressen från senaste ordern. Villkoren kryssas alltid i på nytt. Efter varje order
  får kontot det kunden just fyllde i (`profileAfterOrder`).
  - Den som loggar ut i varukorgen tar sina uppgifter med sig: kassan börjar om tom, så att
    nästa person vid samma dator inte möts av dem.
  - Gäller inloggningen inte längre när ordern skickas (utloggad i en annan flik) läggs ingen
    order: kassan säger till, visar inloggningen igen och behåller det ifyllda
    (`expectsAccount` i anropet, `signedOut` i svaret). Så hamnar en order aldrig utanför
    kontot utan att kunden märker det.
- **Mitt konto** (`/konto` och `/butik/<slug>/konto`, `AccountPage`): ordrarna nyast först med
  status, antal och summa, knapparna Kopiera order, Visa order (kundens ordersida) och Följ
  försändelsen, och formulär för uppgifterna, lösenordet och "Ta bort mitt konto". Ordrarna
  läses åt kunden, aldrig med inköpspriser (`listAccountOrders`).
- **Kopiera order** (hette "Beställ igen" till 2026-11-18) öppnar skyltmotorn med orderns
  skyltar i varukorgen (`/skapa?igen=<ordernummer>`, `customerDesignerContext`), precis som
  återförsäljarens "Ändra först". Bara en order som hör till det inloggade kontot öppnas. Den
  nya ordern pekar tillbaka på den gamla (`repeatOf`) och får dagens pris. När ordern är lagd
  tas `igen` ur adressen, så att en omladdning inte öppnar samma order i varukorgen en gång till.
  - **Den gamla ordern ändras aldrig, och varje klick ger en ny kopia** (besked av ägaren
    2026-11-18: "ändra till kopiera order, så skapas en ny där man kan redigera utefter
    föregående order"). Ägaren klickade två gånger på samma order och fick andra gången sina
    ändringar från första gången, eftersom det sparade arbetet lästes tillbaka. Det såg ut
    som om den gamla ordern hade ändrats.
  - Länken (`CopyOrderLink` i `src/components/`) lägger ett märke i adressen vid varje klick
    (`ny=<märke>`, `freshCopyHref`, `copyMarkOf`). Märket ingår i öppningen
    (`openedWithCopy`), så en ny kopia läser aldrig tillbaka en tidigare kopias ändringar,
    medan en omladdning av samma sida behåller dem. Samma länk används för panelens
    "Ändra först".
  - Skyltmotorn säger "Kopia av NS-…. Du skapar en ny order, och den gamla ändras inte."
    tills ordern är lagd.
- **Glömt lösenord** löses i panelen: under Kunder finns listan "Kundkonton" med knappen
  Lösenordslänk (`CustomerAccounts`, `customerPasswordLinkAction`). Länken gäller i tre dagar
  och en gång, visas en gång och skickas för hand. Sidan `/konto/losenord/<kod>` är öppen förbi
  sajtspärren. Ett nytt lösenord, från länken eller från Mitt konto, avslutar kontots övriga
  inloggningar och gör väntande länkar ogiltiga.
  - namnskylt.com sköter sina egna kunders konton och dem i butiker utan ägare. En
    återförsäljare sköter kontona i sina butiker och ser inga andra (`managedCustomerAccount`).
- **Radering:** kunden tar själv bort sitt konto. Tas en kund bort i panelen följer kontot med
  samma e-post med (se Radering), och en butik som tas bort tar sina konton med sig. Ordrarna
  står alltid kvar hos säljaren, utan koppling till kontot. Inloggningar som gått ut rensas av
  jobbet `customer-session-prune`.
- Provat lokalt i webbläsaren 2026-11-17, på dator och mobil och mot produktionsbygget:
  konto i kassan, Mitt konto, Beställ igen, inloggning i varukorgen, lösenordslänken, en
  butik utan ägare och en återförsäljares butik. Inte provat i drift, och inte i Safari.
- **Ett demokonto för slutkund finns i drift** sedan 2026-11-18, skapat på ägarens begäran
  för att kunna titta på Mitt konto: `demokund@namnskylt.com` på namnskylt.com. Lösenordet
  fick ägaren i chatten och står ingenstans i repot. Kontot har två demoordrar (NS-1095,
  skickad, och NS-1096, mottagen), lagda på ägarens begäran med ett skript i driftens
  container (`placeOrder` med `demo: true`). De skickas aldrig till verkstaden, syns inte i
  Tillverkning eller Provision och tas bort med "Ta bort demodata" i panelen. En order som
  läggs inloggad i kassan i drift är däremot en riktig order till verkstaden.
- Granskat av en oberoende agent 2026-11-17. Den hittade ingen väg till någon annans konto
  eller ordrar. Sju fynd är rättade (de står som regler ovan), ett står under Kända brister.
- Kända brister:
  - En order från en godkänd offert, eller som återförsäljaren lägger åt kunden i panelen,
    visas inte på kundens konto. Äldre ordrar utan konto går inte att lägga till i efterhand.
  - Med sajtspärren på hamnar den som valt nytt lösenord på `/konto`, som kräver sajtkoden.
  - Lösenordslänken byggs på panelens adress. En butik med egen domän får alltså en länk till
    butiken på namnskylt.com, och kunden loggar sedan in på den egna domänen med lösenordet.
  - Öppnas `/skapa?igen=…` av någon som inte är inloggad längre öppnas en tom skyltmotor.
  - En privatperson som betalar med kort kan inte skapa konto i kassan. Den som redan är
    inloggad får däremot den betalda ordern på kontot.
  - Gränserna för inloggningsförsök nollas vid omstart, som sajtens övriga gränser.
  - Den som känner en kunds e-postadress kan låsa kundens inloggning en timme i taget med tio
    fel lösenord. Det är priset för taket mot att gissa lösenord. Kassan fungerar ändå utan
    inloggning, och en lösenordslänk från panelen loggar in kunden.
  - Återförsäljarnas och adminens inloggning (`/api/reseller/session`, `/api/admin/session`)
    har inte kontrollen `isSameSiteJson`. Den som luras logga in där hamnar i fel panel, vilket
    syns direkt, men det är samma slags lucka och inte åtgärdat.

## Radering — läge 2026-11-15

Kunder, ansökningar och konton går att ta bort, så att en begäran om radering går att uppfylla
och testdata går att städa bort. Reglerna ligger i `src/lib/orders/erase-model.ts`.

- **En order hör till bokföringen och behålls** när den inte är demo eller avbruten och har
  gått till verkstaden, är i produktion, skickad eller levererad, eller är betald med kort
  (`isBookkeepingOrder`). Andra ordrar får tas bort. "Ta bort order" i panelen nekar en
  bokföringsorder.
- **En återförsäljare kan inte ta bort en order, men väl en offert** (besked via ägaren
  2026-11-20: "under order kan man deleta en order, det ska man inte kunna göra, däremot ska
  man kunna göra det under offerter").
  - **Ordrar:** papperskorgen på orderkortet och knappen Ta bort på orderns sida visas bara
    för admin (`canDelete` i `OrderCard`), och `deleteOrderAction` nekar en återförsäljare.
    **Att admin har kvar knappen valde jag**: beskedet kom från en återförsäljares panel, och
    admin har städat testordrar den vägen. Regeln om bokföringsordrar gäller admin som förut.
    En återförsäljares order som aldrig gick till verkstaden går alltså inte att ta bort i
    panelen längre, annat än genom att kunden tas bort.
  - **Offerter:** kortet i offertlistan har en papperskorg och offertens sida knappen Ta bort
    (`DeleteQuoteButton`, `deleteQuoteAction`, `deleteQuote`), för både admin och
    återförsäljare. Offerten tas bort för gott med sin historik och sina besked, och kundens
    länk slutar gälla. **En offert som har blivit en order går inte att ta bort**: den är
    orderns underlag, och knappen visas inte för den. Den regeln lade jag till själv.
    Makulera finns kvar och låter offerten stå kvar i listan.
- **Ta bort kund** (`/admin/kunder/<id>`, återförsäljaren för sina egna kunder, `eraseCustomer`
  i `src/lib/orders/erase.ts`): kundens offerter, mallar och övriga ordrar raderas. Finns
  bokföringsordrar kvar avidentifieras kunden i stället: namnet blir "Borttagen kund",
  e-posten `borttagen-<id>@borttagen.invalid`, telefon och adress töms och `erased_at` sätts;
  företag och organisationsnummer står kvar. I de ordrarna töms stillbilden, tidslinjens
  noter och korrekturets kommentar, skyltarnas text blir "Borttaget", och kontaktperson och
  telefon tas ur leveransen. Dialogen säger i förväg vad som tas bort och vad som behålls.
- En borttagen kund syns inte i kundlistan eller i väljarna för ny order och offert, och kan
  inte få nya ordrar (`isErasedCustomer`, känns igen på e-postadressen).
- **Kundens eget konto tas bort med kunden** (2026-11-17): kontot med samma e-post hos samma
  säljare, alltså på namnskylt.com och i butiker utan ägare för namnskylt.coms kunder, och i
  återförsäljarens butiker för dess kunder. Också ett konto med en annan e-post tas bort när
  kundens ordrar ligger på det, eftersom den som är inloggad kan beställa med en annan adress
  än kontots. Ordrar som behålls för bokföringen visas inte längre på något konto.
- **Ta bort ansökan** och **Ta bort konto** finns under `/admin/aterforsaljare`, bara för
  admin (`src/lib/reseller-auth/erase.ts`). Ett konto tar med sig sina kunder (enligt regeln
  ovan), offerter, besked, inställningar, butiker och ansökningar. Bokföringsordrar står kvar
  under kontots id, och `freeTenantId` ger aldrig ett nytt konto samma id.
- Kända brister: `orders.project` och extraradernas etiketter är återförsäljarens fritext och
  töms inte. `pnpm reseller:create` kontrollerar inte om id:t har kvarvarande ordrar. När en
  övertagen butik raderas tappar utskickets lead sin `shop_slug`; hur `/for/[token]` beter sig
  då är inte kontrollerat.

## Drift — läge 2026-11-15

- **Fellogg utan extern tjänst:** `src/instrumentation.ts` sparar serverfel i `error_log`
  (`onRequestError`, `logServerError`). Rutten sparas som mönster (`/offert/[token]`), aldrig
  den verkliga sökvägen, och e-postadresser tas bort ur meddelandet. Loggen rensas efter 30
  dagar och håller högst 2 000 rader.
- **Bakgrundsjobb i processen** (`startScheduler`, `JOBS` i `src/lib/maintenance/jobs.ts`):
  varje jobb körs under ett eget advisory lock och avbryts efter fem minuter. Ett nytt jobb
  är en rad i `JOBS`. Senaste körning sparas i `settings` under `maintenance_jobs`. Schemat
  körs även i `next dev`, mot utvecklingsdatabasen.
  - `dispatch-retry` (var 10:e minut), `error-log-prune`, `checkout-prune`,
    `designer-events-prune`, `customer-session-prune` och `logo-cleanup` (en gång per dygn).
- **Omförsök av utskick till verkstaden** (`retryFailedDispatches` i
  `src/lib/supplier/retry.ts`, migrering 027): gör ingenting med kopplingen av. Annars provas
  ordrar som **redan har ett misslyckat försök** igen efter 10 min, 30 min, 2 h, 6 h och 24 h,
  högst 6 försök. Ett nej från verkstaden (4xx utom 408 och 429, eller en för stor order) är
  slutgiltigt och provas inte om. Ordrar som bara väntar skickas aldrig av sig själva; det
  manuella utskicket från Tillverkning är oförändrat.
- **Driftsidan** `/admin/drift` (bara admin): strömbrytarna (verkstaden, offertmejl, adminens
  besked, utskicket, mejl till återförsäljare och butikskunder, kortbetalning) som av eller på
  utan värden, jobbens senaste körning, misslyckade
  utskick och de senaste felen.
- **CI:** `.github/workflows/ci.yml` kör kvalitetsgrinden mot en tom Postgres på push och pull
  request. Den körs på GitHub vid varje push, och de fem senaste körningarna var gröna 2026-11-18.
- **Statistik över skyltmotorn** (`src/lib/designer-stats/`, migrering 028, tabellen
  `designer_events`): varje besök räknas till det steg det kom längst till: öppnad, text
  skriven, val gjort, kassan öppnad, order skickad och order mottagen, med varukorgen som
  sidospår. `/admin/statistik` har delen "Skyltmotorn" för 30 dagar, med steget där flest
  lämnar utpekat. Admin ser webben och butikerna, en återförsäljare bara sina butiker.
  - **Inget sparas hos besökaren:** besökets id är slumpat och finns bara i sidans minne, och
    varken IP-adress, namn eller text sparas. Därför behövs ingen samtyckesruta.
  - `POST /api/designer-events` svarar alltid 204 och har en gräns per klient. En
    återförsäljare som lägger order åt en kund räknas inte. En kortbetalning räknas som
    mottagen order när den är betald (`visit` följer med kassan).
  - Under 10 besök visas antal utan andelar. Rader äldre än ett halvår rensas
    (`designer-events-prune`).
- **Sökmotorer:** med sajtspärren på säger `robots.txt` nej till allt och sitemapen är tom.
  Utan spärr gäller de vanliga reglerna, och `/sitemap.xml` listar de publika sidorna
  (`robotsFor`, `sitemapFor` i `src/lib/seo/crawl.ts`). Kundens ordersida, offerter och
  betalsidorna märks alltid `noindex`.
- **Säkerhetskopior är inte kontrollerade.** Railway-projektet ligger på Pro, där volymen kan
  säkerhetskopieras på schema, men om ett schema finns syns inte i CLI:t. Kontrolleras under
  Postgres-tjänstens flik Backups.

## AI i produkten

Alla anrop går via `openai()` i `src/lib/ai/openai.ts`. Den returnerar `null` utan
`OPENAI_API_KEY`, och då stängs funktionen av.

- **Modeller:** `gpt-image-2` för bilder (`editImage`), `gpt-5.4-mini` (`VISION_MODEL`) för text och syn.
- **Användning:**
  - `guessWearer` gissar personens kön och ålder ur namnet.
  - `describeCompany` och `readBrand` beskriver ett företag ur dess hemsida.
  - `checkPhoto` avgör om ett uppladdat foto går att använda.
  - `editShopContentWithAi` är butiksredigerarens chatt.
  - `drawShapeImage` ritar en egen form ur kundens beskrivning (`gpt-image-2`, låg kvalitet,
    ungefär 7 öre per försök enligt andrahandsuppgifter), se Egen form.
  - Persona-bilden i utskicket görs av `companyWorkplace` och `generatePersona` i `src/lib/outreach/persona.ts`.
- **Personbilden beskrivs i skyltens färger** (besked via ägaren 2026-11-18, som fick en
  svartvit skylt på personen fast den var i färg): referensbilden var rätt, men uppdraget till
  bildmodellen sa alltid "graverad enfärgad logga" och gravyrens textfärg. `badgeDescription`
  i `src/lib/ai/prompts.ts` följer nu märkningsmetoden: ett namn som printas beskrivs som
  tryckt i sin färg, också per rad, en logga i färg som tryckt i sina egna färger, och en
  skylt utan text får ingen text. Provat med en (1) riktig bild 2026-11-18. Utskickets
  persona-bilder har sitt eget uppdrag och är inte ändrade.
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

**Skylten i utskicket** är sedan 2026-11-13 en metallskylt: mejlbilden är mässing på
rektangeln 60 × 30 mm (`HERO_CHOICE`), och landningssidans fyra rutor visar fyra av metallens
fem format och alla tre ytor (`tileChoices`). Bildtexten läser skyltens mått ur den sparade bilden. De 13 förberedda
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
  - Integritetssidan saknar sedan 2026-11-17 avsnittet om utskicket (vilka uppgifter som
    används, varför, hur länge och hur man avregistrerar sig). Mejlet och landningssidan
    länkar dit, så avsnittet ska tillbaka innan något skickas. Se Kassan, betalning och
    köpvillkor.
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

**Mottagaren är byggd där, deployad till AWS och öppen sedan 2026-11-17 16:35 (efter ägarens
uttryckliga ja).** Hemligheterna är satta och inlästa, och kopplingen i Namnskylts drift är på.
Stängs den igen (tom `PartnerApiKey` och en deploy där) svarar `/api/partner/orders` 503
"Mottagaren är inte aktiverad". Ingenting i deras
egna vyer är ändrat: metallämnet ligger utanför deras materiallista och slås bara upp på kod. Lästes
2026-11-14: deras `Order` har redan `customerPo`, `orderName`, `shippingMethod`,
`shippingCost`, `shippingAddress`, `minOrderAdjustment`, betalsättet `invoice` med
Fortnox-följesedel vid Skickad, och `Company.collectiveInvoice` för samfakturering.

- **Vägarna:** `POST /api/partner/orders` tar emot `SupplierOrderRequest`, och
  `GET /api/partner/orders/<deras ordernummer>` svarar med `SupplierOrderState`. Nyckeln i
  `Authorization: Bearer` är enda behörigheten (`PARTNER_API_KEY` hos dem, samma värde som vår
  `SUPPLIER_API_KEY`). Utan nyckel i deras miljö svarar mottagaren 503.
- **Ordern blir en vanlig fakturaorder i Mottagen**, som personalen granskar och flyttar till
  Tillverkning. Vårt ordernummer står som IO-nummer (`customerPo`), slutkunden i orderns
  anteckning, och priser, påslag och frakt tas ur anropet.
  - Beställaren hittas på organisationsnumret bland deras företag (`findOrCreateCompany`), så
    en återförsäljare som redan är kund hos dem får ordern på sitt kundnummer. Bara ett okänt
    företag läggs upp nytt. Finns numret på flera företag nekas ordern med 422.
  - Ordern har ingen inloggad kund: beställarens namn och e-post ligger i deras gästfält, och
    deras orderbekräftelse och statusmejl går till beställarens adress.
  - Samma `orderRef` ger aldrig två ordrar, också vid samtidiga anrop. En partnerorder känns
    igen på första statushändelsens aktör, `namnskylt:<orderRef>`. Ingen databasändring.
  - Upphämtning sparas utan leveransadress hos dem, som i deras kassa.
- **Fästet står i kommentaren till produktionen** ("Fäste: Nål."), eftersom deras
  monteringskoder bara är tejp, vägg och stolpe. Det görs i mottagaren. Kommentaren syns på
  deras orderpapper tills raderna från 2026-11-20 är utrullade (se Ägarens besked nedan): då
  ritas fästet på en egen rad.
- **Svaren följer våra omförsök:** 400 och 422 är ett nej som måste rättas (formfel, summan
  stämmer inte med raderna, en bild saknas, dokumentet går inte igenom märkskyltens regler),
  401 fel nyckel, 413 för stort och 5xx tillfälligt fel.
- **Statusen tillbaka:** `updateOrderStatus` hos dem skickar ett signerat besked till
  `PARTNER_WEBHOOK_URL` (vår `/api/supplier/webhook`) med `PARTNER_WEBHOOK_SECRET`, samma
  värde som vår `SUPPLIER_WEBHOOK_SECRET`. Går beskedet inte fram händer inget hos dem; vår
  sida hämtar läget när ordersidan visas. Expressfraktens pris följer med nästa statusbyte
  efter att personalen har satt det.
- **Koden hos dem:** `apps/web/src/lib/partner-orders.ts` (regler och tester),
  `src/server/partner-orders.ts`, `src/server/partner-notify.ts`, de två vägarna under
  `src/app/api/partner/orders/`, ett anrop i `src/server/orders.ts` och hemligheterna
  `PartnerApiKey` och `PartnerWebhookSecret` i `infra/sst.config.ts`.
- **Rättat i mottagaren efter deras bug-hunt och deployat där 2026-11-17 (15:43):**
  - Fraktbokningen aviserar den vi pekar ut. Aviseringens e-post skickas på leveransadressen
    (`SupplierAddress.email`, `notificationEmail` i `request.ts`): **namnskylt.coms egna
    kunder aviseras direkt, en återförsäljares kund aldrig** (beslut av ägaren 2026-11-17,
    eftersom verkstaden står som avsändare i aviseringen). För en återförsäljares order är det
    återförsäljarens vanliga adress (`SupplierBuyer.contactEmail`, inte fakturabrevlådan),
    både när skyltarna går till kunden och till återförsäljaren. Vid upphämtning skickas ingen
    adress, och en borttagen kund aviseras inte.
    - `contactEmail` läses inte av mottagaren: orderbekräftelsen och statusmejlen därifrån går
      till `buyer.email`, alltså fakturaadressen när en sådan finns.
    - Mottagarens telefon är alltid den på leveransadressen, också för en återförsäljares kund
      (beslut av ägaren 2026-11-17: budet behöver nå den som tar emot). Följden är att ett sms
      från transportören kan nämna verkstaden för butikens kund, fast mejlet går till
      återförsäljaren.
  - Personalen kan inte ändra rader på en order från oss i deras admin (antal, text, ta bort).
    Raderna bär våra priser. Ska något ändras makuleras ordern och vi skickar en ny.
    Frakten på en order från oss går inte heller att ändra där, utom expressfraktens pris,
    som sätts i hela kronor.
  - Företaget väljs av `choosePartnerCompany` hos dem. Organisationsnumret jämförs på
    siffrorna (med eller utan bindestreck, som momsnummer eller med sekel), bara aktiva företag
    räknas, och filialer med samma nummer skiljs på exakt namn. Finns numret inte gäller en
    namnträff bara en enda rad utan nummer, som då får numret. Allt annat ger ett nej (422)
    med skälet: inaktivt företag, samma namn med annat nummer eller flera möjliga företag.
  - En ny beställare läggs upp med faktura-e-post, telefon och fakturaadress. Adressen
    skickar vi tolkad (`SupplierBuyer.billingAddress`, `guessAddress`) när den fria texten går
    att läsa som gata, postnummer och ort.
- **Läget i drift:**
  - De två hemligheterna i AWS (`PartnerApiKey`, `PartnerWebhookSecret`) är satta sedan
    2026-11-17 på ägarens begäran och inlästa av deployen 16:35. Värdena finns bara i SST
    (`sst secret list --stage prod`). Webhookadressen är förvald för prod.
  - Våra tre variabler på Railway är satta av ägaren 2026-11-17 och stämmer med AWS.
    Ägarens företagsuppgifter har organisationsnummer sedan samma dag. E-post, telefon och
    adress där är det verkstaden fakturerar och lägger på kundkortet, så de ska vara
    namnskylt.coms egna (inte kontrollerat av någon annan än ägaren).

**Det proven visade, och det som gjordes åt det (lokalt 2026-11-17, på ägarens begäran):**
- **Fler typsnitt skickas som färdiga banor** sedan 2026-11-20, se avsnittet Typsnitt. Det
  som står här nedanför gäller verkstadens egna två, Arial och Arial Narrow.
- **Typsnitten är nu verkstadens.** Deras "Arial" ritas med Roboto och "Arial Narrow" med
  Roboto Condensed (`font-metrics.ts` hos dem). Vi använder samma filer, byte för byte
  (`public/fonts/Roboto-*.ttf`, `RobotoCondensed-*.ttf`, Apache 2.0), så plastskyltens
  produktionsfil är identisk med vår ritning. Namnen i väljaren är kvar, "Arial" och "Arial
  Narrow", och id:na är oförändrade.
  - Saknar radens typsnitt ett tecken ritas hela raden i Liberation Sans, med dess mått
    (`FALLBACK_FONT_FILES`, `covers` i `font-engine.ts`). Det är verkstadens regel
    (`chooseFont` hos dem). Roboto Condensed är en latinsk delmängd, så det gäller främst
    grekiska och kyrilliska i Arial Narrow. `FontEngine.capHeightRatio` tar därför radens text.
  - Raden mäts och ritas som hos verkstaden (`drawnText`, deras `normaliseraTextrad`): hårda
    och tunna blanksteg är vanliga blanksteg, och noll-breda tecken ritas inte. Annars skulle
    ett inklistrat osynligt tecken byta hela raden till reservtypsnittet hos oss men inte hos dem.
  - Webbläsaren hämtar reservtypsnittet i bakgrunden efter de övriga (`FALLBACK_FILES`,
    `loadBrowserFallbackFonts`, `addFonts`). En rad som redan ritats utan det ritas om när
    filerna kommit. Servern läser alla filer direkt.
  - Roboto Condensed är mindre smal än Arial Narrow var: ungefär 89 % av Arials bredd, mot
    82 % förut. Redan sparade skyltar ritas om med de nya typsnitten.
- **Metallskylten tas emot.** `namnskylt-metall` finns i deras katalog som ett dolt, färdigt
  ämne (`Material.precut`, kategorin `name-badge-blank`) med våra tre ytor (`metal-white`,
  `metal-gold`, `metal-silver`). Det går inte att välja i deras designer eller kundvagn, bara
  att ta emot från oss. Gravyrfilen har ingen skärkontur för ett färdigt ämne
  (`omitOutline`), och sidan är ämnets mått. Ordern hamnar under Ordrar på deras
  produktionssida, inte i plastkön, och orderpappret visar material, yta, mått, fäste och text.
  Tjockleken står inte i deras katalog förrän Mats har bekräftat den.
- **Egen form i plast tas emot** och skärs i rätt form. Mottagaren prövar punkterna själv
  (minst 3, högst 256, inom skyltens mått) och resten av dokumentet mot märkskyltens regler.
  Deras gravyrfil ritar en fri form i blått (genomskär), som deras ovaler och polygoner.
- **En kudde i plast skickas som fri form** med kuddens 128 punkter (`supplierOutline` i
  `map.ts`), så att verkstaden skär kudden och inte en rektangel. I metall är kudden ett
  färdigt ämne och skickas som rektangel.
- Rektangel, egen form och kudde går att lägga på samma ark i deras plastkö (provat med
  "Skapa produktionsorder").
- **Ett printat namn hamnar i deras tryckfil och inte i gravyrfilen.** Vi skickar det som
  banor i ett trycklager (se Märkningsmetod). Provat lokalt: gravyrfilen har bara
  skärkonturen, och tryckfilen har namnet i kundens färger tillsammans med loggan.
  Orderpappret hos dem visar raderna i kommentaren och "Ingen text på skylten".
- Vår `productionSvg` tas emot men sparas inte: deras motor ritar ur dokumentet.
- Personalen kan inte redigera en rad med metallämne eller fri form i deras admin, eftersom
  deras egna regler för märkskylt inte godtar dem. Ändrar personalen antal på en rad räknar
  deras system om priset med sin egen prislista.

Luckor i kontraktet:
- Metallämnets artikelkod är fortfarande vår uppskattning. Ämnet finns i deras katalog bara
  som ett namn och tre ytor, som där heter "Vit lackad", "Borstat guld" och "Borstat silver".
  Måtten står i dokumentet, och verkstadens egen benämning på ämnet står i `productionNote`.
  De nya måtten (minst 60 × 18 mm) är inte provade mot deras mottagare.
- Egen form och kudde i plast skickas som deras fria polygon (`shape: "freeform"`,
  `customShapePoints`). Deras designer säljer inte fri form i plast; det är mottagaren som
  släpper igenom den för våra ordrar.
- Fästet skickas som text i stället för artikelkod. Deras mottagare lägger det i kommentaren
  till produktionen, och sedan 2026-11-20 skickar vi det också som en egen rad till
  orderpappret (`partnerSpecs`, se nedan).
- Beställarens eget inköpsnummer har inget fält i deras mottagare. Vi skickar det i orderns
  märkning (`orderName`), se avsnittet Inköpsnummer. Deras `customerPo` är vårt ordernummer.
- Deras text- och ramlager har inget läge för print. Vi går runt det med ett trycklager av
  banor, så personalen kan inte ändra ett printat namn hos sig. Med ett tryckläge på deras
  textlager kunde namnet skickas som text igen.
- Färg är bara hex hos dem (läst 2026-11-17 och 2026-11-18): deras designer och format har
  `hexColor` i `layer-schema.ts`, sju standardfärger och en färgväljare (`PrintColorField`,
  `PRINT_STANDARD_RGB`), tryckfilen ritas i RGB och görs om till tryckfärger i RIP:en. Sedan
  2026-11-18 väljer kunden färg på samma sätt hos oss, så inget går förlorat på vägen. CMYK
  och Pantone går inte att uttrycka i deras format.
- Vi skickar deras fyra fraktsätt: varubrev, paket, `postnord-express` och `pickup-hogsbo`.
  Expressfraktens pris läses ur statusen de skickar (`SupplierOrderState.shippingCost`, hela
  kronor exklusive moms); de behöver skicka fältet.
- En logga i färg skickas som bildlager med `renderMode: "print"`. Deras format har läget, men
  ingen har bekräftat att verkstaden trycker namnskyltar eller vilken upplösning som krävs.
- Lambda tar högst 6 MB per anrop. Bilderna skickas en gång och anropet stoppas vid 5,5 MB,
  men en order med många olika loggor i färg kan ändå bli för stor.

**Ägarens besked 2026-11-20 om vad som får ändras där:** "vi ska inte röra skyltmotorns
funktionalitet men dom produktionsdokument som skickas från namnskylt.com till skylt och
gravyrs produktion/admin dashboard ska ändras. Men ingenting i hur skylt och gravyrs egen
motor fungerar." Samma dag sa ägaren ja till två avgränsade ändringar där, som båda bara
gäller ordrar från namnskylt.com, och sedan till att rulla ut dem ("Kör båda"). **Skyltmotor
är deployad till produktion 2026-11-20 cirka 12:17**, efter deras bug-hunt (0 CRITICAL,
0 HIGH, 2 MEDIUM), och Namnskylts del pushades samma dag.

- **Utrullningen hos verkstaden:** bara de nio filer som hör till ändringarna hade ändrats
  sedan deras förra utrullning (kontrollerat på filernas tider). Sajten svarade likadant före
  och efter på elva kontroller (start, skyltmotor, kassa, villkor, om oss, kontakt, inloggning,
  admin och mottagaren utan nyckel), och start, skyltmotor, kassa och inloggning laddade i en
  webbläsare utan fel. Testmiljön (destage) hoppades över: dess databas ligger efter i
  migreringar, så en utrullning dit hade gett en trasig testsajt.
- **Inget är sett på en riktig order.** Ingen riktig order har gått från namnskylt.com sedan
  utrullningen, så raderna är inte sedda på ett riktigt orderpapper och mejlen inte i en
  riktig brevlåda. Första skarpa testordern är första provet.
- **Två följdpunkter ur bug-hunten är inte åtgärdade** och väntar på ägarens ja, eftersom de
  är ändringar i skyltmotor:
  - Orderpappret läser `partnerSpecs` på alla dokument, inte bara på ordrar från namnskylt.com.
    En kund hos verkstaden som bygger sitt eget anrop kan alltså lägga egna rader på sitt eget
    orderpapper. Värdena rensas, så ingen kod kan smugglas in. Förslag: läs fältet bara för
    partnerordrar.
  - Kommentaren döljs så fort en rad går att rita, också om rader har kapats (högst 12 rader
    och 300 tecken), och grupperingen läser bara kommentaren. Det går inte att nå med det vi
    skickar i dag: högst fem korta rader, och kommentaren ändras när raderna gör det.

- **Fästet, ämnet och märkningen står på egna rader på verkstadens orderpapper** ("där ska
  det inte vara 'kommentar' för typ fäste osv. utan en egen 'rad' där det står typ fäste och
  exempelvis 'nål'"). Förut stod allt i en enda rad, Kommentar, som löptext.
  - **Vi skickar raderna** i dokumentet, som `partnerSpecs` (`SupplierSpecRow`, `specRows` i
    `src/lib/supplier/map.ts`): Fäste (alltid), Ämne (metallens benämning och tjocklek) och,
    när något printas, Märkning, Tryckfärg och Tryckt text. Rubrikerna är korta, eftersom
    orderpapprets kolumn för rubriker är smal. Att "Namn: Print" och "Logotyp: Print" inte
    har egna rader valde jag: metodens namn säger samma sak.
  - **`productionNote` skickas som förut**, med samma innehåll i löptext. Den behövs:
    verkstadens papper ritar den som Kommentar när raderna saknas, och deras gruppering av
    skyltar till samma maskinuppsättning läser den. Ändras det som står i kommentaren ska
    raderna ändras på samma sätt, annars tappas uppgiften på pappret.
  - **Hos verkstaden** ritar `documentSpecs` i `apps/web/src/lib/order-paper.ts` raderna där
    Kommentar stod, och hoppar då över kommentaren (`partnerSpecs`, läst defensivt: högst 12
    rader, 24 tecken i rubriken och 300 i värdet). Deras mottagare, märkskyltens regler och
    deras egna dokument är orörda. Raden "Tejp: Nej" står kvar på pappret; den är deras egen.
  - Ordningen de två sidorna rullas ut i spelar ingen roll: deras mottagare godtar redan ett
    okänt fält och sparar det, och utan fältet ritas Kommentar som i dag.
  - Provat lokalt 2026-11-20 med tre riktiga dokument från Namnskylt (metall med magnet och
    tryckfärg, plast med nål, plast med klämma) genom deras egna funktioner: mottagarens
    omskrivning, märkskyltens regler och orderpappret. Alla godkänns, och pappret visar
    "Fäste: Magnet | Ämne: … | Märkning: Endast print | Tryckfärg: #0057B8 | Tryckt text: …".
- **Verkstadens mejl om en order från namnskylt.com har namnskylt.coms utseende** (ägarens ja
  på frågan om verkstadens mejl skulle få vårt utseende, i stället för två bekräftelser).
  Det gäller orderbekräftelsen (också en uppdaterad), "har skickats" med spårningslänken och
  "klar för upphämtning" i Högsbo. Kunden får fortfarande ett enda mejl per händelse, från
  verkstadens system.
  - Mallen är `apps/web/src/lib/partner-email.ts` hos dem (`renderPartnerEmail`,
    `partnerEmailText`): namnskylt.coms logga överst, rubrik i serif och svart knapp, raden
    "namnskylt.com – en del av Skylt & Gravyrteknik AB" under kortet, verkstadens adress,
    telefon och orderbrevlåda, och deras logga längst ner. Valet görs av `orderMailLook` i
    `apps/web/src/server/partner-email.ts`, som känner igen ordern på samma sätt som resten
    av deras kod (`isPartnerOrder`). Deras egna ordrar får exakt samma mejl som förut.
  - **Loggan ligger som en kopia hos dem** (`apps/web/src/server/partner-logo.ts`, bäddad i
    mejlet), tagen ur `public/logo-namnskylt-mejl.png`. Ändras sajtens logga ska den filen
    göras om också.
  - Oförändrat, med flit: innehållet, ämnesraden och avsändaren (verkstadens adress).
    Raden "Ert IO-nummer: NS-…" i bekräftelsen är deras text och visar vårt ordernummer.
  - **Den bifogade orderbekräftelsen som PDF har också vårt utseende sedan 2026-11-21**
    (ägarens "Ja tack" på frågan, och sedan "Pusha när du är klar"). Till dess var den
    verkstadens eget dokument i marinblått och orange. Bara för ordrar från namnskylt.com:
    - namnskylt.coms logga överst på ljus botten, bläck och papper i stället för marinblått
      och orange, loggans guld (#B8934A) som accent, och i sidfoten raden "namnskylt.com – en
      del av Skylt & Gravyrteknik AB", verkstadens uppgifter som säljare och deras logga till
      höger. Samma rader, belopp och uppgifter som förut.
    - Hos verkstaden: `OrderPdfLook` och fältet `look` i
      `packages/production/src/order-confirmation-pdf.ts`, och `confirmationLook` i
      `apps/web/src/server/order-confirmation.ts`, som frågar `isPartnerOrder`. Samma PDF
      visas när personalen öppnar bekräftelsen i deras admin. Går vår logga inte att läsa
      ritas deras eget utseende, så att bekräftelsen aldrig uteblir.
    - **Deras egna ordrar och offerter är orörda**: ritade före och efter med samma uppgifter
      är sidorna identiska pixel för pixel.
    - Rubrikerna är i verkstadens typsnitt, inte i vårt seriftypsnitt (Instrument Serif): det
      finns inte i deras paket, och jag lade inte in en ny typsnittsfil där. Det valde jag.
    - Deployat till deras produktion 2026-11-21 cirka 16:25, efter bug-hunt utan allvarliga
      fynd (två uppföljningar, se deras dagbok). Sajten svarade likadant före och efter på
      elva kontroller. **Ingen sådan PDF är sedd i drift**: det kräver en riktig order.
    - **Fakturan är fortfarande verkstadens**, ur deras Fortnox, i deras utseende.
  - **Exempel på alla mejl och dokument** ligger i mappen
    `Namnskylt-exempel-mejl-och-dokument-2026-11-21` på ägarens skrivbord (utanför repot),
    med påhittade uppgifter: offertmejlen, offertens PDF, kundens offertsida och ordersida,
    följesedeln, beskeden till admin, verkstadens tre mejl och bekräftelsens PDF, och de fyra
    avstängda mejlen. Skripten som tog fram dem ligger i `tmp/exempel/` (gitignorerat).
  - Vår egen orderbekräftelse och vårt fraktbesked skickas därför aldrig för en direktorder:
    annars får kunden två mejl (`customerGetsSiteMail`, se Mejl från sajten).
  - Provat lokalt 2026-11-20 genom att rita de tre mejlen med påhittade uppgifter och se dem
    i Chrome på 700 och 390 px. **Inget mejl har skickats, och inget är provat i en riktig
    e-postklient.** Knappen ritas med VML i Outlook, som ingen har sett.
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
- README och licens saknas.

**Säkerhetskopia** från före städningen 2026-11-10: `tmp/backup-fore-stadning.tgz`.
