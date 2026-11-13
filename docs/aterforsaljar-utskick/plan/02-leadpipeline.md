# 02 — Leadpipeline och utskicksbygge

## 1. Sammanfattning

Roots samlar föreningar i en Excel-flik (`Leadsbas`, ca 12 400 rader), berikar med egna skript, flaggar osäkra rader och skriver säljarflikar som portalen importerar till `outreach_leads`. Namnskylt ska göra samma steg för merchandising-återförsäljare, men som TypeScript i `scripts/` (tsx) som anropar befintlig kod — inte som Python i `docs/`.

Identiteten är **domänen**, inte e-postadressen. Importen läser CSV/XLSX, normaliserar, slår ihop dubbletter, kräver MX på adressen som ska mejlas och fyller logga, färger och saknad e-post från företagets egen sajt via `scrapeCompany` (`src/lib/company/scrape.ts` → `src/lib/brand/`). Rader som är klara skrivs som `draft` i outreach-tabellerna. Inget mejl skickas här, och inget Resend-konto behövs.

`buildShop` anropas inte i pipelinen. En skrapning ska inte skapa en riktig butik.

## 2. Vad vi återanvänder från Roots

Källan är `docs/leads/` i Roots. Underlaget i `underlag/` är gitignorerat (`*`) och ska inte kopieras; det är personuppgifter. Kolumnläget nedan är bara format.

| Steg | Roots | Vad det gör | Med till Namnskylt |
| --- | --- | --- | --- |
| Källa | `Leadslista_kompletterad_v2.xlsx`, flik `Leadsbas` | 21 kolumner. `build_utskick.py` kräver `Säljare Roots`, `E-post 1`, `Kategori` på fasta index | Mönstret: en rubrikrad, namngivna kolumner, avvisa fel version. Index hårdkodas inte |
| Kontaktlista | `Niclas_Maillista_….xlsx` | CRM-export: `Kundnamn`, `Kontaktperson`, `Telefonnummer`, `E-post` (kolumn 4–7). Match på normaliserat namn, sedan e-post | Egen lista vinner över skrapad adress |
| Register | `export_newwave.py` → `newwave_per_rad.json` | Match namn+kommun mot ett klubbregister. Fält: `url`, `confidence`, `emails`, `phones`, `socials`, `shop`, `founded`, `description`, `platform`, `logo`. Hoppar över tvetydiga namn | Ingen motsvarighet. Vi söker inte webben |
| Billig berikning | `enrich_cheap.py` | Egen sajt (eller domän ur företagsmejl, inte gmail). E-post, sociala, grundår. Valfri modell. JSONL, går att återuppta. SSL-verifiering avstängd | Byt ut hela hämtningen mot `safeFetch` / `scrapeCompany`. Behåll JSONL-återupptagning bara om körningen inte skriver till databasen |
| Betald sökning | `enrich_members.py` | OpenAI web search. Efterkontroll: siffran finns på sidan, e-post finns på sidan, MX via `dig` | Bara efterkontrollen av skrapad e-post + MX. Ingen webbsökning |
| Fri sökning | `members_free.mjs` | Bing/Brave/DuckDuckGo via Playwright, mot Newwave-repot | Portas inte |
| Stavning | `spellcheck_names.py` | Modell + andra modell som godkänner. Bara `verified` används | Portas inte. Företagsnamn trimmas, inte rättas av en modell |
| Bygge | `build_utskick.py` | Rensar namn, kastar «slutat», dedupar e-post, MX-dödar adresser, segment, flikar per säljare | Dedup, MX och segment. Inte medlemsmatte, lag-flik eller uppvärmningskalender |
| Godkännande | `build_mejlutkast_docx.py`, `build_personligt_utkast_docx.py` | Word-utkast, inte sändning | Portas inte. Förhandsgranskning hör till mejlmallen |
| Import i appen | `apps/api/src/lib/outreach/excel.ts` | `suggestMapping` på rubrik, `Korrigerat namn` före original, dedup på e-post, tak 20 000 rader. Tabellen `outreach_leads`: `org_name`, `contact_name`, `email`, `website`, `member_count`, `token`, `status` | Samma tvåsteg: gissa kolumn, låt en människa bekräfta innan något sparas |

v1-listan har andra kolumner (`E-post` tidigt, extra org.nr). Skriptet kastar om rubrikerna inte matchar. Det är värt att behålla: hellre stopp än tyst fel kolumn.

## 3. Förslag för Namnskylt

### TypeScript i `scripts/`, inte Python

Ja. Repot har redan `tsx`, `zod` och `node:test`. Python skulle dra in openpyxl och ett eget HTTP-lager som stänger av certifikatkontroll. Logik som ska testas ligger i `src/lib/`, skripten är tunna CLI:er — samma uppdelning som `scripts/db-migrate.ts`.

`scrapeCompany` och `scrapeBrand` importerar `server-only`, som kastar i vanlig Node. Kör därför:

```bash
pnpm exec tsx --conditions=react-server --env-file-if-exists=.env.local scripts/outreach-import.ts …
```

`react-server` pekar `server-only` på tomma `empty.js`. Lägg två npm-skript: `outreach:import` och `outreach:enrich`.

### Filer

Ren logik, utan `server-only`, med test (`*.test.ts`):

- `src/lib/outreach/pipeline/types.ts` — `ResellerLead`, `ColumnMapping`, `CheckReason`
- `src/lib/outreach/pipeline/columns.ts` — `suggestMapping(headers)`, motsvarar Roots `PATTERNS`
- `src/lib/outreach/pipeline/normalize.ts` — namn, sajt, e-post, org.nr, domännyckel
- `src/lib/outreach/pipeline/dedupe.ts` — en rad per domän
- `src/lib/outreach/pipeline/validate-email.ts` — syntax + `resolveMx` från `node:dns/promises`
- `src/lib/outreach/pipeline/ready.ts` — om raden får bli `draft`

Skript:

- `scripts/outreach-import.ts` — fil in, rader ut till `outreach_leads` (status `draft` eller `blocked`)
- `scripts/outreach-enrich.ts` — rader med `enrich_status = 'pending'` och en sajt

`src/lib/spreadsheet/read-table.ts` används idag av namnskyltsimporten i designern (`batch-section.tsx`): max 5 MB, 2 000 rader, första bladet, `.xls` avvisas. De taken ska vara oförändrade default. Lägg en valfri parameter `{ maxBytes, maxRows }` som skriptet sätter till 20 MB / 20 000. Ingen ny xlsx-parser och inget `exceljs`.

### Importmall

Ett blad, rubrik på rad 1. CSV (komma, semikolon eller tab) eller xlsx. Förväntade rubriker, engelska fältnamn i koden:

| Rubrik | Fält | Krav |
| --- | --- | --- |
| Företag | `companyName` | Ja, annars hoppas raden över |
| Webbplats | `website` | Tom tillåten om e-post har egen domän |
| E-post | `email` | Tom tillåten tills berikning hittar en |
| Kontaktperson | `contactName` | |
| Telefon | `phone` | |
| Ort | `city` | |
| Org.nr | `orgNumber` | |
| Källa | `source` | t.ex. `allabolag`, `crm`, `mässa` |
| Segment | `segment` | `personligt` \| `generellt` \| `hoppa-over` |
| Anteckning | `note` | |

`suggestMapping` känner igen `företag`/`kundnamn`/`bolag`, `webbplats`/`hemsida`/`url`, `e-post`/`email`, `kontakt`/`kontaktperson`, `orgnr`/`organisationsnummer`. Okänd fil skrivs inte in förrän mappningen skrivits ut och körningen fått `--yes`. Det ersätter Roots fasta kolumnindex.

Källfiler och JSONL ligger utanför git, till exempel `data/outreach/` med `*` i `.gitignore`. Samma regel som Roots `underlag/.gitignore`.

### Normalisering

- Trimma, enradiga mellanslag. Företagsnamn behåller AB/HB. Inga modellrättade stavningar.
- Webbplats: `parsePublicUrl` i `src/lib/brand/url.ts` (bara http/https, ingen rå IP, inga inloggningsuppgifter). Kasta spårningsparametrar. Spara kanonisk URL.
- Domännyckel: värdnamn i gemener utan `www.`. Är första ledet `shop` eller `webshop` och resten har en prick, använd resten (`shop.firma.se` → `firma.se`). Annan underdomän behålls och flaggas `subdomain`.
- E-post: första giltiga delen efter split på komma, semikolon och mellanslag, utan `mailto:`, gemener. Samma regex-idé som `build_utskick.emails_of`.
- Fripost (`gmail`, `hotmail`, `outlook`, `live`, `yahoo`, `icloud`, `telia`, `spray`, … — listan i `enrich_cheap.FREEMAIL`) är aldrig domännyckel. Adressen får finnas men flaggas `freemail`.
- Org.nr: samma regel som `isCompanyOrgNumber` i `src/lib/company/contacts.ts` (10 siffror, tredje siffran ≥ 2). Annars flagga, spara inte som org.nr.
- Rad med tomt företagsnamn, eller segment/anteckning som matchar `ta ej med` / `hoppa över`, importeras inte.

### Dedup på domän

Roots dedupar **e-post** (`mark_shared`: en behållare, övriga töms och får en kontrolltext) och har unik index `(sender_id, email)`. För återförsäljare är det fel nyckel: samma bolag har `info@` och `anna@` på samma domän, och två listor innehåller ofta samma sajt.

Ordning:

1. Nyckel = domän ur webbplats, annars ur företagsmejl (inte fripost), annars org.nr, annars normaliserat namn (`[^a-z0-9åäö]` bort, som `norm_name`).
2. Flera rader med samma nyckel: behåll raden som har e-post, sedan kontaktperson, sedan längst företagsnamn. Övriga e-postadresser läggs i `extra_emails`. Tappade rader räknas, sparas inte.
3. Samma e-post på två domäner (byrå, delad inkorg): behåll en, den andra får `check = shared-email` och ingen sändningsadress. Samma utfall som `mark_shared`.
4. Mot befintligt: slå upp `shops` på `lower(data->>'domain')` (index `shops_domain` i migrering `011`) och `reseller_accounts.email`. Träff får `segment = hoppa-over` och `check = already-customer`. De mejlas inte.

Föreslagen unikhet i databasen: `(sender_id, domain)` där `domain` inte är null, plus `(sender_id, email)` där `email` inte är null. Schema-planen äger migreringen; nästa lediga id efter `012_shop_editor` är `013`, och det id:t får inte krocka med en annan plans migrering.

### E-postvalidering

Syntax först (`zod` `z.email()`, max 255 tecken). Sedan MX:

```ts
import { resolveMx } from "node:dns/promises";
```

Tomt svar eller `ENOTFOUND`/`ENODATA` = domänen tar inte emot mejl. Cacha per domän i körningen (Roots gör det med `dig` och en tråd-pool). Använd inte `dig` och inte `CERT_NONE`.

Skrapad adress används bara om den står på sidan (`extractContacts` har redan hittat den där) **och** MX finns. Importerad CRM-adress kräver bara syntax + MX; vi låtsas inte att den måste synas på webben. Saknas MX töms `email`, adressen läggs i `note`, `check = dead-mx`.

Rolladresser (`info@`, `order@`, `hej@`, `kontakt@`) är giltiga i B2B. Har raden både ett namngivet personmejl och en rolladress på samma domän vinner personmejlet, rolladressen hamnar i `extra_emails`.

### Berikning: sajt → varumärke

Kandidatsajt: `website`, annars `https://` + domän ur företagsmejl. Ingen fripost, ingen webbsökning, inga PDF:er, inget Bing.

Anropa `scrapeCompany(url)` — inte `scrapeBrand` direkt och inte `buildShop`. `scrapeCompany` ger redan logga (komprimerad, tak `MAX_LOGO_DATA_URL_CHARS` = 600 000), färger, typsnitt, namn, bransch och `contacts` (e-post, telefon, org.nr, adress) via `safeFetch` och SSRF-skyddet i `src/lib/brand/`.

Fyll bara tomma fält. Skriv aldrig över ett importerat företagsnamn; lägg skrapat namn i `site_name`. Skiljer sig namnen mycket, sätt `check = name-mismatch`. Logga och färger sparas alltid om de fanns.

`OPENAI_API_KEY` är valfri. Utan nyckel ger HTML-läsningen ändå färger och logga (`scrapeFetched`); vision och branschtext uteblir. Kör med concurrency 2. Playwright i `renderSite` har budget 28 s per sida — räkna med det, inte med Roots åtta workers mot ren HTML.

Status på raden: `enrich_status` = `pending` | `ok` | `failed` | `skipped`. Omstart hoppar över `ok`. Felmeddelande i `enrich_error` (kort, ingen HTML).

### Vad som skrivs till outreach-tabellerna

En avsändare i `outreach_senders` (namn, titel, svarsadress, mall, `daily_cap`). En rad i `outreach_leads` per domän. Pipeline-fälten, utöver Roots-kolumnerna `org_name`, `contact_name`, `email`, `website`, `token`, `status`, `note`:

- `domain` text
- `extra_emails` text
- `phone` text
- `city` text
- `org_number` text
- `segment` text (`personligt` | `generellt` | `hoppa-over`)
- `source` text
- `logo` text null (data-URL, redan inom taket)
- `colors` jsonb (hex-lista)
- `site_name` text
- `industry` text
- `check_reason` text null
- `enrich_status` text
- `enrich_error` text null

`member_count`, paketpris och 35 %-kalkyl tas inte med. `status` sätts till `draft` när `ready` är sant, annars `blocked`. Segmentförslag: `personligt` om e-post, kontaktperson och logga finns och `check_reason` är tom; annars `generellt` om e-post finns; annars `blocked`. `hoppa-over` rörs aldrig.

`token` skapas vid insert (samma roll som i Roots: nyckel till förslagslänken). Formatet ägs av planen för signerade länkar.

Utdata för granskning före sändning är CSV från skriptet (antal klara, antal flaggade, inga loggdata-URL:er i terminalen). Word-filer byggs inte.

## 4. Förberedelser före Resend

Allt i det här området kan byggas och köras mot en lokal Postgres utan API-nyckel för mejl:

- Tester för mappning, normalisering, dedup, MX-mock och `ready` med påhittade bolag.
- `readTable`-parametern, med oförändrat anrop från designern.
- Migrering av tabellerna (tillsammans med schema-planen) och en import av en liten fixture-CSV.
- Berikning av två–tre publika testsajter, med och utan `OPENAI_API_KEY`, för att se logga och färger på raden.
- Kontroll att en rad med `blocked` inte kan väljas av sändjobbet (sändjobbet finns inte än; pipelinen sätter bara status).

## 5. Beslut som användaren måste ta

1. Var första listan kommer ifrån, och om rubrikerna ovan är mallen eller om en befintlig export ska vara facit.
2. Ska två bolag på samma domän (koncern, butik + webshop) alltid bli en rad, eller ska org.nr få splittra dem när båda finns?
3. Ska logotypen ligga som data-URL på lead-raden (enkelt, upp till ~600 kB per rad) eller som fil i `shop_images` först när en butik skapas?
4. Ska berikningen använda vision (`OPENAI_API_KEY`) eller räcka HTML-logga och CSS-färger i första omgången?
5. En avsändare för hela listan, eller flera rader i `outreach_senders` (som Kent/Niclas/Johan)?

## 6. Risker och hur de hanteras

- **Fel bolag.** Vi hämtar bara sajten operatören eller e-postdomänen pekar på. Ingen sökmotor, inget namn-i-kommun-uppslag som i Newwave. Namnavvikelse flaggas, skrivs inte över.
- **SSRF och döda certifikat.** Roots stänger av TLS-kontroll i `enrich_cheap.py` och `enrich_members.py`. Det kopieras inte. Bara `parsePublicUrl` och `safeFetch`.
- **`server-only` kastar i tsx.** Utan `--conditions=react-server` startar inte berikningen. Dokumentera flaggan i npm-skriptet.
- **Playwright är långsam.** Concurrency 2, `enrich_status` så en avbruten körning fortsätter. Importera inte 12 000 föreningar; det här är en utvald återförsäljarlista.
- **Designerns kalkylark.** Höj inte default-taken i `readTable`. Batch-importen av namn på skyltar ska bete sig som idag.
- **Tunga loggor i Postgres.** `compactLogo` finns redan. Saknas en logga inom taket sparas `null` och mejlet får klara sig utan — raden kan ändå vara `generellt`.
- **Personuppgifter i git.** Källfiler, JSONL och exporter i `data/outreach/` ingorereras. Tester använder påhittade domäner.
- **Redan kund.** Uppslag mot `shops_domain` och `reseller_accounts.email` innan någon rad blir `draft`.
- **Delad eller död adress.** Samma regler som Roots: en sändningsadress, MX-krav, resten i `check_reason`.

## 7. Beroenden till andra planområden

- **Datamodell.** Äger `CREATE TABLE` för `outreach_senders` och `outreach_leads`, unik index på domän och e-post, och migrerings-id efter `012_shop_editor`. Den här planen äger vilka fält pipelinen fyller. `member_count` ska inte återkomma.
- **Operatörs-UI.** Kan senare anropa samma `suggestMapping` / `parseLeads` vid uppladdning, så CLI och portal inte får var sin parser. Tills UI finns räcker skripten.
- **Mejlmall.** Läser `companyName` eller `site_name`, förnamn ur `contactName`, `logo`, `colors`, `industry`. Segment `personligt` förutsätter att mallen tål saknad logga om beslut 3 landar i «ingen data-URL».
- **Förslagslänk och butik.** `token` reserveras här. Själva butiken skapas när återförsäljaren nappar (`buildShop` / inbjudan i `src/lib/shops/` och `src/lib/reseller-auth/`), inte vid berikning.
- **Mock-sändare och Resend.** Läser bara rader med `status = draft` och tom `check_reason`. `blocked` och `hoppa-over` är osynliga för sändning.
- **Takt och jobb.** Berikningens concurrency är lokal. Dagstak och uppvärmning hör till sändaren (`daily_cap` på avsändaren), inte till importen.
- **Avregistrering.** En spärrlista (e-post och domän) måste finnas innan första skarpa sändningen. Pipelinen ska läsa den i dedup-steget tillsammans med befintliga butiker. Vem som äger tabellen `outreach_suppressions` behöver bestämmas i integritetsplanen.
