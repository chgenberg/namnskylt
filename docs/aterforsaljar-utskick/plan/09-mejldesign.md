# 09 — Visuell mejldesign

## 1. Sammanfattning

Huvudmejlet är en redaktionell pappersyta i Namnskylts palett: papper `#f4f2ec`, bläck `#0a0a0b`, Georgia för rubriker, system-sans för brödtext. Geist och Instrument Serif kan inte laddas i mejl; fallbacks är de stackar som redan står i `globals.css`.

Bygg vidare på `src/lib/outreach/shop-email.ts` (`buildShopEmail`, `button`, `esc`). Byt skalet så det följer sajten: Namnskylt-logotyp i masten, hero som en personlig skyltbild i 600 px, tre staplade värdekort, tre steg, ett faktabaserat bevis, en pillerknapp med VML. Återförsäljarens skrapade `primaryColor` stannar på butikssidan.

Tekniken är handskrivna tabellfunktioner i TypeScript. Inget `react-email`, inget MJML.

## 2. Vad vi återanvänder från Roots

| Källa | Behåll | Ändra för Namnskylt |
|---|---|---|
| `apps/api/src/lib/email/templates.ts` `wrap()` | Ren funktion som returnerar `{ subject, html }`, tabell, `lang`, inline-stil, sidfot med avsändare | Skalet är 560 px, ankarknapp med `padding` och `border-radius: 8px`, ingen VML, inget mörkt läge, ingen preheader, ingen bild. Använd det inte som HTML-mall. |
| `apps/api/src/lib/outreach/template.ts` `renderLeadMail` | `{ subject, text, html }`, `escapeHtml`, synlig avregistrering i båda delarna, platshållare som vägras om data saknas | HTML:en är en `div` med `max-width: 600px`. Outlook tappar den bredden. Kopiera kontraktet, inte märkspråket. |
| Roots-knappen | En primär knapp, en URL | Ersätt med VML-piller, se §3. |

Namnskylt har redan mer av skalet än Roots: `buildShopEmail` har `v:roundrect`, `color-scheme`, preheader, `role="presentation"`, absolut bild-URL och `node:test` i `shop-email.test.ts`. Planen justerar det skalet. Den inför ingen parallell mall.

## 3. Förslag för Namnskylt

### Filer

- `src/lib/email/theme.ts` — en spegel av tokens, eftersom mejlklienter inte läser `globals.css`. Hex bara här.
- `src/lib/email/layout.ts` — `emailDocument`, `bulletproofButton`, `card`, `heroImage`, `stepRow`. Ren TS, inga React-typer.
- `src/lib/outreach/shop-email.ts` — sektionerna och texten. `ShopEmailInput` behålls (`shop`, `shopUrl`, `mockupUrl`, `logoUrl`, `logoPlate`, `sender`, `unsubscribeUrl`).
- `src/lib/outreach/shop-mockup.ts` — herobilden byter mått, se nedan.
- Tester: utöka `shop-email.test.ts` med `width="600"`, `v:roundrect`, `fillcolor="#0a0a0b"`, `alt=`, `prefers-color-scheme`, ingen `data:`-src, escapad butiksnamn.

### Färger

Ljust läge är det designade läget (`color-scheme: light` på sajten). Mörkt läge är en egen palett så att Apple Mail inte inverterar skyltbilden.

| Roll | Token | Ljust | Mörkt |
|---|---|---|---|
| Sidbakgrund | `--color-paper` | `#f4f2ec` | `#141311` |
| Kort | `--color-white` | `#ffffff` | `#1c1b18` |
| Bildbrunn | `--color-paper-3` | `#fbfaf6` | `#fbfaf6` (stannar ljus) |
| Rubrik, knapp | `--color-ink` | `#0a0a0b` | text `#f4f2ec` |
| Brödtext | `--color-ink-2` | `#2b2a27` | `#f4f2ec` |
| Sekundär text | `--color-navy-3` | `#57564f` | `#c8c4b8` |
| Linje | `--color-paper-2` | `#ebe8e0` | `#3a3832` |
| Märke | `--color-brass` | `#b8934a` | samma, bara yta |

`#75746c` (`--color-muted`) mot papper är cirka 4,2:1 och under AA för liten text. Ögonbryn, bildtext och sidfot använder `#57564f` (cirka 6,5:1). `#0a0a0b` på `#f4f2ec` och vitt på `#0a0a0b` ligger runt 17–19:1. Mässing mot papper är cirka 2,6:1 och används som 4 px-streck, aldrig som text.

Knappen är bläck med vit text i ljust läge. I mörkt läge byter CSS den till papper med bläcktext, så den syns mot det mörka kortet. VML-knappen i Outlook-skrivbordet stannar bläck/vitt (Word läser inte media queries).

Återförsäljarens `primaryColor` färgar inte knapp, ögonbryn eller steg. `readableOn` i `src/lib/company/profile.ts` används kvar för logoplåten när loggan är ljus.

### Typografi

| Roll | Stack | Storlek |
|---|---|---|
| Rubrik (h1, h2) | `Georgia, "Times New Roman", Times, serif` | h1 32/38, h2 26/32, vikt 400 |
| UI, bröd, knapp | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` | bröd 16/25, knapp 16 bold |
| Ögonbryn, Fig., mm | `"SF Mono", Menlo, Consolas, "Courier New", monospace` | 12 px, versaler, `letter-spacing: 1.5px` |
| Stegsiffra | Georgia, italic | 28 px, `#57564f` |

Geist (`geist/font` i `src/app/layout.tsx`) och Instrument Serif (`src/components/fonts.ts`) laddas inte: Gmail stryker `@font-face` och `<link>`, Outlook ignorerar webbfonter. Georgia är den redaktionella rösten från `.serif` / `--font-serif`. `clamp()` används inte. Vikt 500 faller till 400 i Word; knappen är `bold`. All stil är inline på `td` / `h1` / `p`, eftersom `<style>` i head försvinner i en del klienter. Klassen i `<style>` finns kvar enbart för mörkt läge och den smala brytningen.

### Avstånd och yta

4 px-skalan ur `:root`, i px: 4, 8, 12, 16, 24, 32, 40, 48. Kortets sidpadding är 40 px, 24 px under 620 px. Sektionsluft är `padding` på `td`, inte `margin` på `div`. Hörnradius 12 px på kort och 22 px på ytterkortet (samma som `.frame` på startsidan). Word ritar inte radien; det är en försämring vi accepterar. Ingen skugga, ingen gradient. En 4 px mässingslinje ersätter dagens `linear-gradient` i `shop-email.ts` (Word gör den till en slumpmässig ruta).

### Knapp

En primär knapp, samma URL i heron och i slutet. Etikett högst cirka 22 tecken så VML-bredden 280 px räcker. Mönstret som redan finns i `button()`, justerat:

- `<!--[if mso]>` `v:roundrect` `arcsize="50%"` `stroke="f"` `fillcolor="#0a0a0b"` höjd 48 px (hero-knappen `.primary` i `home-hero.module.css`).
- `<!--[if !mso]><!-->` ankare med `line-height:48px`, `padding:0 26px`, `border-radius:999px`, `mso-hide:all`, så de två knapparna inte visas samtidigt.
- `xmlns:v` och `o:PixelsPerInch` 96 stannar i head. De gör VML-pixlarna stabila.
- Sekundär handling är en understruken textlänk i `#0a0a0b`, 14 px. En fylld knapp per vy, som `.btn--primary`.

### Bild, 600 px

Yttre tabell: `width="600"` och `style="width:600px;max-width:600px"` plus `bgcolor`. Inre bilder är aldrig bredare än 600.

Heron är en skylt, inte en webbläsarram. `renderShopMockup` ritar i dag ett fönster på 1104×610 med den hårdkodade texten ”Anna Lindqvist”. Byt till en PNG av `renderBadgeSvg` med butikens namn (och en kort titelrad om namnet är långt), material mässing (`brass` / `brass-gold` — samma mässing som pricken i `public/logo-namnskylt.svg`).

- Fil: 1200 px bred PNG (2×), komposit på `#fbfaf6`. Ingen alfa: Outlook och Gmail ger en svart halo på transparenta PNG. Ingen WebP, ingen SVG.
- Visning: `width="600"` `style="display:block;width:100%;max-width:600px;height:auto;border:0"` i en `td` med `bgcolor="#fbfaf6"`.
- Alt: `Graverad namnskylt med {butiksnamn}, mässing, {bredd} × {höjd} mm`.
- Bildtext under, som `.caption` på startsidan: `Fig. 1` i mono, sedan `{material}, {mått} — graverad i Sverige` i Georgia italic.
- Absolut `https`-adress. Testet förbjuder redan `src="data:"`.
- Håll hela HTML:en under cirka 100 kB så Gmail inte klipper.

Logotypen `public/logo-namnskylt.svg` (vybox 504×97, bläck plus mässingsprick) rasteriseras med resvg/sharp till PNG, visad höjd 26 px (samma som `.logo` i headern). Mörk variant från `public/logo-namnskylt-dark.svg`, dold i ljust läge. Återförsäljarens logga ligger kvar på `logoPlate` (vit platta, höjd 40, maxbredd 200) mellan ingressen och skylten.

### Mörkt läge

Behåll meta-taggarna som redan finns:

```html
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
```

Lägg `bgcolor` på varje färgad `td` (Word läser attributet, inte bara CSS). I `@media (prefers-color-scheme: dark)` och `[data-ogsc]` / `[data-ogsb]` (Outlook.com):

- `.bg` och `.card` till de mörka hexen ovan, med `!important`.
- `.stage` tvingas kvar på `#fbfaf6`, så skyltfotot inte inverteras.
- `.logo-light` döljs, `.logo-dark` visas. Word ignorerar bytet och visar den ljusa loggan på papper, vilket stämmer i skrivbords-Outlook.
- Logoplåtens bakgrund stannar `#ffffff`.

### Outlook

Tabellayout med `cellpadding="0" cellspacing="0" border="0"` och `role="presentation"`. Ingen flex, grid, `position`, `var()` eller `clamp()`. `bgcolor` + `style` på samma cell. Knappen enligt VML ovan. `<!--[if mso]>`-omslag behövs inte runt 600-tabellen när `width="600"` sitter på tabellen själv; media query sätter `.wrap` till `100%` under 620 px för iOS och Apple Mail. Tre kolumner används inte: en mening på svenska i 180 px bryts sönder, och Word ignorerar den media query som skulle stapla dem.

### Tillgänglighet

- `html lang="sv"`. En `h1`, en `h2` per sektion, med font och marginal inline.
- Varje `img` har alt. Layout-GIF:er används inte. Tom dekorativ bild får `alt=""`.
- Länktexten är ”Öppna er butik” och ”Vill inte ha fler mejl”.
- Textlänkar är understrukna. Knappen har egen form och kontrast, inte bara färg.
- Brödtext 16 px. Sidfotslänken 13 px i `#57564f`, understruken.
- Preheader i dold div (`display:none; max-height:0; mso-hide:all`) plus utfyllnad så att nästa mening inte läcker in i inbox-förhandsvisningen.
- `text` i `ShopEmail` upprepar samma sektioner, i samma ordning, med URL:en utskriven.

### Sektion för sektion

Bredd 600. Copy-agenten äger formuleringarna; här är struktur, hierarki och vilka fakta som redan finns på sajten.

1. **Preheader.** En mening: butiken finns, med deras namn, och skyltmotorn går att prova. Syns i inboxen, dold i brevet.
2. **Mast.** Namnskylt-PNG vänster, länk till sajten. Höger, mono: `Till {butiksnamn}`. Avsändaren är namnskylt.com; deras logga är ämnet, inte avsändaren.
3. **Hero.** Ögonbryn i mono. `h1` i Georgia, vikt 400, med en kursiv andra sats i samma anda som ”Skriv ditt namn. *Vi graverar resten.*” Ingress 16 px, max cirka 54 tecken per rad. Deras logga på vit platta om `logoUrl` finns. Skyltbild 600 px. Fig-rad. Knapp ”Öppna er butik”. Under: den spårade URL:en i 13 px.
4. **Värde, tre kort.** `h2` ”Det här får ni”. Tre vita kort, staplade, 12 px mellanrum, padding 20×24, 1 px `#ebe8e0`. Ögonbryn + Georgia-rubrik + en mening. Innehåll att fylla från dagens `STEPS` och butiksflödet: egen butik med deras namn och prislista; kunden ser skylten innan gravyr; tillverkningen sköts av Skylt & Gravyrteknik.
5. **Så funkar det, tre steg.** `h2` i Georgia. Siffror `01` `02` `03` som `.number` på startsidan (italic, inte en fylld cirkel i deras varumärkesfärg). Texterna kortas från `HOW_IT_WORKS` i `src/features/home/how-it-works-copy.ts`: skriv namnet, välj material och fäste, vi graverar och skickar inom fem arbetsdagar. Varje steg är en tabellrad: siffra 56 px, text resten.
6. **Socialt bevis.** Inga påhittade citat — sajten har inga. Tre fakta från `home-hero.tsx` och `site-footer.tsx`, centrerade, åtskilda av en mässingslinje: ”Graverade namnskyltar”, ”Korrektur innan gravyr”, ”Tillverkas av Skylt & Gravyrteknik · leverans inom 5 arbetsdagar”. Ett valfritt citatfält renderas bara när en sträng skickas in.
7. **CTA.** En Georgia-rad och samma knapp igen. En mening om att svara på mejlet för egen domän eller egen prislista (finns redan i `buildShopEmail`).
8. **Sidfot.** Signatur från `CompanyProfile` (`name`, `phone`, `email`). Rad från `companyFooter` när `orgNumber` och `address` är ifyllda — de är tomma i `DEFAULT_COMPANY`. Varför mejlet kom. Länk `unsubscribeUrl`. Samma block i `text`.

### Teknikval

**Handskrivna tabellfunktioner.** `project-standards.mdc` listar stacken utan mejlramverk. `package.json` har sharp, resvg och zod, som redan räcker för PNG och validering. Ny logik i `lib/` testas med `node:test` och strängasserts, vilket `shop-email.test.ts` redan gör. En funktion per byggblock (`bulletproofButton`, `heroImage`) håller filen läsbar.

`react-email` (`@react-email/components`, `@react-email/render`) drar in ett eget React-träd och en förhandsvisningsserver bredvid Next 15 / React 19. VML och Outlook-kommentarer blir ändå rå HTML. Strängtesten blir en asynkron render.

MJML (`mjml`) är ett stort kompilatorträd och ett andra märkspråk. `mj-button` ger VML, men serif-rubriker, piller, mörk palett och den ljusa bildbrunnen skrivs ändå som `mj-raw`. Kall kompilering vid varje förhandsvisning ger ingen fördel mot funktionerna som redan finns.

Förhandsvisning utan Resend: admin-route som returnerar `buildShopEmail` för en fixtur-`Shop`, `Content-Type: text/html`. Fixturen kan också skrivas till en lokal HTML-fil med `tsx` om man vill öppna den utan servern.

## 4. Före Resend-kontot

- Rasterisera de två SVG-logotyperna till PNG och lägg dem som statiska filer som mejlet kan peka på med absolut URL mot den lokala sajten.
- Ändra `renderShopMockup` (eller en syskonfunktion) till skylt-PNG 1200 px på `#fbfaf6`, med `shop.profile.name` i gravyren.
- Flytta hex och fontstackar till `theme.ts` och låt `buildShopEmail` använda dem.
- Utöka `shop-email.test.ts` enligt fillistan ovan. Kör `pnpm test`.
- Öppna förhandsvisningen i Apple Mail (ljust och mörkt) och i Outlook. Kontrollera att skylten stannar ljus, att en knapp syns, och att 600 px-bilden inte spiller.

## 5. Beslut

1. Hero som personlig mässingsskylt med butikens namn, i stället för webbläsarmockupen med ”Anna Lindqvist”.
2. Krom i papper och bläck. Deras skrapade färg stannar i butiken och på logoplåten.
3. Mörkt läge enligt tabellen, med ljus bildbrunn. Alternativet är `color-scheme: light only`, som sajten.
4. Beviset är de tre fakta som redan står på sajten, tills ett riktigt citat finns.
5. Bolagsraden i sidfoten. `orgNumber` och `address` är tomma. Utan dem kan mejlet skickas med bara namnskylt.com, telefon och avregistrering — säg till om en juridisk identitet ska vara ett krav.

## 6. Risker

| Risk | Hantering |
|---|---|
| Apple Mail inverterar skyltfotot | `color-scheme` light dark, explicit mörk palett, `.stage` låst till `#fbfaf6` |
| Mörk logga försvinner på papper, ljus logga på mörkt kort | Vit `logoPlate`; två PNG:er för Namnskylt-ordet |
| Word ignorerar radie, serif-fallback och mörk knapp | Georgia finns på Windows; VML-knappen är bläck/vitt; layouten är tabeller |
| Gmail klipper vid ~102 kB | En PNG, komprimerad, ingen andra hjältebild |
| `readableOn` (tröskel 0,4) är inte WCAG för liten text | Deras färg används inte som text. Platta får vit eller bläck efter luminans |
| Trekolumns-kort blir oläsbara | Alltid en kolumn |
| Generisk skylttext ser omassproducerad ut | Gravyr = `profile.name`, alt-texten nämner namnet |

## 7. Beroenden till andra planområden

- **Bild.** Absolut PNG-URL, 1200×visad 600, papper bakom, ingen data-URL. Gränssnitt: `mockupUrl` på `ShopEmailInput`. Motorn är `renderBadgeSvg` + sharp/resvg, inte en skärmdump.
- **Copy.** Ämnesrad, preheader, h1, kortens tre meningar, stegtexter, knappetikett. Designen låser längd (knapp ≤ ~22 tecken, h1 två korta satser) och vilka påståenden som redan är belagda: korrektur, fem arbetsdagar, Skylt & Gravyrteknik.
- **Avsändare och juridik.** `CompanyProfile` och `unsubscribeUrl`. Sidfoten anropar `companyFooter` och visar bara ifyllda fält. List-Unsubscribe-headern hör till sändaren, inte till HTML:en; länken i båda kropparna är den här planens del.
- **Utskick och förhandsvisning.** `ShopEmail` är oförändrat som kontrakt (`subject`, `preheader`, `html`, `text`). Mock-sändaren kan lagra de fälten utan Resend. UTM-taggarna i `tracked()` stannar.
- **Butiksdata.** Namn, logga och `logoPlate` kommer från `Shop`. Saknas logga renderas ingen trasig bild, bara skylten med namnet.
