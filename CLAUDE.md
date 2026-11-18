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
  sajtens egna mejl: besked till återförsäljarna, kundens orderbekräftelse, fraktbeskedet och
  länken för glömt lösenord (se avsnittet Mejl från sajten).
  - **Enda undantaget är offertmejlet**, som ägaren bad om och slog på 2026-11-17. Det har sin
    egen strömbrytare, `QUOTE_RESEND_API_KEY` och `QUOTE_FROM_EMAIL`, satta på Railway på
    ägarens begäran. Ändra dem inte och ta inte bort dem utan att ägaren säger till, och lägg
    aldrig offertmejlets nyckel i `RESEND_API_KEY`: då slås övriga mejl och utskicket på. Se
    avsnittet Offertmejlet.
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
# Kvalitetsgrinden. Kör den innan något lämnas (1231 tester, grönt 2026-11-18).
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
| `src/lib/customer-auth/` | Slutkundens konto: regler (`model.ts`), lagring (`accounts.ts`), inloggningens kaka (`session.ts`), lösenordslänken (`access-links.ts`) och webbläsarens anrop (`client.ts`). Se avsnittet Kundkonton. |
| `src/lib/outreach/` | Utskicket till återförsäljare (se nedan). 42 filer i en platt mapp, vilket är känd skuld. |
| `src/lib/email/` | Transport: `ResendEmailSender` och `MockEmailSender`, som skriver `.eml` till `tmp/outreach-outbox`. |
| `src/lib/notices/` | Besked till panelens ägare när en kund har svarat eller beställt: texter (`model.ts`), lagring, `notify` och mejlet bakom en strömbrytare. |
| `src/lib/payments/` | Kortbetalning via Stripe bakom en strömbrytare: `stripe.ts` (anrop och signatur med `fetch`, utan SDK), `checkout.ts` (kassan som väntar på betalning och blir en order), `model.ts`. |
| `src/lib/maintenance/` | Fellogg (`error-log.ts`), bakgrundsjobb i processen (`scheduler.ts`, `jobs.ts`) och driftsidans lägen (`status.ts`). |
| `src/lib/designer-work/`, `designer-stats/`, `seo/` | Skyltmotorns sparade arbete i webbläsaren, tratten över var besök slutar, och reglerna för `robots.txt` och sitemapen. |
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
    - När kunden hämtar sin logga från hemsidan väljs den kombination som ligger närmast
      varumärkets färg (`matchColorCombo`), och den har nu fler att välja bland.
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
    - klämman är en stålplatta nästan lika lång som skylten, med en fjäderarm vikt över ena
      änden, ett fönster med en tunga i armen och en uppvikt läpp längst ut.
  - Fästena ritas i mm i en grupp som är vänd som de ses bakifrån (x åt höger, z ut från
    baksidan). Måtten har tak, så fästet växer inte med en stor skylt, och är uppskattade
    från fotona. `footprint` använder samma mått, och `fitHardware`
    (`src/engine/hardware-fit.ts`) flyttar och förminskar fästet på en egen form. På en oval
    skylt kortas klämman till det som ryms (`clipSize`).
  - Skyltmotorn vänder själv skylten en stund när ett fäste väljs, så att fästet syns.
  - Känd brist: prismodellens kalkyl i `/admin/prismodell` låter fortfarande klämman väljas
    ihop med Premium, fast den kombinationen inte går att beställa.
- **Märkningsmetod** (beslut av ägaren 2026-11-16): kunden väljer om namn och logotyp graveras eller
  printas, i sektionen "Märkningsmetod" i skyltmotorn (`marking-section.tsx`). Fyra val
  (`MARKING_METHODS` i `src/engine/marking.ts`): Endast gravyr, Endast print, Namn graveras ·
  logotyp printas och Namn printas · logotyp graveras. En metod ingår i skylten.
  - **På metall finns bara "Endast print"** (beslut av ägaren 2026-11-18: "det ska inte gå att
    gravera i metall. Man ska bara kunna ha print på metall."). Materialet bär regeln
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
    - Knappen Gravera och gravyranimationen i 3D visas bara när något på skylten graveras
      (`engraves` i `designer.tsx`). Ramen heter "Tryckt ram" när namnet printas.
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
    - Färgen är kundens CMYK- eller hexkod när den går att rita, annars färgen skylten
      visades i (gravyrens färg).
    - Då finns inget text- eller ramlager för namnet hos verkstaden. Raderna står i
      kommentaren ("Text som printas: Anna Lind / Säljare"), och personalen kan inte ändra
      texten hos sig.
    - Utan glyfkonturer (typsnittet inte laddat, som i tester med `approxFonts`) skickas
      namnet som förut, som text, och metoden står bara i klartext. Samma sak om en bana inte
      går att räkna om (en logga med trasig bana): ordern stoppas aldrig av trycklagret.
    - En logga i färg som printas är fortfarande en bild.
  - En logga i färg som graveras behåller sina banor i en delad länk; ryms de inte tappas loggan.
  - Sektionen ligger som nummer 02 i panelen, före Logga & varumärke (03), eftersom metoden
    avgör hur loggan sedan märks (besked via ägaren 2026-11-16). Därefter Material 04, Form 05,
    Fäste 06 och Fler namn 07. Varukorgen är ingen sektion i panelen längre, se Ordern till
    verkstaden.
  - **Kunden kan ange en egen färgkod för trycket** (besked via ägaren 2026-11-16): fältet
    "Färgkod för trycket: CMYK, PMS eller hex" visas i sektionen när namnet eller loggan printas
    (`BadgeDocument.printColor`, åtgärden `print/color`, högst `PRINT_COLOR_MAX` tecken fritext).
    Läs alltid med `printColorOf`, som bara ger koden när något faktiskt printas, så att en kod
    som står kvar efter ett byte till gravyr inte följer med. `printColorLabel` ("Tryckfärg CMYK
    100/60/0/20") står bredvid fästet på ordersidor, offert, korrektur och i Tillverkning, och i
    verkstadens `productionNote`.
  - **Koderna är CMYK i första hand, och PMS och hex går också att skriva** (beslut av ägaren
    2026-11-17: "det är CMYK-koder som ska in", och på frågan valdes CMYK, PMS och hex). Fälten
    är fritext, och reglerna för vad som känns igen ligger i `src/engine/color-code.ts`.
    - CMYK är fyra tal mellan 0 och 100 (`cmykOf`): "100/60/0/20", "100, 60, 0, 20",
      "C100 M60 Y0 K20", "cmyk(100, 60, 0, 20)", med eller utan ordet CMYK och procenttecken.
      Ett PMS-nummer är ett enda tal och läses aldrig som CMYK. Skiljetecknet ska vara
      detsamma mellan alla fyra värden, så att "0,5/10/20" inte läses som fyra tal.
      Decimalkomma går bra där kommat inte skiljer värdena åt ("12,5/0/0/7,5").
    - **CMYK och hex ritas på skylten** (`printColorHex`). CMYK räknas om till skärmens färg
      med den enkla formeln, utan tryckeriets profil (`cmykHex`), så färgen är ungefärlig och
      mättade färger ser klarare ut på skärmen än i trycket. Hjälptexterna säger "ungefärligt
      på skärmen". PMS och RAL går inte att rita och följer bara med ordern.
    - I listor och underlag står koden likadant hur kunden än skrev den (`printColorText`):
      CMYK som "CMYK 100/60/0/20" och hex som "#RRGGBB". Annat står som det skrevs.
  - **Loggan har ett eget fält för sina färger** (samma beslut): "Loggans färger i CMYK" i
    sektionen Logga & varumärke, bara när loggan printas (`BadgeLogo.printColor`, åtgärden
    `logo/color`, högst `LOGO_PRINT_COLOR_MAX` tecken fritext, eftersom en logga kan ha flera
    färger). Läs alltid med `logoPrintColorOf` och `logoPrintInkOf`.
    - En svartvit logga som printas ritas i sin egen kod när den är en enda CMYK- eller
      hexkod (`LaidOutLogo.ink`), annars i koden för hela trycket. En egen kod som inte går
      att rita ger gravyrens färg, som för en rad. En logga i färg är en bild: där är koderna
      bara besked till tillverkningen och ändrar inte bilden.
    - Koderna står sist i etiketten: "Tryckfärg PMS 286 C, rad 2 #C8102E, logga blå
      100/60/0/20, röd 0/100/80/0".
    - "Invertera" behåller koderna, eftersom det är samma logga. En ny logga ärver dem aldrig.
    - Verkstadens bildlager har inget fält för färg, så loggans koder går bara som klartext i
      `productionNote`.
  - **Varje textrad kan få en egen färgkod** (besked via ägaren 2026-11-17): när namnet printas
    har varje rad i sektionen Text raden "Färgkod", med en färgväljare och ett fält för CMYK,
    PMS eller hex (`BadgeTextRow.printColor`, åtgärden `row/color`, samma längd och rensning som
    koden för hela trycket). Regeln är verkstadens egen (deras `TextRow.color`): färg per rad
    finns bara i tryck, och gravyr struntar i den, eftersom gravyren får materialets färg på
    alla rader. Läs alltid med `rowPrintColorOf` och `rowPrintInkOf`.
    - När namnet graveras visas inga fält, bara raden "Egen färg per rad går att ange när
      namnet printas, se Märkningsmetod.", så att ingen letar förgäves.
    - **En CMYK- eller hexkod ritas på skylten**, i ritningen, 3D-vyn och fotoläget
      (`printColorHex`, `LaidOutRow.ink`, `EngravedPath.ink`; i 3D en yta per färg, olyst som
      en logga i färg). Det gäller också koden för hela trycket (`printInkOf`,
      `BadgeLayout.printInk`): den färgar ramen, en svartvit logga som printas utan egen kod
      och rader utan egen kod. PMS och andra koder går inte att rita, eftersom vi inte har
      deras färger, och följer bara med ordern. En rad med egen PMS-kod visas i gravyrens
      färg, inte i tryckets. Tre siffror läses bara som hex med brädgård, så att PMS-numret
      286 inte blir en färg. Färgväljaren ger fortfarande hex.
    - Koderna står i samma etikett som koden för hela trycket: "Tryckfärg PMS 286 C, rad 2
      #C8102E" (`printColorLabel`). Raderna räknas som de står på skylten, utan tomma rader.
    - Verkstaden får radens färg som fyllnad på radens banor i trycklagret (se
      Märkningsmetod) och alla koder i klartext i `productionNote`. Fyllnaden är hex, så en
      CMYK-kod skickas som skärmens ungefärliga färg; den exakta koden står i klartexten.
      `SupplierTextRow.color` används bara när namnet skickas som text, alltså utan
      glyfkonturer.
    - "Fler namn" och "Ny personal" ger varje nytt namn samma färg per rad som mallen.
    - Produktionsfilen och maskinfilerna bär aldrig färgen: de har bara gravyren.
  - Preliminärt: att verkstaden printar text, och i vilken färg. Utan egen CMYK- eller hexkod
    visas ett printat namn i gravyrens färg.
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
- **Inspirationsbanken** har fyra exempel, alla i dagens sortiment: tre på rektangeln 60 × 30 mm
  och ett på ovalen 63 × 32 mm, med skyltbilder från fotoläget tagna 2026-11-17. Personbilderna
  är äldre och visar skyltar i de tidigare proportionerna. Bilderna för de fyra borttagna
  exemplen ligger kvar i `public/inspiration/`.
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
  startkostnaden. Textrader, ram och logga ingår. Slutkundens delar avrundas var för sig till hela
  kronor.
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
    Sidan fungerar först när sajtens mejl är påslagna; tills dess hänvisar den och
    inloggningen till namnskylt.com.
  - Lösenordets minsta längd ligger i `src/lib/reseller-auth/limits.ts`, en fil utan
    Node-moduler, eftersom formulären i webbläsaren läser den.
- Vägarna tar bara emot sina egna fält (`z.strictObject`), så det ena formuläret kan aldrig ge det
  andra inlogget. `authenticate` och `createAccount` vägrar ägarens id.
- En återförsäljare utan ordrar möts av "Gör din första offert" med knappar för ny offert, ny
  order och inställningarna; namnskylt.com ser demodatans välkomstyta. Översikten har knapparna
  Ny offert och Ny order.
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
    fortfarande namnskylt.coms namn och villkor. Fakturaunderlaget i panelen behövs inte längre
    för direktordrar. Kundens telefon följer bara med på leveransadressen, inte på kundkortet.
  - Känd brist: beställaren läses ur kundens rad när ordern skickas, inte ur en kopia på
    ordern. Om ett utskick misslyckas och samma e-postadress hinner beställa åt ett annat
    företag innan omförsöket, skickas den första ordern med det nya företagets namn och
    organisationsnummer. En kopia av beställaren på ordern (ny migrering) löser det.

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
    inte ändrade och tillhör fortfarande företaget som stod där förut. De syns på offerter och
    köpvillkor, och ägaren behöver byta dem.
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
- **Verkstaden har skickat** ger också ett besked (`order-shipped`, 2026-11-15), eftersom det
  är något som hänt utan att panelens ägare gjort det (`announceShipped`).
- **Mejl om besked är byggt men avstängt.** Det skickas först när `RESEND_API_KEY` är satt och
  avsändaren står i `NOTICE_FROM_EMAIL` (`noticeEmailSettings`); `OUTREACH_DISABLED=true` stänger
  också av det. Mottagaren är adressen i företagets uppgifter, annars kontots inloggningsadress.
  Länken byggs på `NOTICE_PUBLIC_URL` (standard `https://www.namnskylt.com`), aldrig på
  förfrågans värdnamn. Mejlet väntar kunden inte på, och `notices.emailed_at` sätts när Resend
  har tagit emot det. Aldrig provat mot Resend.
- Kända brister: lästa besked visas ingenstans (historiken står i orderns och offertens
  tidslinje) och tas aldrig bort.

## Mejl från sajten — läge 2026-11-15

**Sajten ska inte skicka egna mejl** (besked av ägaren 2026-11-17: "vi ska inte ha någonting
med Resend att göra"). Samma kväll bad ägaren om ett undantag: offerten mejlas till kunden,
via Skylt & Gravyrtekniks Resend-konto och med en egen nyckel, se avsnittet Offertmejlet. Kundens orderbekräftelse, statusmejl och faktura kommer från Skylt &
Gravyrtekniks system, till beställaren på ordern: kunden på en direktorder, återförsäljaren
annars. Mejlen nedan ligger kvar i koden men ska förbli avstängda tills ägaren säger annat.
Om beskedet också gäller utskicket till återförsäljare är inte sagt: fråga innan något görs där.

Sajten har fyra egna mejl utöver utskicket. Alla är byggda och avstängda, bakom samma
strömbrytare: `RESEND_API_KEY` och `NOTICE_FROM_EMAIL` (`noticeEmailSettings`,
`sendTransactional` i `src/lib/email/transactional.ts`). Inget av dem är provat mot Resend.

- **Besked** till panelens ägare, se avsnittet Besked.
- **Orderbekräftelse** till en kund som har beställt själv, i webbshoppen eller en butik
  (`sendOrderConfirmation`, `composeOrderConfirmation` i `src/lib/orders/`): skyltar, frakt,
  moms, summa, betalning, leveransadress och länken till kundens ordersida. Avsändarens namn
  är säljaren (butiken eller namnskylt.com) och svar går till säljarens adress.
  `orders.confirmation_emailed_at` sätts när Resend har tagit emot mejlet. En order som
  återförsäljaren lägger åt kunden, eller en godkänd offert, ger ingen bekräftelse.
- **Fraktbesked** till kunden när verkstaden har skickat (`announceShipped`,
  `composeShippedEmail`), med spårningslänken och länken till ordersidan. Går skyltarna till
  återförsäljaren får kunden inget mejl; återförsäljaren får beskedet i panelen.
- **Glömt lösenord**, se avsnittet Inlogg.
- Länkar byggs på `publicOrigin()` (`src/lib/http/public-url.ts`, `NOTICE_PUBLIC_URL`), aldrig
  på förfrågans värdnamn. Kundens namn och butikens namn rensas från radbrytningar innan de
  hamnar i ämnesrad och avsändare.

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
  - Under deras villkor står två egna stycken: "Om namnskylt.com" (att namnskylt.com
    förmedlar beställningen, med företagsuppgifterna ur panelen) och "Personuppgifter".
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
  - Sist står ett eget stycke, "På namnskylt.com": att namnskylt.com förmedlar beställningen
    (med företagsuppgifterna ur panelen), vad som sparas här, att bara nödvändiga kakor
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
  företagsnamn, eller namnskylt.coms för egna offerter. Svar går till säljarens e-post i
  företagsuppgifterna, annars kontots. Själva adressen ligger på verkstadens domän, eftersom
  mejlet går via deras Resend. Mejlet nämner aldrig verkstaden vid namn.
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
- **Avsändaren på namnskylt.coms egna offerter är ägarens företagsuppgifter** under
  Inställningar: namnet, svarsadressen och raderna under mejlet. De ska stämma innan admin
  skickar sin första offert (se Ordern till verkstaden om att uppgifterna behövde bytas).
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
- **Driftsidan** `/admin/drift` (bara admin): strömbrytarna (verkstaden, mejl, besked som
  mejl, kortbetalning) som av eller på utan värden, jobbens senaste körning, misslyckade
  utskick och de senaste felen.
- **CI:** `.github/workflows/ci.yml` kör kvalitetsgrinden mot en tom Postgres på push och pull
  request. Kedjan är provad lokalt mot en tom databas, men filen har aldrig körts på GitHub.
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
  monteringskoder bara är tejp, vägg och stolpe. Det görs i mottagaren, så vårt anrop är
  oförändrat. Kommentaren syns på deras orderpapper.
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
  till produktionen.
- Deras text- och ramlager har inget läge för print. Vi går runt det med ett trycklager av
  banor, så personalen kan inte ändra ett printat namn hos sig. Med ett tryckläge på deras
  textlager kunde namnet skickas som text igen.
- CMYK går inte att uttrycka (läst 2026-11-17): deras designer och format har bara hex
  (`hexColor` i `layer-schema.ts`, färgväljare i `text-rows-editor.tsx` och `PrintColorField`),
  tryckfilen ritas i RGB och görs om till CMYK i RIP:en. Kundens CMYK-koder, också loggans,
  skickas därför som klartext i `productionNote`, och radens färgfält får skärmens ungefärliga
  hex. Ska trycket träffa exakta CMYK-värden behöver deras format ett fält för det.
- Vi skickar deras fyra fraktsätt: varubrev, paket, `postnord-express` och `pickup-hogsbo`.
  Expressfraktens pris läses ur statusen de skickar (`SupplierOrderState.shippingCost`, hela
  kronor exklusive moms); de behöver skicka fältet.
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
- README och licens saknas.

**Säkerhetskopia** från före städningen 2026-11-10: `tmp/backup-fore-stadning.tgz`.
