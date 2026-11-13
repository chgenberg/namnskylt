# 05 — Målgrupp och segmentering

## 1. Sammanfattning

Idealkunden är ett svenskt bolag som redan säljer profilprodukter, merch, arbetskläder eller tryck till andra företag, har en publik webbplats och kunder där personal möter människor. Namnskylt är en ny produktlinje i deras namn: egen butik, eget påslag, tillverkning hos Skylt & Gravyrteknik. Företagssidan `src/app/foretag/` talar till slutkunden (”Hej, jag heter Sara”); utskicket talar till återförsäljaren som säljer den upplevelsen vidare.

Första vågen är **40 bolag**, bara spåret med demobutik, med kvot per segment. Kall mejl går till publicerad funktionsadress på bolagets domän. Listan byggs från egna kontakter, öppna medlems- och återförsäljarlistor och manuell webbsök — inte från Roots-skrapningen av namngivna personer.

Poängen är en regel, 0–100, utan personnamn. Människan sätter segment och godkänner raden. Inget skickas för att poängen är hög.

## 2. Vad vi återanvänder från Roots

Roots målgrupp är idrottsföreningar, inte bolag. Mönstret i `docs/leads/build_utskick.py` är det som bär:

| Roots | Tas med | Ändras |
|---|---|---|
| Kolumnen `Segment` är det systemet läser | Ja. Hos oss heter fältet `status` + `send_track` | Värdena nedan, inte föreningssegmenten |
| `Personligt mejl` kräver komplett underlag | Ja | Komplett = webbplats som går att hämta + logga + funktionsadress + segment. Inte medlemsantal |
| `Generellt mejl` när bara e-post finns | Senare våg | Pilot är enbart personligt |
| `Pågående dialog` / `Avtal – skicka inte` / `Skicka inte` | Ja | Dialog och befintlig butik får inget kallmejl |
| Prioritet 1–3 = hur komplett raden är | Ja, som `score` | Kategori A (säljarens magkänsla) ersätts av poängen |
| Död MX, delad adress, slutat/konkurs | Ja | Konkurs/vilande → `status=hoppa`. En rad per domän (agent 02) |
| `docs/leads/underlag/` gitignorerat | Ja | Listan committas aldrig |

Lämnas. `enrich_members.py`, `enrich_cheap.py` och `members_free.mjs` letar namngivna kontaktpersoner och medlemsantal via sök och sidläsning. Det behovet finns inte här, och det är fel sätt att bygga en B2B-lista. `docs/feedback-plans/04-ai-agents/03_lead_scoring.txt` beskriver en poängmotor som aldrig byggdes; principen tas med: regelbas 0–100, nedbrytning i JSON, inga personnamn i poängen.

## 3. Förslag för Namnskylt

### Idealkund

Ett aktiebolag eller handelsbolag med ungefär **2–30 anställda** (arbetshypotes, inte en uppmätt marknad), egen webbplats och ett offert- eller säljflöde mot företag. Ägaren eller säljchefen kan ta in en produktlinje utan en koncernprocess. Bolaget lagerför inte namnskyltar och graverar dem inte själv.

För litet för pilot: enskild firma och rena enmansbolag utan sajt. Enskild firma är en fysisk person i marknadsföringslagen; kall e-post dit hör inte hemma i den här vågen (agent 07 skriver gränsen). För stort för pilot: grossister som säljer till återförsäljare. Vår köpare är återförsäljaren, inte deras leverantör.

**Deras kunder**, samma sex miljöer som `WORKPLACES` i `src/features/business/business-copy.ts`: vård och omsorg, butik, hotell och restaurang, skola och förskola, mässa och event, reception och kontor. Namnskylten är personalidentitet, inte en giveaway. Den beställs om när någon nyanställs. Mängdrabatten gäller hela ordern även när varje skylt har ett eget namn (`VOLUME` i samma fil; trappan 10 / 50 / 200 st i `src/engine/pricing.ts`). Prisfaktorerna där är märkta indikativa tills leverantörens API svarar — segmenttexterna nämner rabatten, aldrig en krona eller en marginalprocent.

**Varför det passar.** Återförsäljaren får en butik (`src/lib/shops/model.ts`: egen slug, egen domän, logga och färger från deras sajt), ett påslag ovanpå mängdrabatten (`src/lib/shops/price-list.ts`) och ser inköp mot kundpris i designern (`PurchaseSummary` i `src/features/designer/sections/order-section.tsx`). Tillverkning och fem arbetsdagars leverans ligger kvar hos Skylt & Gravyrteknik. De säljer ett hål i sortimentet utan att öppna ett graveri.

### Sex segment

`segment` är en enum. Budskapet är en mening som agent 11 skriver ut till mejl. Kall hälsning är ”Hej” plus bolagsnamn, inte förnamn.

| Id | Vem | Budskap | Pilotkvot |
|---|---|---|---|
| `profilbyra` | Profilbyrå / profilproduktbolag. Kärnan. | Era kunder beställer redan något med logga till personalen. Graverade namnskyltar saknas oftast i sortimentet: egen butik, er logga, ert påslag, tillverkning hos Skylt & Gravyrteknik. | 18 |
| `arbetsklader` | Arbetskläder och brodyr. | Namnskylten hör ihop med plagget. När kunden beställer tröjor till butik, vård eller kök kan skylten ligga i samma offert. | 10 |
| `eventbyra` | Event- och mässbyrå med fysisk bemanning. | Besökaren har läst namnet innan värden hunnit säga hej. Graverad skylt i stället för pappersbricka, såld i ert namn. | 6 |
| `reklambyra` | Reklambyrå som faktiskt säljer merch, inte bara kampanj. | Kundens varumärke finns redan. Skylten kan bära deras logga och färger, som en del av uppdraget, utan att ni startar ett graveri. | 4 |
| `tryckeri` | Tryckeri som inte graverar namnskyltar själv. | Tryck nöts bort. Gravyr sitter i materialet. Komplettera trycksakerna med skyltar ni inte producerar. | 2 |
| `skylt` | Skyltföretag. Fasad och lokal, inte person. | Ni skyltar lokalen. Det här är skylten på personen. | 0 |

`skylt` och tryckerier som redan säljer graverade namnskyltar är konkurrenter till verkstaden, inte kanaler. `engraves_in_house=true` diskvalificerar. De två tryckerierna i piloten är en sond, inte ett underlag för att döma segmentet. Renodlade reklambyråer utan merch-signal tas inte med även om kvoten är tom.

### Poäng, 0–100

Förslag: `scoreReseller` i `src/lib/outreach/score.ts`, ren funktion, testad med `node:test`. Indata är fälten nedan. Utdata är `score` och `score_breakdown` (varje post: nyckel, poäng, skäl i en mening). Tak 100 före avdrag, golv 0.

| Post | Max | Regel |
|---|---:|---|
| `segment_fit` | 30 | profilbyra 30, arbetsklader 26, eventbyra 18, reklambyra 14 (22 om sajten visar merch/profilprodukter), tryckeri 12, skylt 8 |
| `assortment` | 15 | Sajten visar att de säljer till företag. +5 om offertformulär eller webbshop syns, inom taket |
| `customer_overlap` | 15 | +5 per träff på vård, butik, hotell/restaurang, kontor, skola, event/mässa, tak 15 |
| `demo_ready` | 15 | 15 om `src/lib/brand/` får en användbar logga från webbplatsen, 8 om sajten svarar men loggan saknas, 0 om sajten inte går att hämta |
| `reach` | 10 | 10 för publicerad funktionsadress på egen domän (`info@`, `order@`, `sales@`, `hej@`, `kontakt@`). 4 om enda adressen är `fornamn.efternamn@` på egen domän. 0 för gmail, hotmail och liknande |
| `source` | 10 | `own_contact` 10, `referral` 8, `spa_memberlist` 6, `supplier_locator` 5, `allabolag` 4, `web_search` 3 |
| `size` | 5 | 2–30 anställda = 5, 31–80 = 3, okänt = 2, 80+ = 2, 1 = 1 |

Avdrag: `engraves_in_house` −40. Bara fri e-post −10.

**Pilotgrinden**, alla måste hålla:

- `score >= 60`
- `demo_ready = 15` (logga finns; annars väntar raden, den fyller inte kvoten)
- funktionsadress på egen domän, MX svarar
- `legal_form` är `ab`, `hb` eller `kb`
- `engraves_in_house` är falskt
- `status` satt till `godkand` av en människa

Poängen föreslår ordning. Den godkänner inte.

### Datafält per återförsäljare

Agent 06 äger DDL för `outreach_leads`. Fälten:

- `company_name`, `website`, `city`, `county`
- `org_number` (valfritt, öppet bolagsregister)
- `legal_form`: `ab | hb | kb | enskild | unknown`
- `employee_band`: `1 | 2-30 | 31-80 | 80+ | unknown`
- `segment`: enum ovan, satt av människa
- `assortment_tags text[]`, `customer_verticals text[]`
- `has_quote_flow boolean`, `engraves_in_house boolean`
- `role_email` — den adress mejlet går till
- `contact_name` null i pilot. Får fyllas bara om namnet står på deras kontaktsida **och** relationen redan finns (`contact_source=own_relationship`). Används inte i kallmejl
- `source`: `own_contact | referral | spa_memberlist | supplier_locator | allabolag | web_search`
- `source_url` — var adressen eller medlemskapet var publicerat
- `score int`, `score_breakdown jsonb`
- `send_track`: `personligt | generellt | dialog | skicka_inte`
- `status`: `kandidat | granska | godkand | hoppa | dialog | kund | avregistrerad`
- `exclude_reason text null`

Lagras inte: mobilnummer från LinkedIn, köpta mejllistor, styrelseledamöters hemadress, gissade förnamn.

### Källor

Tillåtet, i den ordning vi fyller poolen:

1. **Egna kontakter och introduktioner**, inklusive personer Skylt & Gravyrteknik redan känner. De hamnar i `send_track=dialog` eller ett eget brev, inte i kallmallen. Deras kundlista används bara om de sagt ja (beslut nedan).
2. **Svensk Profilproduktförening / SPA.** Bara en medlemsförteckning som är publicerad för att köpare ska hitta bolag: namn, ort, webbplats. Inte export ur en inloggad medlemssida, och inte om sidan säger att den inte får användas för reklam. Kontrollera sidan för hand innan den blir källa.
3. **Öppna ”hitta återförsäljare”-listor** hos profilgrossister. Bolag, ort, sajt. Vi utger oss inte för att vara grossisten.
4. **Allabolag / öppet bolagsregister** som komplement: namn, org.nr, ort, ungefärligt anställda. SNI är ett svagt filter (profilbolag ligger utspridda) och får inte vara listan i sig. Styrelsenamn mejlas inte.
5. **Manuell webbsök.** En sökning, en sajt, kopiera funktionsadressen som bolaget själv publicerat. Hämta sedan startsida och kontaktsida via befintlig `safeFetch` i `src/lib/brand/safe-fetch.ts` (egen user-agent `NamnskyltBot`, bara publika adresser). Ingen sökspindel. `safe-fetch.ts` läser inte `robots.txt`; håll hämtningen till de två sidorna på bolag vi redan valt.

Grafiska branschlistor (till exempel Grafiska Företagen) får användas på samma villkor som SPA: öppen lista, sedan en mänsklig koll att de inte graverar namnskyltar själva.

Otillåtet i den här planen: Playwright mot sökmotorer som i `members_free.mjs`, massuttag av personnamn, köpta listor, LinkedIn-skrap, kallmejl till enskild firma, och mejl till den som redan sagt nej.

### Pilot, 40 bolag

Pool först: **80–120 rader** med bara bolagsnamn, ort, webbplats och källa. Ingen person-e-post i den filen. En människa sätter segment, `engraves_in_house` och `employee_band` (ungefär ett par minuter per rad). Poängsätt. Fyll kvoterna uppifrån inom `score >= 60`. Saknas träffar i en kvot skickar vi färre — vi fyller inte med sämre bolag. Högst **5 bolag per län**, så att vågen inte blir arton Stockholmsbyråer. Ersättare står på kö när varumärkeshämtningen misslyckas.

Ordning ut: högst poäng först, blandade segment samma dag, så att ett ämne inte får hela uppvärmningen. 40 stycken ryms i den takt Roots använde i början (10–20 mejl per dag, `build_utskick.py` ”Läs mig”); den exakta takten äger agent 08.

Våg 2 startar inte förrän operatören läst utfallet per segment. Tumregel: under ett positivt svar per 15 skickade i ett segment pausas det segmentet. Sondkvoterna (tryckeri 2, skylt 0) räknas inte som bevis.

## 4. Förberedelser före Resend

- Lägg listan utanför git, samma idé som Roots `docs/leads/underlag/.gitignore`. Föreslagen sökväg lokalt: `docs/aterforsaljar-utskick/underlag/` (gitignoreras av agent 02).
- Be Skylt & Gravyrteknik om introduktioner och om lov att använda deras kontakter.
- Öppna SPA:s publika medlemslista och anteckna om den får användas. Samma för en grossists återförsäljarlista.
- Märk befintliga butiker i `shops` som `status=kund` så de inte blir kallmejl.
- Skriv en första intresseavvägning (syfte, vilka fält, hur länge, avregistrering) som agent 07 färdigställer. Utan den skickas inget, mock eller inte, till riktiga adresser.
- Räkna igenom 20 kandidater för hand med tabellen ovan innan `scoreReseller` kodas, så vikterna kan justeras mot verkliga sajter.

## 5. Beslut som användaren måste ta

1. Pilot på 40, med kvoterna 18 / 10 / 6 / 4 / 2 / 0, och skyltföretag utanför vågen.
2. Kallmejl bara till funktionsadress, hälsning utan förnamn.
3. Får Skylt & Gravyrtekniks kontakter användas, och i så fall bara som dialog — det kräver deras ja.
4. Hela Sverige med högst 5 per län, eller ett hemmalän först.
5. Våg 2-tröskeln: pausa segment med färre än ett positivt svar per 15 skickade.

## 6. Risker och hur de hanteras

| Risk | Hantering |
|---|---|
| Vi bjuder in ett graveri som konkurrerar med verkstaden | `engraves_in_house` −40 och en mänsklig koll på ordet namnskylt på sajten innan `godkand` |
| Poängen eller en AI-rad (agent 13) sätter fel segment | Segment är ett mänskligt fält. AI får föreslå, inte skriva över |
| För få svar i sondsegmenten tolkas som ett nej | Tryckeri n=2 är märkt sond. Beslut om segment tas bara på profilbyrå och arbetskläder |
| Funktionsadress vidarebefordras till en person och är därmed personuppgift | `source_url` sparas. Rättslig grund och text är agent 07. Enskild firma är redan ute |
| Roots personliga mejl byggde på medlemsantal som ofta var fel | Vi hittar inte på kundantal, omsättning eller ”ni säljer redan namnskyltar” |
| Många småsajter ger ingen logga och piloten krymper | Ersättarkö. Hellre 30 med bild än 40 utan |
| Medlemslista eller dealer locator har villkor mot reklam | Används inte. Källa stryks, poolen fylls från webbsök och egna kontakter |
| `info@` läses av ingen | Vi dömer segment på svar och klick (agent 14), inte på öppningar |

## 7. Beroenden

- **02** import, dedup på domän, död MX, gitignore av underlaget. Portera inte `members_free.mjs`.
- **04** vilka påståenden som faktiskt stämmer (fem dagar, egen butik, påslag, inbjudningslänk). Segmenttexterna citerar inga priser förrän 04 säger att siffran är verklig.
- **06** fälten i avsnitt 3 som kolumner på `outreach_leads`.
- **07** intresseavvägning, MFL mot fysisk person, lagringstid. Den här planen antar funktionsadress till AB/HB/KB och stopp för enskild firma.
- **08** dagstakt som 40 mejl ska rymmas i.
- **11** en mejlvariant per `segment`-id, hälsning utan förnamn, inga krontal.
- **12** demobutiken är pilotgrinden; rad utan logga skickas inte.
- **13** får föreslå segment och en öppningsmening ur `assortment_tags`, granskas av människa, hittar inte på fakta om mottagaren.
- **14** svar och klick per segment före våg 2.
- **15** sändloopen läser bara `status=godkand` och `send_track=personligt` i piloten.
