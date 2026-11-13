# 07 — GDPR, marknadsföringslagen och avsändarkrav

Praktisk checklista för ett B2B-utskick i Sverige. Inte juridisk rådgivning. Punkter märkta **[Bekräfta]** är bedömningar användaren tar själv, gärna med jurist, innan första skarpa mejlet.

## 1. Sammanfattning

Utskicket är marknadsföring till företag som inte bett om det. För en funktionsadress (`info@`, `order@`) hos ett aktiebolag är den vanliga vägen berättigat intresse (GDPR art. 6.1 f) plus marknadsföringslagen (MFL) 19 §, som kräver förhandssamtycke för fysiska personer och alltid en giltig avregistreringsadress — även till juridiska personer. Enskild firma och namngiven anställd är fysiska personer. Där stannar utskicket.

Roots har en sidfot som ber mottagaren svara «nej tack», samtidigt som agenten inte läser svar (`packages/db/src/schema/outreach.ts`). Det mönstret kopieras inte. Namnskylt har redan en avregistreringslänk i `src/lib/outreach/shop-email.ts`, men den är ` /avregistrera?butik=<slug>`, sidan finns inte, och kommentaren att Resend fyller i länken stämmer inte för det enskilda mejl-API:t som Roots och plan 03 använder. Resend lägger bara på avregistrering i utskick till en publik lista.

Varje skarpt mejl ska ha avsändarens juridiska namn, org.nr och postadress, en svensk sidfot med länk till `/integritet`, en signerad engångslänk och headrarna `List-Unsubscribe` + `List-Unsubscribe-Post`. En spärrlista på normaliserad e-post kontrolleras före varje sändning. Gmails krav på one-click och spam under 0,3 % gäller avsändare med minst 5 000 mejl per dygn till Gmail. Med dagstak 20–40 är vi under gränsen, men samma headrar byggs nu så att ett senare volymlyft inte byter väg.

## 2. Vad vi återanvänder från Roots

| Roots | Vad det gör | Till Namnskylt |
|---|---|---|
| `apps/api/src/lib/outreach/template.ts`, `FOOTER_TEXT` | Sidfot som alltid läggs på, utanför den redigerbara texten. Länk till `roots.nu/integritet`. Avregistrering = svara «nej tack». | Behåll att sidfoten inte går att redigera bort. Byt texten mot länk + informationsplikt. Svarslådan är reserv, inte mekanismen. |
| `apps/api/src/lib/deletion-tokens.ts` | HMAC `userId.exp.sig`, `timingSafeEqual`, hemlighet minst 16 tecken, prod kastar om den saknas, ingen hårdkodad prod-default. TTL 14 dagar för att ångra kontoradering. | Samma signering för avregistreringstoken. TTL 14 dagar är fel här: länken i ett skickat mejl måste gälla hela lagringstiden. |
| `apps/api/src/lib/deletion-purge.ts` | Anonymiserar användare (tombstone-mejl), behåller det bokföringen kräver, audit-rad. | Tombstone bara på lead-raden vid raderingsbegäran. Ordrar, offerter och `reseller_accounts` rörs inte. |
| `apps/api/src/lib/lead-retention.ts` | `HAIR_LEAD_RETENTION_DAYS` default 730, raderar håranalys-leads. Cron `lead-retention` i `scheduled-tasks.ts`. | Mönstret env + cutoff + loggad räkning. 730 dagar och hård radering gäller inte det här utskicket, och Namnskylt har ingen schemaläggare. |
| `apps/api/src/lib/email/resend-sender.ts` | `from`, `to`, `subject`, `html`, `text`, `reply_to`. Inga headrar. | Lägg `headers` på `EmailMessage` och i JSON-kroppen till `POST /emails`. |
| `routes/outreach.ts` send-loopen | Claim, sedan Resend. Ingen spärrlista. `declined` är manuell status per rad. | Uppslag i `outreach_suppressions` innan claim. Träff blir `skipped` + lead `suppressed`, inte `failed`. |

`src/lib/auth/signed-pass.ts` signerar ett fast syfte med ett lösenord (sajtkod). Den binder inte e-post och har ingen utgångstid. Avregistrering får en egen modul i samma HMAC-stil som `deletion-tokens.ts`. `equal()` i `signed-pass.ts` är tidsjämförelsen att efterlikna i ren Node (`node:crypto` `timingSafeEqual`).

## 3. Förslag för Namnskylt

### Vem som får mejlet

**[Bekräfta]** Första vågen går bara till en funktionsadress hos en juridisk person. Skicka inte förrän användaren skrivit under den meningen.

| Mottagare | Får ett kallt mejl | Grund i checklistan |
|---|---|---|
| `info@` / `order@` / `inkop@` hos AB, och org.nr som `isCompanyOrgNumber` i `src/lib/company/contacts.ts` godkänner (10 siffror, tredje siffran ≥ 2) | Ja, ett mejl | MFL:s samtyckeskrav träffar fysiska personer. GDPR: funktionsadress utan personnamn är i regel inte en personuppgift. Länk och avsändare krävs ändå. |
| HB/KB, samma typ av funktionsadress | **[Bekräfta]** Ja, om namnet eller org.nr visar handels- eller kommanditbolag | Bolaget är juridiskt person. Delägarens eget namn i mottagarfältet är det inte. |
| Enskild firma, personnummer (tredje siffran 0–1), namn utan bolagsform och utan org.nr | Nej | Den näringsidkaren är en fysisk person. MFL kräver förhandssamtycke. Mjukt samtycke från ett tidigare köp finns inte här. |
| Namngiven anställd (`anna@`, «Hej Anna») | Nej | **[Bekräfta]** Säkrare läsning: mejlet riktas till en fysisk person. GDPR gäller oavsett, eftersom namn och personadress är personuppgifter. |
| Gmail, Hotmail, Outlook, iCloud, Yahoo, Live, Telia, Spray | Nej | Fripost är i praktiken en fysisk persons brevlåda och räknas i Gmails spam-kvot. Plan 02 flaggar `freemail` och låter adressen vara kvar. Sändgrinden släpper den inte. |

Plan 02, avsnittet om e-postval, låter ett namngivet personmejl vinna över rolladressen på samma domän. Det är fel håll för det här utskicket. Sändadressen är rolladressen. Den personliga adressen sparas inte; saknas rolladress får raden `check_reason = named-person` och blir inte `ready`. Exportera `isCompanyOrgNumber` (den är privat idag) och använd den i både pipelinen och sändgrinden.

Lokaldelar som räknas som roll: `info`, `order`, `orders`, `inkop`, `kontakt`, `hej`, `hello`, `sales`, `salj`, `support`, `kundtjanst`, `post`, `office`, `kontor`, `ekonomi`, `faktura`, `admin`. Allt annat är `named` tills en människa klassar om. Klassningen ligger på leadet (`contact_kind`: `role` \| `named`). Plan 06 äger kolumnen; lägg den i `013_outreach` innan migreringen körs.

### Sidfot, avsändare, informationsplikt

`buildShopEmail` i `src/lib/outreach/shop-email.ts` får en fast sidfot i HTML och text, utanför det som en operatör kan skriva om. Förslag:

> {juridiskt namn}, org.nr {orgnr}, {postadress}. Vi mejlar {företag} för att ni säljer profilprodukter och vi bedömer att en kanal för graverade namnskyltar är relevant för er. Uppgifterna kommer från {källa}. Rättslig grund: berättigat intresse. Så hanterar vi uppgifterna: {origin}/integritet. Inga fler sådana här mejl: {avregistreringslänk}. Det räcker med ett klick.

`{källa}` tas från leadets `source`: `webbplats` → «er öppna webbplats», `allabolag` eller annat register → «ett öppet företagsregister». **[Bekräfta]** att formuleringen stämmer med var listan faktiskt kom ifrån. Påståendet får inte säga att de anmält sig.

Avsändaren är den personuppgiftsansvarige, inte bara ett förnamn. `DEFAULT_COMPANY` i `src/lib/company/profile.ts` har tomt org.nr, tom adress och tom e-post. Ny funktion `src/lib/outreach/send-gate.ts`, `outreachBlockers(...)`, returnerar skäl och blockerar godkännande när något av detta saknas: juridiskt namn, org.nr, postadress, från-adress på den verifierade domänen, `contact_kind = role`, tillåten bolagsform, adressen inte spärrad, hemligheten för token satt. Samma `missing`-idé som Roots `renderLeadMail`. Testet i `shop-email.test.ts` utökas så att sidfoten, org.nr och `/integritet` måste finnas.

`src/app/integritet/page.tsx` är en statisk svensk sida (ingen inloggning) som mejlet länkar till. Den täcker art. 14, eftersom uppgifterna inte kommer från mottagaren och informationen ska finnas senast i första mejlet: vem som är ansvarig och hur man når dem, ändamål och berättigat intresse, vilka uppgifter (företagsnamn, org.nr, webbplats, funktionsadress, telefon från öppen källa; logga och färger är bolagets varumärke), mottagare (Resend som biträde i `eu-west-1`, driftvärden), lagringstid, rätt till tillgång, rättelse, radering, begränsning och invändning, att invändning mot direktmarknadsföring stoppar fler mejl, källa, och rätt att klaga hos Integritetsskyddsmyndigheten (imy.se). Biträdesavtalet med Resend godkänns i deras konto innan skarpt utskick. Sidan är en förutsättning för utskicket. Övriga flöden (order, offert) saknar också en integritetssida; det är ett eget beslut, inte den här leveransen.

Påståenden som redan står i mejlet («på en dag», «inom fem arbetsdagar», «klar att sälja från i dag») ska vara sanna. MFL kräver att marknadsföring kan identifieras och inte vilseleder. Copy-planen äger omformulering; sändgrinden gör det inte.

### Signerad avregistrering

`src/lib/outreach/unsubscribe-token.ts` + `unsubscribe-token.test.ts`:

- Format `v1.{base64url(normaliserad e-post)}.{expUnix}.{hex}`.
- HMAC-SHA256 med `OUTREACH_UNSUBSCRIBE_SECRET` (minst 16 tecken). Prod vägrar utfärda och att verifiera om den saknas. Ingen default-sträng.
- `OUTREACH_UNSUBSCRIBE_SECRET_PREVIOUS` verifierar äldre länkar efter rotation, utfärdar inte nya.
- TTL `OUTREACH_UNSUBSCRIBE_TTL_DAYS`, default 730, så länken lever lika länge som leadet.
- Normalisering: `trim` + `lower`, samma som plan 06.

`src/app/avregistrera/[token]/route.ts` exporterar GET och POST (ingen `page.tsx` i samma segment). Båda anropar `suppress`. GET svarar med en kort svensk sida: «Ni får inga fler sådana här mejl från {namn}.» Inget extra klick, ingen inloggning. POST med kropp `List-Unsubscribe=One-Click` (RFC 8058) svarar `200` och `text/plain`. Ogiltig token: GET förklarar att länken inte gäller och att svaret «nej tack» till avsändaradressen räcker; POST svarar `400`. Upprepat anrop på en giltig token är `200`. Formulär där vem som helst skriver in en adress byggs inte — det kan användas för att spärra någon annans adress.

Headrar på varje utskick, satta av sändfunktionen, inte av mallen:

```
List-Unsubscribe: <https://{värd}/avregistrera/{token}>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

`mailto:` tas med i headern först när den adressen läses av en människa. Plan 03 sätter `replyTo` till en riktig inkorg; den är reserven när länken är trasig. Operatören lägger in «nej tack» som manuell spärr samma dag. Agenten läser inte inkorgen, precis som Roots.

### Spärrlista

Plan 06 äger `outreach_suppressions` och `isSuppressed` / `suppress` i `src/lib/outreach/repository.ts`. Innan `013_outreach` körs, utöka check-villkoren så de rymmer det här flödet:

- `reason`: `unsubscribe`, `bounce`, `complaint`, `manual`, `erasure`
- `source`: `link` (GET), `one_click` (POST), `webhook`, `operator`, `import`

E-post är primärnyckel, normaliserad. `insert … on conflict do nothing`. Hård studs (`email.bounced` med permanent typ) och `email.complained` från webhooken i plan 03 skriver en rad innan nästa batch. Mjuk studs skriver ingen spärr (plan 06).

Sändkön anropar `isSuppressed` innan claim. Träff: meddelandet `skipped`, lead `suppressed` om det inte redan är `converted`. Importen (plan 02) gör samma uppslag i dedupen. En spärrad adress som kommer in på nytt blir inte `ready`.

Spärren är per adress, inte per domän. Ett klick på `anna@` ska inte tysta hela AB:t, och ett klick på `info@` tystar den adressen. **[Bekräfta]** Domänspärr är ett manuellt operatörsbeslut, inte en automatisk följd.

**[Bekräfta]** En operatör ska inte kunna klicka bort en spärr och mejla igen. Plan 06 beslut 4 låter en operatör radera raden. Ta bort den knappen. Återöppning är ett eget, loggat beslut med anledning, inte en städåtgärd.

### Intresseavvägning

Vid implementation skrivs mallen till `docs/aterforsaljar-utskick/intresseavvagning.md`. Användaren fyller i hakparenteserna, daterar och namnger vem som beslutade. Dokumentet versionshanteras. Utan ifylld mall går inget skarpt utskick.

1. Ansvarig: [juridiskt namn, org.nr, adress, e-post].
2. Ändamål: ett erbjudande till utvalda återförsäljare av profilprodukter om att sälja graverade namnskyltar i en egen butik.
3. Intresse: nå företag för vilka erbjudandet är konkret (deras logga och sortiment), med en färdig demo.
4. Nödvändighet: bara företagsnamn, webbplats, org.nr och en funktionsadress. Inget personnamn, ingen fripost, inga känsliga uppgifter, ingen automatiserad beslutning.
5. Mottagarens sida: yrkesmässig kontext, ett mejl, synlig avsändare, avregistrering i ett klick, uppgifterna kommer från en öppen källa som anges.
6. Skydd: spärrlista, dagstak, ingen vidareförsäljning av listan, radering enligt avsnittet nedan, Resend i `eu-west-1` med biträdesavtal.
7. Slutsats och datum. Uttryckligen: gäller inte enskild firma och inte namngivna anställda.
8. **[Bekräfta]** att intresset väger över för just den lista som ska användas. En köpt, gammal lista ändrar avvägningen.

### Lagringstid och radering

**[Bekräfta]** Förslag: lead som inte blivit kund ligger i 12 månader efter sista mejlet (`OUTREACH_RETENTION_DAYS`, default 365). Kortare än Roots 730 dagar, eftersom det inte finns ett samtycke eller ett kundförhållande.

`src/lib/outreach/retention.ts`, `purgeStaleOutreach(now)`, med test mot en fejkad klocka:

- Lead utan `reseller_id`, status inte `converted`, senaste mejl äldre än cutoff: nolla `contact_name`, `phone` och fritext som kan innehålla personnamn. Sätt status `expired`. Behåll företagsnamn, webbplats och e-post så att unikhetsindexet i plan 06 hindrar importen från att skapa en ny sändbar rad.
- Importer får inte flytta `suppressed`, `declined` eller `expired` tillbaka till `ready`.
- `converted` och rader med order, offert eller `reseller_accounts` rörs inte. Bokföring hör hemma där, inte i outreach-jobbet.
- Spärraden raderas inte av jobbet. Den finns för att invändningen (GDPR art. 21.2, som är absolut för direktmarknadsföring) och MFL ska kunna hållas. Ändamålet är bara «inte mejla den här adressen igen».

Raderingsbegäran (art. 17), funktion `eraseOutreachLead(email)`:

- Skriv spärr med `reason = erasure`.
- Byt leadets e-post till `expired-{id}@invalid.namnskylt` (samma tombstone-idé som `deletion-purge.ts`), nolla namn, telefon och anteckning.
- Butikens demosida: ta bort e-post och telefon ur `shops.data`. Lämna bolagets namn, logga och färger. **[Bekräfta]** att demobutiken får ligga kvar ospärrad för sökmotorer som idag (sidfoten säger redan att den inte indexeras).
- Svara personen att spärraden behålls så att adressen inte mejlas igen. **[Bekräfta]** den formuleringen.

Namnskylt har inget cron-paket. Körningen är `scripts/outreach-purge.ts` (`tsx`, som `scripts/db-migrate.ts`) och `POST /api/cron/outreach-retention` med `Authorization: Bearer ${CRON_SECRET}`. Tom hemlighet ger 503, samma mönster som webhooken i plan 03. Ingen värd-cron behövs för att bygga och testa.

### Gmail och Yahoo

Krav som gäller när en avsändare skickar **minst 5 000 mejl per dygn** till Gmail respektive Yahoo, och som vi implementerar ändå:

- SPF, DKIM och DMARC med alignment. Plan 03 sätter DMARC `p=none` och `rua`. Det räcker som golv.
- One-click enligt ovan. Marknadsmejl, inte en orderbekräftelse, så undantaget för transaktionsmejl används inte.
- Avregistrering verkställs i samma request, alltså inom Googles två dygn.
- Spam-andel under 0,3 % i Google Postmaster Tools, sikt under 0,1 %. Hård studs och klagomål går direkt till spärren. Dagstak (plan 03 föreslår 20) och en våg utan automatisk påminnelse håller volymen nere.
- `From` på samma domän som DKIM. Plan 03 föreslår `utskick.namnskylt.com`, skilt från butiksdomänen.

**[Bekräfta]** Påminnelsemejl (`template: reminder` i plan 06) ingår inte i första kampanjen. Ett andra mejl till den som inte svarat är fortfarande marknadsföring och kräver samma sidfot. Det är ett eget beslut.

## 4. Före Resend-kontot

Allt utom biträdesavtal, DNS och Postmaster kan byggas mot mock:

- Token-tester: giltig, manipulerad, fel hemlighet, utgången, tidigare hemlighet, versaler i adressen.
- `outreachBlockers` mot tom `DEFAULT_COMPANY`, enskild firma, fripost, namnadress och en spärrad adress.
- `buildShopEmail` innehåller sidfot, org.nr och `/integritet` i HTML och text.
- GET/POST mot routen med en utfärdad token skriver spärr och är idempotent. Mock-sändaren sparar headrarna så ett test kan läsa `List-Unsubscribe-Post`.
- `purgeStaleOutreach` med fast `now` tombstone:ar gamla lead och lämnar spärr och `converted` ifred.
- `/integritet` och intresseavvägningsmallen med hakparenteser. Mallen fylls i av användaren, inte av agenten.
- Förhandsvisningen `GET /api/admin/shops/[slug]/email` visar den nya sidfoten. Den anropar inte Resend.

## 5. Beslut som användaren måste ta

1. **[Bekräfta]** Första vågen är ett mejl till funktionsadress hos AB (och, om ni säger ja, HB/KB). Enskild firma, namngivna anställda och fripost mejlas inte.
2. **[Bekräfta]** Lagring 12 månader för den som inte blir kund. Spärraden ligger kvar efter avregistrering och efter raderingsbegäran. Operatören får inte radera den för att kunna mejla igen.
3. Juridiskt namn, org.nr, postadress och kontaktadress till den personuppgiftsansvarige. De är tomma i `DEFAULT_COMPANY` och ska in i sidfot, `/integritet` och intresseavvägningen.
4. **[Bekräfta]** Var listan kommer ifrån, så att källmeningen i sidfoten är sann. En köpt lista tas om i intresseavvägningen innan den importeras.
5. **[Bekräfta]** Ingen automatisk påminnelse. Demobutiken ligger kvar efter avregistrering, med e-post och telefon borttagna ur butiksprofilen vid en raderingsbegäran.

## 6. Risker och hur de hanteras

- **Roots-foten kopieras.** «Svara nej tack» utan att någon läser inkorgen är en avregistrering som inte finns. Länken verkställer spärren själv. Inkorgen är reserv med manuell spärr samma dag.
- **Osäker länk som redan står i koden.** `unsubscribeUrl: ${origin}/avregistrera?butik=${slug}` i `src/app/api/admin/shops/[slug]/email/route.ts` går att gissa och träffar ingen route. Byt till token-URL. Kommentaren i `shop-email.ts` om att Resend fyller i länken tas bort.
- **Plan 02 väljer personmejl.** Sändgrinden släpper bara `contact_kind = role`. Personadressen skrivs inte till databasen.
- **Spärr som raderas.** Unik e-post på leadet plus status `suppressed` / `expired` som importen inte får återställa. Spärrtabellen är andra låset.
- **Radering som gör att personen mejlas igen.** Tombstone på leadet, riktig adress bara i spärrtabellen, med svaret att spärren behålls.
- **Tom avsändaridentitet.** `outreachBlockers` stoppar godkännande. Mock kan fortfarande förhandsvisa.
- **Spam-kvot.** Fripost är avstängt, dagstak ligger kvar, hård studs och klagomål spärrar direkt. Postmaster kopplas när domänen skickar på riktigt, även om 5 000 per dygn är långt borta.
- **Hemlighet i prod.** Samma regel som Roots P1.8: saknad eller kort hemlighet utfärdar ingen token och gör gamla länkar ogiltiga, i stället för en känd default.

## 7. Beroenden

- **06 Datamodell** äger `013_outreach`. Innan den körs: kolumn `contact_kind`, status `expired`, samt `reason`/`source` enligt avsnittet om spärrlistan. `isSuppressed` och `suppress` anropas härifrån. Den här planen skapar inte en egen tabell.
- **02 Leadpipeline** måste sluta föredra personmejl, släppa inte fripost eller personnummer till `ready`, och läsa spärrlistan i dedupen. `isCompanyOrgNumber` exporteras så båda använder samma regel.
- **03 Operatörs-UI och Resend** äger DNS, DMARC, `replyTo` till en läst inkorg, webhooken `email.bounced` / `email.complained` och biträdesavtalet. `EmailMessage` får `headers`. Mock-sändaren lagrar dem.
- **01 Arkitektur** kräver att spärren träffas före claim så adressen inte blir `failed`. `skipped` är utfallen.
- **Sändningskön** (dagstak, claim) anropar `outreachBlockers` och `isSuppressed` och sätter de två headrarna. Påminnelsesteget är av tills beslut 5 är ja.
- **Mejlmallen** lämnar sidfoten ifred. `utm_campaign` och butikslänken ändras inte här.
- **Butik och inbjudan.** Radering skriver inte om `reseller_accounts`, ordrar eller offerter. Den nollar bara e-post och telefon i butiksprofilen.
