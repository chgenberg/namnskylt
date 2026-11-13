# Kundlistan — underlag för utskicket

Källa: `~/Library/Mobile Documents/com~apple~CloudDocs/Namnskylt.com/PROFIL KUNDER 2026.xlsx`
(iCloud). Filen ligger kvar där och kopieras **inte** in i repot — den innehåller personuppgifter.
Importskriptet läser sökvägen från `OUTREACH_LEADS_FILE` i `.env.local`.

## Det här är inte kalla leads
Alla rader är **befintliga kunder** (kolumnen "Blev kund" har datum 2010–2026). De är
profilproduktsåterförsäljare i United Profile-nätverket som redan köper av oss. Det ändrar
budskapet: vi presenterar en ny kanal för en befintlig kund, vi introducerar inte oss själva.
Det stärker också den rättsliga grunden (befintlig kundrelation) — bekräftas i plan 07.

## Blad
| Blad | Rader | Innehåll |
|---|---|---|
| `Blad2` | — | Säljstrategi: 2×2-matris (aktiverat/ej × känd/ej känd), USP:ar, veckoplan |
| `SWE` | 374 | Svenska återförsäljare |
| `Norge` | 157 | Norska återförsäljare (2 åländska) |
| `Övriga PROFILE` | 17 | Nästan tomt — bara löpnummer |
| `Prioriterade` | 9 | Fördjupade poster: orgnr, adress, licens, prioritet, prislista |

## Kolumner i `SWE` och `Norge`
`Företag`, `Telefonnummer`, `Ort`, `Land`, `Kontaktperson`, `Kontakt-mail`, `Hemsida`,
`Blev kund` (Excel-datum), `Aktiverat sortiment` ("Har aktiverat er" / "Har ej aktiverat er"),
`Känd/inte känd` ("JA"/"Ja"/tom), `Kontaktad` (alltid 0), `Kommentar` (tom).
`Prioriterade` har dessutom `Organisationsnummer`, `Adress`, `Postnummer`,
`Sidansvariges mail`, `Licens`, `Prioritet`, `Rabatt`, `Prislista`, `Pris ID`, `Kundnummer`.

## Siffror
- Sverige: 180 har aktiverat vårt sortiment, 194 har inte. 15 markerade som kända.
- Norge: 52 har aktiverat, 105 har inte. 1 markerad som känd.
- E-post finns på i stort sett alla rader. 2 dubbletter i SWE, 3 gratismejladresser totalt.

## Segment — finns redan i listan
Strategifliken definierar fyra segment. De används rakt av som `segment` på leadet:
1. Aktiverat oss, kända
2. Aktiverat oss, ej kända
3. Ej aktiverat oss, kända
4. Ej aktiverat oss, ej kända

Norge kräver ett eget språkbeslut (norsk text eller svensk/engelsk).

## Fällor vid import
- `Hemsida` pekar ofta på United Profile-värdade butiker (t.ex. `w2820-c3116.unite…`), inte på
  återförsäljarens egen sajt. Varumärkesskrapningen ska då gå på **mejldomänen** i stället.
- `Kontaktperson` innehåller på några rader en e-postadress i stället för ett namn.
- Norska rader med `Land = ax` är Åland.
- Organisationsnummer är förstört till `5,57E+09` av Excel i `Prioriterade` — går inte att använda.
- `Aktiverat sortiment` har ibland `&nbsp;` framför texten — trimma.
