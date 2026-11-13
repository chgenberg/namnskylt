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
# Kvalitetsgrinden. Kör den innan något lämnas (592 tester, grönt 2026-11-13).
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

- Skript körs med `tsx --conditions=react-server --env-file-if-exists=.env.local` (redan
  inbakat i `package.json`), så att `server-only`-moduler går att importera.
- `pnpm test` hittar bara tester i `src/engine/*.test.ts` och `src/lib/<domän>/*.test.ts`.
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
  - Ritverktyget ligger i `src/features/designer/custom-shape/`.
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

## Prismodellen — läge 2026-11-13

Alla priser kommer ur en prismodell (`PriceModel` i `src/engine/pricing.ts`) som ägaren ändrar
i `/admin/prismodell`. Den sparas i `settings` under nyckeln `price_model`; utan sparad modell
gäller `DEFAULT_PRICE_MODEL`, som är kalkylen från 2026-11-13.

- **Tre parter:** tabellen anger vad återförsäljaren betalar. Provisionen är plattformens andel
  av det beloppet och resten går till Skylt & Gravyrteknik. Slutkundens pris är återförsäljarens
  pris delat med (1 − marginalen), alltså marginal och inte påslag.
- **Trappsteg** på orderns totala antal: 1–100, 101–300, 301–500 och 501 eller fler.
- **Per skylt:** skylttypens pris (Premium = metall, Standard = plast, `priceClass` i katalogen),
  ett fäste (nål, klämma eller magnet) och loggan som "extra gravyr". Textrader och ram ingår.
  Varje del avrundas för sig till hela kronor.
- **Minsta ordervärde** gäller både det återförsäljaren betalar och det slutkunden betalar.
- **Hela modellen stannar på servern.** Den innehåller provisionen. Ut går bara prislistor
  (`PriceTable`) per part: `endPriceTable(model)` är det slutkunden betalar och
  `resellerPriceTable(model)` det återförsäljaren betalar. Ingen av dem innehåller provision
  eller marginal. Provisionen räknas med `provisionSplit(model, …)` och visas bara för admin.
- **Ingen funktion räknar pris utan en prislista.** `priceOrder`, `lineUnitPrices`, `priceBadge`,
  `resellerOrder` och `priceWithPricing` tar en `PriceTable`. Klientkomponenter läser slutkundens
  lista med `usePriceList()` (`PriceListProvider` i rotlayouten); serverkod anropar `getPriceModel()`.
- **Kalkylens siffror** (`DEFAULT_PRICE_MODEL`) ligger i `src/engine/default-price-model.ts`, som
  inte exporteras från `@/engine`. Bara filer med `import "server-only"`, skript och tester får
  importera den, annars bakas inköpspriser och provision in i webbläsarens JavaScript. Ett test
  i `src/lib/orders/price-lists.test.ts` kontrollerar det.
- **Ordrar och offerter sparar modellen** de skapades med (`price_model`, migrering 016) och
  räknas alltid med den. En ändring i admin rör aldrig befintliga ordrar. Rader från före
  migreringen saknar modell och räknas med dagens. När raden läses blir modellen prislistor
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
- **Bara admin** ser Butiker, Utskick och Prismodell (sidor, actions och API-vägar kontrollerar
  `isOwner`). Varje adminsida kontrollerar inloggningen själv med `adminTenant()`.
- Admin ser bara ordrar under hyresgästen `namnskylt`, inte återförsäljarnas ordrar. En samlad
  vy över alla återförsäljares ordrar och provisionen per order finns inte än.
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
