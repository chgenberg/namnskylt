# 11 — Copywriting och sekvens

## 1. Sammanfattning

Kall sekvens i tre steg till återförsäljare: dag 0 (erbjudandet), dag 4 (ny vinkel: kunden ser skylten innan gravyr), dag 10 (avslut). Tonen är Namnskylts korta sakprosa («Skriv ditt namn. Vi graverar resten.») i Roots mallform: `Hej {{fornamn}}!`, en avsändare, ett ärende, ett svar, avslut med nej-tack. Inga kronor, inga marginalprocent och inget «jag såg att ni…». Plain text är källan; HTML ska använda samma ord.

Budskapet som får sägas: ni säljer graverade namnskyltar i ert namn, med er logga och era färger; ni sätter kundpriset och ser marginalen mot inköpet; inget lager och ingen gravyrutrustning; Skylt & Gravyrteknik tillverkar i Sverige och skickar inom fem arbetsdagar.

## 2. Vad vi återanvänder från Roots

| Källa | Återanvänds | Ändras |
|---|---|---|
| `apps/api/src/lib/outreach/template.ts` | `Hej [Förnamn]!`, fält i hakparentes, saknat förnamn → «Hej!», plain text som källa, HTML ur stycken, footer med nej-tack | Fältnamn blir `{{foretag}}` m.fl. Inget räkneexempel (Roots 35 % är inte vårt). |
| `docs/leads/build_mejlutkast_docx.py` | Kort första mejl, ett CTA, signatur namn/titel/telefon/e-post | Knapp «Jag vill veta mer» byts mot «Svara ja» tills en butikslänk finns. Ingen emoji. |
| `docs/leads/build_personligt_utkast_docx.py` | Personligt mejl 5–7 dagar senare, ny vinkel, inte en upprepning | Vår dag 4 är kalenderdag 4, inte arbetsdagar. |
| `apps/api/src/lib/email/templates.ts` | Kort svenska, en handling, ingen engelska i brödtext | Transaktionella mallar (order, välkomst) kopieras inte. |

## 3. Förslag för Namnskylt

Ny modul `src/lib/outreach/reseller-sequence.ts` (byggs av mejlagenten, inte här). Exporterar stegen nedan som plain text plus ämnesrader. HTML-skalet finns redan i `src/lib/outreach/shop-email.ts` (`preheader` dold, en knapp). Den filen är **demomejlet när butiken redan är byggd** och ska inte skickas i samma vecka som den här sekvensen.

### Fält

| Fält | Regel |
|---|---|
| `{{foretag}}` | Obligatoriskt. Saknas → mejlet får inte godkännas. |
| `{{fornamn}}` | Första ordet i kontaktnamnet, minst 2 tecken. Saknas: «Hej {{fornamn}}!» blir «Hej!». Ämne E dag 0 och C dag 10 tappar namnet (se fallback under tabellerna). |
| `{{segment}}` | `profilbyra` \| `arbetsklader` \| `tryckeri` \| `eventbyra`. Väljer stycke. Skrivs aldrig ut som token. |
| `{{stad}}` | Valfritt. Tomt: stryk « i {{stad}}». |
| Avsändare | `{{avsandare}}` `{{titel}}` `{{telefon}}` `{{epost}}`. Tom telefonrad stryks, som i Roots. |

`{{segment}}` hålls isär från A/B. Samma bokstav A–E följer mottagaren genom alla tre steg.

### Vad meningen får vila på

- Eget varumärke: `ShopFrame` visar återförsäljarens namn, logga, färger och typsnitt (`src/lib/shops/model.ts`, `src/features/shop/shop-frame.tsx`). Egen domän finns som fält (`shop.domain`).
- Kundpris och marginal: påslag −50…+300 % per material (`src/lib/shops/price-list.ts`); à-pris på offert (`src/features/admin/pricing-editor.tsx`); marginal = kundpris minus inköp (`src/lib/orders/purchase.ts`). Gränserna nämns inte i mejlet.
- Inget lager: ordern går till leverantören per skylt (`src/lib/supplier/client.ts`). Ingen lagerkatalog.
- Ingen maskin: tillverkning hos Skylt & Gravyrteknik (`src/components/site-footer.tsx`, `src/lib/supplier/`).
- Fem arbetsdagar: `PRODUCTION_DAYS = 5` i mock-klienten och samma löfte på sajten. Korrektur innan gravyr: `src/lib/quotes/document.ts`.
- 3D och namnlista: `src/features/home/how-it-works-copy.ts`. Magnet «inga hål i plagget» och säkerhetsnål «för event och mässor»: `src/engine/catalog.ts` `MOUNTINGS`.
- «Nöts inte bort som tryck»: `src/features/business/business-copy.ts`.

Skriv inte: kronpriser (modellen i `src/engine/pricing.ts` är indikativ), «35 %», «kunderna ser aldrig vårt namn», «ordrarna går direkt till er», «på en dag», «jag såg på er sajt».

### Ämne och förhandstext

Förhandstexten är det dolda preheader-fältet (samma mönster som `shop-email.ts`). Den upprepar inte ämnet. I plain text finns den inte — första stycket är brödtexten.

**Dag 0**

| | Ämne | Förhandstext |
|---|---|---|
| A | Namnskyltar under ert eget namn | Inget lager och ingen gravyrutrustning. Ni sätter kundpriset. |
| B | Sälj namnskyltar utan egen verkstad | Varje skylt görs på beställning. Skickas inom fem arbetsdagar. |
| C | {{foretag}} — en produkt utan lager | Graverade namnskyltar i ert namn, er logga och era färger. |
| D | En fråga till {{foretag}} i {{stad}} | Skulle namnskyltar passa i det ni redan säljer? |
| E | {{fornamn}}, en kort fråga | Om graverade namnskyltar under {{foretag}}s eget namn. |

Fallback D utan stad: ämne «En fråga till {{foretag}}». Fallback E utan förnamn: ämne «En kort fråga om namnskyltar».

**Dag 4**

| | Ämne | Förhandstext |
|---|---|---|
| A | Kunden ser skylten innan gravyren | 3D-vy och korrektur. Sedan inom fem arbetsdagar. |
| B | Hela teamet från ett kalkylark | Samma design på alla namn. Mängdrabatt på ordern. |
| C | Inget lager av andras namn | Skylten tillverkas först när namnet är beställt. |
| D | Så kan {{foretag}}s butik se ut | Er logga och era färger. Svara så skickar jag länken. |
| E | Fem arbetsdagar, från Sverige | Skylt & Gravyrteknik graverar. Ni behöver ingen maskin. |

**Dag 10**

| | Ämne | Förhandstext |
|---|---|---|
| A | Ska jag stänga ärendet? | Ett ord räcker: ja, eller stäng. |
| B | Sista mejlet om namnskyltar | Svara stäng så hör jag inte av mig igen. |
| C | {{fornamn}}, ska jag släppa det här? | Annars tar jag fram en butik med {{foretag}}s logga. |
| D | Jag lägger ner ärendet om {{foretag}} | Svara ja om ni vill se upplägget innan jag gör det. |
| E | Inte rätt läge just nu? | Svara stäng så tar jag bort er från listan. |

Fallback C utan förnamn: ämne «Ska jag släppa det här?».

### Dag 0 — huvudmejl

```
Hej {{fornamn}}!

{{avsandare}} här, från Namnskylt. Jag skriver till {{foretag}} i {{stad}}.

{{segmentstycke_0}}

Upplägget: ni säljer graverade namnskyltar under ert eget namn. Butiken bär er logga, era färger och ert typsnitt. Ni sätter kundpriset själva och ser marginalen mot inköpet. Inget lager och ingen gravyrutrustning. Varje order tillverkas av Skylt & Gravyrteknik i Sverige och skickas inom fem arbetsdagar.

Svara ja på det här mejlet, så tar jag fram en butik med {{foretag}}s logga.

Vänliga hälsningar
{{avsandare}}
{{titel}} | Namnskylt
{{telefon}}
{{epost}}

Vill ni inte ha fler mejl? Svara nej tack.
```

`{{segmentstycke_0}}`

- **profilbyrå:** Ni säljer redan profilprodukter till företag. En graverad namnskylt till personalen kan ligga i samma erbjudande, i ert namn, utan att ni tar hem ett lager.
- **arbetskläder/brodyr:** Till arbetskläder och brodyr hör en namnskylt. Magnetfäste sitter utan hål i plagget, och skylten graveras först när ni har namnet.
- **tryckeri:** Ni har redan kunden. En graverad namnskylt kompletterar trycket: texten ligger i materialet och nöts inte bort som tryck gör. Ni behöver ingen gravyrutrustning för att sälja den.
- **eventbyrå:** På mässa och event ska namnet gå att läsa direkt. Säkerhetsnål finns för event och mässor, och skylten graveras när namnen är klara — inte till ett lager i förväg.

### Dag 4 — ny vinkel

Skickas bara om dag 0 varken fick svar, «ja» eller «nej tack».

```
Hej {{fornamn}}!

En sak jag inte tog upp förra gången.

Kunden skriver namnet själv och ser skylten i 3D innan något graveras. Korrektur ingår. Ska hela teamet ha skyltar klistrar ni in namn och titel från ett kalkylark — samma design på alla, och mängdrabatt på hela ordern.

{{segmentstycke_4}}

Vill ni se det med {{foretag}}s logga? Svara på mejlet, så skickar jag länken.

Vänliga hälsningar
{{avsandare}}
{{titel}} | Namnskylt
{{telefon}}
{{epost}}

Vill ni inte ha fler mejl? Svara nej tack.
```

`{{segmentstycke_4}}`

- **profilbyrå:** Kunden kan titta på skylten i er butik, med er logga, och godkänna den innan gravyren.
- **arbetskläder/brodyr:** Magnetfästet lämnar inga hål i plagget ni redan sålt eller broderat.
- **tryckeri:** Kunden väljer material och ser skylten innan ni lägger ordern. Texten nöts inte bort som tryck gör.
- **eventbyrå:** Namnlistan kan komma sent. Skyltarna görs då, med säkerhetsnål för event och mässor, och skickas inom fem arbetsdagar.

### Dag 10 — sista

Skickas bara om dag 0 och dag 4 gått ut utan svar och utan nej-tack.

```
Hej {{fornamn}}!

Jag har skrivit två gånger om namnskyltar för {{foretag}}. {{segmentstycke_10}} Jag vill inte fylla er inkorg.

Ska jag stänga ärendet?

Svara stäng så hör jag inte av mig igen. Svara ja om ni vill att jag tar fram butiken med er logga.

Vänliga hälsningar
{{avsandare}}
Namnskylt

Svara nej tack om ni vill avstå direkt.
```

`{{segmentstycke_10}}`

- **profilbyrå:** Det gällde en namnskylt i ert profilsortiment, under ert eget namn.
- **arbetskläder/brodyr:** Det gällde namnskyltar till era kläd- och brodyrkunder, utan lager.
- **tryckeri:** Det gällde graverade namnskyltar som komplement till trycket.
- **eventbyrå:** Det gällde namnskyltar till mässor och event.

### Plain text

Blocken ovan är plain text, tecken för tecken det som ska i `text`. Radbrytning: tom rad mellan stycken, ingen punktlista, inga länkar. HTML får inte lägga till löften. Förhandstexten läggs bara i den dolda raden. Knapp, om den byggs, har samma mening som sista stycket före signaturen: dag 0 «Svara ja», dag 4 «Svara så skickar jag länken», dag 10 ingen knapp (svaret är ordet ja eller stäng).

## 4. Före Resend

Texten kan ligga i `reseller-sequence.ts` och förhandsvisas med mock-avsändaren: tre steg × fyra segment × fem ämnen, plus fallback utan förnamn och utan stad. Granska att ingen tom `{{…}}` överlever och att « i {{stad}}» försvinner. Ingen API-nyckel krävs.

## 5. Beslut

1. Vem som skriver under: namn, titel, telefon, avsändaradress. Utan det skickas inget.
2. Bekräfta meningen «Skylt & Gravyrteknik … inom fem arbetsdagar». Fem dagar sitter i mock-klienten; live-API:t returnerar `estimatedShipDate`. Katalogen har även `producer: "quickbutton"` på mässing, akryl, massiv aluminium och epoxy — det namnet ska inte in i mejlet, men ni måste stå för en-leverantörs-meningen.
3. CTA tills demobutik finns: «Svara ja». När `src/lib/brand/` redan byggt butiken byts dag 0 till demomejlet i `shop-email.ts`, och sekvensen startar inte.
4. Juridisk footer (namn, org.nr, postadress, integritetslänk). Roots har den. Namnskylt har ingen fast identitet i koden, bara `CompanyProfile` per butik.
5. A–E på alla tre steg, eller bara dag 0 och sedan `Re:` på vinnande ämne. Utkasten stödjer båda. Rekommendation: testa A–E på dag 0, låt dag 4 och 10 gå som svar i samma tråd. De fem raderna för dag 4 och 10 används när tråden inte kan fortsätta.

## 6. Risker

| Risk | Hantering |
|---|---|
| Indikativa listpriser citeras i ett senare utkast | Inga kronor och inga procent i de här texterna. Spärra i renderern. |
| «Du sätter marginalen» läses som garanterad procent | Copy säger kundpris och «ser marginalen mot inköpet». Inköpsrabatten ställer återförsäljaren in själv (0–90 %). |
| Fem dagar håller inte i live-API | Beslut 2. Tills ja: meningen får stå, den är samma som sajten. |
| Stad eller förnamn känns påklistrat | Fallback ovan. Hitta aldrig på ett namn. |
| Dag 10 säger «två gånger» fast ett mejl studsade | Skicka dag 10 bara om båda tidigare skick levererats. |
| Helg | Dag 4 och 10 som landar lördag eller söndag flyttas till måndag. Räkna inte om dagen. |
| Dubbel utskick med demomejlet | Sekvens och `buildShopEmail` är två lägen. Aldrig båda samma vecka. |
| Marknadsmejl utan avregistrering | «Svara nej tack» i varje steg. Byt till list-unsubscribe-länk när den finns, utan att ändra brödtexten. |

## 7. Beroenden

- **Leadlista:** måste leverera `foretag`, `segment` (en av fyra), valfritt `fornamn` och `stad`. Annat segment får inte en femte text — det faller tillbaka är ett beslut, inte tyst profilbyrå.
- **Mejlmotor:** renderar som Roots `renderLeadMail` (saknade fält = `missing`, inget skick). HTML-skal och dold förhandstext från `shop-email.ts`.
- **Schemaläggare:** dag 0, +4, +10 kalenderdagar, vardagsflytt, stopp vid svar, ja, nej tack och studs.
- **Demobutik / `src/lib/brand/`:** om länken finns innan dag 0 byts hela steget mot `buildShopEmail`. Dag 4:s «skickar jag länken» förutsätter att någon kan bygga butiken efter ett ja.
- **Juridik och avsändare:** beslut 1 och 4, innan första riktiga skick.
- **Mätning:** spara bokstav A–E per mottagare, samma genom sekvensen, så ämnestestet inte blandas med segment.
