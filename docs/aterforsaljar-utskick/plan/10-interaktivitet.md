# 10 — Interaktivitet i mejlet

Källor (lästa, inte ändrade): `src/lib/outreach/shop-email.ts`, `shop-mockup.ts`, `src/lib/images/{badge-shot,logo-plate,logo-tone}.ts`, `src/lib/ai/badge-image.ts`, `src/lib/share/{share-image,share-link}.ts`, `src/lib/brand/{profile,match,color}.ts`, `src/lib/company/scrape.ts`, `src/engine/{catalog,document,logo,render-svg,schema,types}.ts`, `src/features/designer/{designer,logo/trace-image,sections/logo-section}.tsx`, `src/app/skapa/page.tsx`, `src/app/butik/[slug]/skapa/page.tsx`, `src/app/butik/[slug]/mejlbild/route.ts`, `src/app/forhandsvisning/[slug]/page.tsx`, `src/app/api/{share-image,brand}/route.ts`, `src/app/layout.tsx`, `src/middleware.ts`, `src/lib/shops/{showcase-images,page-templates,build}.ts`, `src/lib/db/migrations.ts`. Roots `apps/api/src/lib/email/templates.ts` har ingen interaktivitet.

## 1. Sammanfattning

Det som väcker intresse är en skylt med återförsäljarens logga, ritad av motorn, plus tre–fyra klick som öppnar samma skylt i designern. AMP for Email och checkbox-flikar når inte mottagarna i det här utskicket. Animerad GIF når alla utom skrivbords-Outlook, som fryser på första rutan — den rutan ska därför vara hjälten.

Loggan graveras enfärgat i gravyrsfärgen. Ytans färg är en katalogfärg (`matchColorCombo`), aldrig en fri hex. `renderShopMockup` ritar i dag «Anna Lindqvist / Säljare» i mässing utan logga. Den bilden får ligga kvar som butiksfönster. Den nya bilden är själva skylten.

Allt förrenderas när leadet blir `ready` och lagras som bytes. Mejlklienten hämtar en färdig URL. Ingen rendering, ingen skrapning och ingen rate limit på träffen.

## 2. Vad vi återanvänder från Roots

Roots `templates.ts` är statisk transaktions-HTML (tabell, inline-stil, textvariant). Inget AMP, ingen GIF, inga formulär. Det mönstret behålls: bilder är absoluta https-adresser, aldrig `data:`, och textversionen bär samma länkar.

Namnskylts brev finns redan. `buildShopEmail` (tabell 600 px, VML-knapp, `tracked()`, mörkt läge, avregistrering) är mallen som utökas. `renderLeadMail` i Roots portas inte.

## 3. Förslag för Namnskylt

### Vad klienterna faktiskt visar

| Teknik | Gmail (webb och app) | Outlook Windows (Word) | Outlook på webben / nya Outlook | Apple Mail | iOS Mail |
|---|---|---|---|---|---|
| AMP for Email | Bara efter Google-registrering, SPF/DKIM/DMARC och `text/x-amp-html` | Nej | Nej | Nej | Nej |
| Checkbox-hack (`input` + `:checked`) | Input tas bort | Tas bort; dolda paneler kan bli synliga när `<style>` strippas | Opålitligt | Ja | Ja |
| CSS-animation | Delvis på webben, nej i appen | Nej | Delvis | Ja | Ja |
| Animerad GIF | Spelas | Första rutan, stilla | Spelas | Spelas | Spelas |
| PNG med täckande bakgrund | Ja | Ja | Ja | Ja | Ja |
| WebP, SVG | SVG nej; WebP ojämnt | Nej | Nej | SVG nej | SVG nej |
| `<a>` runt en bild | Ja | Ja | Ja | Ja | Ja |
| Bild som ritas vid öppning | Google proxar och cachar URL:en | Fjärrbild blockeras tills klick | Proxas | Hämtas om fjärrbilder tillåts | Samma som Apple Mail |

AMP hoppas över. Registreringen tar veckor, gäller i praktiken bara Gmail och passar dåligt för kallt säljmejl. HTML-delen måste ändå finnas.

Checkbox-flikar hoppas över i v1. De fungerar i Apple Mail och iOS Mail. I Gmail händer inget. I Outlook kan alla paneler staplas, och dubbel HTML äter av Gmails klippgräns på cirka 102 KB. Intresset sitter i bilden och i länkarna, som fungerar överallt.

### Personlig skylt

Motorn tar en `BadgeDocument` med vektorlogga (`BadgeLogo.d`), inte en rasterbild. Spårningen i `features/designer/logo/trace-image.ts` använder canvas och kan inte köras på servern. `otsuThreshold` och `traceLogoMask` i `src/engine/logo.ts` är rena. Ny fil `src/lib/outreach/trace-logo-server.ts` gör om bläckmasken från `trace-image.ts` med `sharp` raw RGBA (samma trösklar: alfa 128, transparent andel 0,02, Otsu, kantklass) och anropar motorn. Bred logga (`viewWidth / viewHeight > 2.6`, samma konstant som `logo-section.tsx`) läggs `top` med höjd 7 mm, annars `left` och `LOGO_LIMITS.defaultHeightMm` (14).

`src/lib/outreach/badge-mail.ts`:

- Underlag är butikens `profile.logo` (data-URL) och `profile.name`. Leadets `brand` i plan 06 har bara `logoUrl` som http(s) och får inte bära bytes.
- Text: `createBadgeDocument(["Anna Lindqvist", shopName.slice(0, 26)])`, form `rounded`, 70×25 mm. Samma exempelperson som `showcase-images.ts` och `renderShopMockup`.
- Färg: `matchColorCombo(colors, "plastic-2-layer")` och samma mot `"epoxy"`. Närmast under taket 45 (CIE76) vinner. Ingen träff → hjälten är `brass` / `brass-gold`, och kopian säger «er logga på mässing». Träff → kopian säger «närmaste färg vi graverar», inte «era färger».
- `flatness` i `src/lib/brand/logo-image.ts`: ett foto (många färger) spåras inte. `traceLogoMask` som ger `null` ger samma läge. Status `logo` | `text-only` | `generic`. `generic` = ingen butikslogga; då används bara dagens `/butik/{slug}/mejlbild`.
- Varje dokument valideras med `badgeDocumentSchema` innan det sparas. Ogiltig `colorId` för materialet får inte ut.

`renderBadgePng` (`src/lib/ai/badge-image.ts`) ger skylten. `sharp` lägger den på papper `#f6f6f3` (samma som `share-image.ts`) med mjuk skugga, och skriver **PNG**. `showcase-images.ts` skriver WebP och `badge-shot.ts` normaliserar klientens 3D-skärmdump till WebP — ingen av dem används i mejlet. Genomskinlig PNG blir svart kant i Outlook. SVG i mejlet blockeras.

Hjälte: 1104 px bred, visas som 552 (samma som mockupen). GIF och rutor är egna beskärningar av samma dokument, inte Open Graph-ytan 1200×630 från `renderShareImage`.

### Förrendering, lagring, cache

Ny tabell i migrering `014_outreach_badges` (06 har reserverat `013_outreach`). Byt nummer om 014 är taget.

```sql
create table outreach_badge_assets (
  id text primary key,
  lead_id uuid not null references outreach_leads(id) on delete cascade,
  kind text not null,
  material_id text,
  mime text not null,
  bytes bytea not null,
  width int not null,
  height int not null,
  badge jsonb,
  color_matched boolean not null default false,
  created_at timestamptz not null default now(),
  constraint outreach_badge_assets_kind_chk
    check (kind in ('hero','gif','tile')),
  unique (lead_id, kind, material_id)
);
```

`id` = `randomBytes(12).toString("base64url")`, samma som `shop_images`. `badge` är dokumentet för `hero` och `tile` (GIF har `badge` null). Ny rendering tar nya id:n och raderar leadets gamla rader, så en cachad URL aldrig byter innehåll.

`GET /utskick/bild/[id]` (`src/app/utskick/bild/[id]/route.ts`), route handler, inte under `/api/`. Middleware stänger `/api/*` med sajtlösen när `SITE_GATE_PASSWORD` är satt; Gmail skulle då få 401. Layoutens `SiteGate` träffar inte route handlers. Svar: rätt `content-type`, `cache-control: public, max-age=31536000, immutable`. Ingen cookie, ingen rate limit per IP — Gmails bildproxy delar IP mellan många mottagare, och `share-image` tak på 300/timme skulle släcka bilderna. Id:t är ogissbart och det finns ingen listning.

`/butik/[slug]/mejlbild` (max-age 86400, ritas vid varje cachemiss) behålls som butiksfönster. Skyltbilden ritas inte där. `/api/brand` (15/timme, upp till 60 s) anropas inte från mejlet. `/forhandsvisning/[slug]` kräver `canManageShop` och är stängd för mottagaren.

Jobbet körs när butiken finns och leadet går mot `ready`, utanför sändningens 15 s-budget (plan 01). En lead är några sekunder: en spårning, fyra PNG, en GIF.

### GIF

Nytt beroende `gifenc` (ren JS, MIT). `sharp` 0.35 skriver inte en animerad GIF från flera PNG. Fyra rutor, cirka 1 s (`delay` i millisekunder — läs paketets readme vid implementationen), loop, 552 px bred, palett 128, mål under 400 KB. Ordning, första rutan är den Outlook fryser:

1. Hjälten (matchad färg, eller mässing).
2. `brass` / `brass-gold` (hoppas över om den redan är hjälte).
3. `aluminium-anodized` / `alu-natural-black`.
4. `acrylic` / `acrylic-white` (ljus logga → `acrylic-black-matt`, via `isLightLogo`).
5. `plastic-2-layer` med matchad `colorId`, annars `black-white`.

Visa de fyra första efter den regeln. Över 400 KB: sänk till 480 px, sedan tre rutor. Fortfarande för stor: skicka ingen GIF, bara hjälte-PNG. Samma logga och samma text i varje ruta, bara material och färg byts.

### Klickbara materialval

Fyra rutor i en tabell 2×2, varje cell en `<a>` runt en PNG (260 px visad, 520 px fil) plus synlig text under (`MATERIALS[].name` och `tagline`). Texten syns när fjärrbilder är av. Alt-text: «Mässing, guld med svart gravyr — öppna i skyltmotorn» och motsvarande.

Länken är `/butik/{slug}/skapa?f={tileId}`. `src/app/butik/[slug]/skapa/page.tsx` läser `f`, hämtar `badge`, kör `badgeDocumentSchema` och skickar `initialDoc` till `Designer`. Finns `initialDoc` hoppar designern över onboarding (`designer.tsx`). Butikens prislista ligger redan runt designern via `ShopPriceProvider`.

`?d=` (`encodeShareCode`) används inte. Taket är 12 000 tecken, loggan släpps när koden är längre (`SHARE_MAX_CHARS`), och Outlook klipper URL:er runt 2 000 tecken. `/skapa` utan butik ligger bakom `SiteGate` (`OPEN_PATHS` i `layout.tsx` släpper `/butik/`, inte `/skapa`). Plan 06 kräver butik innan `ready`, så demobutiken är målet.

`tracked()` i `shop-email.ts` får `utm_content` per ruta: `{slug}-skylt`, `-massing`, `-aluminium`, `-akryl`, `-plast`. `utm_campaign` tas från `outreach_campaigns.slug` (06), inte den hårdkodade `demobutik`. Textversionen listar samma fyra URL:er.

### Fallback per klient

- **Alla, bilder av:** alt-text, synliga materialnamn, textversionens länkar, VML-knappen till butiken som i dag.
- **Outlook Windows:** stilla hjälte (GIF:ens första ruta) + de fyra rutorna. Ingen animation, ingen flik.
- **Gmail:** GIF spelas, rutorna är länkar. Ingen AMP-del.
- **Apple Mail och iOS:** samma som Gmail. Ingen dold checkbox-version.
- **Ingen logga / misslyckad spårning:** mejlet som i dag, bara `mejlbild`. Status `text-only` visar skylt utan logga och säger det i kopian.
- **Mörkt läge:** täckande pappersbakgrund i filen och `background-color:#f6f6f3` på `<img>`, så klienten inte inverterar skylten. Brödtexten får behålla sitt mörka läge.

## 4. Före Resend-kontot

Spårning, rendering, GIF, tabell, route och migrering behöver ingen nyckel. Admin-förhandsvisningen `GET /api/admin/shops/[slug]/email` utökas med bild-URL:erna så operatören ser brevet (plan 03). Mock-sändaren bifogar samma HTML. Test (`node:test`): en enkel PNG spåras till en bana; dokumentet klarar `badgeDocumentSchema`; HTML har fyra länkar, `v:roundrect`, ingen `src="data:` och ingen `.webp`.

## 5. Beslut som användaren måste ta

1. AMP och checkbox-flikar ingår inte i första utskicket. Säg till om Apple Mail-flikar ska byggas ändå.
2. Exempelpersonen är «Anna Lindqvist», rad två är bolagsnamnet. Kontaktpersonens namn graveras inte.
3. Hjälten använder närmaste katalogfärg när `matchColorCombo` träffar, annars mässing. Kopian följer träffen och lovar inte en fri varumärkesfärg.
4. Ett mejl får gå utan personlig skylt när spårningen misslyckas (dagens `mejlbild`). Alternativet är att `ready` väntar på status `logo`.
5. GIF följer med under 400 KB. Annars bara stillbild, utan att mejlet stoppas.

## 6. Risker och hur de hanteras

- **Löfte om färglogga.** Gravyren är en mask i en färg (`render-svg.ts` fyller banan med `engraving`). Färgloggan syns i butiksfönstret, inte på skylten. Kopian säger «graverad logga».
- **Gmail-cache.** Ny bild = nytt `id`. Skriv aldrig över bytes på en URL som redan skickats.
- **Sajtlås.** Bildrouten ligger utanför `/api/`. Länken går till `/butik/…/skapa`, som redan är öppen.
- **Tung logga.** `traceLogoMask` förenklar under `LOGO_LIMITS.maxPathChars` (80 000). Schemat stoppar resten. Då `text-only`.
- **GIF-vikt.** Tak 400 KB, sedan färre rutor, sedan ingen GIF. Första rutan är alltid hjälten.
- **Clip.** Bilderna är fjärradresser och räknas inte in i Gmails 102 KB. HTML:en förblir en tabell.
- **Render i sändloopen.** Tillgångarna finns innan `approved`. Claim rör dem inte.

## 7. Beroenden

- **06 datamodell.** `outreach_leads.id`, `shop_slug`, status `ready`. `brand` utökas inte med bytes. Tabellen här är `014`, efter deras `013`.
- **Butiksbygget** (`buildShop` / `createShop`). Utan `profile.logo` blir status `generic`.
- **03 operatörs-UI.** Förhandsvisningen visar status och bilderna före godkännande. Saknad skylt är inte `missing` om beslut 4 står kvar.
- **01 kö.** Rendering ligger före `approved`, inte i de 15 sekunderna.
- **Mall / `shop-email.ts`.** Den här planen lägger in hjälten, GIF:en och 2×2-tabellen. `tracked()` får kampanjslug utifrån.
- **Spårning.** `utm_content` per material är kontraktet klickplanen ska räkna. Ingen öppningspixel.
