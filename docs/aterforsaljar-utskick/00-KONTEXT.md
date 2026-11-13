# Återförsäljarutskick — gemensam kontext för planeringsagenterna

## Mål
Bygga en mailagent i Namnskylt (`/Users/christophergenberg/Desktop/Namnskylt`) som skickar
ett snyggt, interaktivt och intresseväckande mejl via Resend till en utvald mängd
**återförsäljare inom merchandising/profilprodukter** i Sverige. Målet: få återförsäljaren att
börja använda Namnskylt-plattformen som en **kanal för att sälja graverade namnskyltar**
(egen återförsäljarbutik, egen prislista, tillverkning sköts av Skylt & Gravyrteknik).

Agenten ska bygga på den befintliga, välfungerande mailagenten i projektet **Roots**
(`/Users/christophergenberg/Desktop/Roots`). Kopiera mönstren, inte koden blint — Namnskylt har
en annan stack.

## Mottagarlistan
Se `01-KUNDLISTA.md`: 531 **befintliga** återförsäljarkunder (374 SE, 157 NO) med fyra
färdiga segment (aktiverat sortiment × känd). Filen ligger i iCloud och kopieras inte in i repot.

## Vi är i förberedelsefasen
Resend-kontot är **inte** uppsatt ännu. Allt ska kunna byggas, testas och förhandsgranskas
med en mock-sändare innan någon API-nyckel eller domän finns.

## Roots — var mailagenten bor
- `apps/api/src/routes/outreach.ts` (712 rader) — outreach-API:t
- `apps/api/src/lib/outreach/` — outreachlogik
- `apps/api/src/lib/email/` — `index.ts`, `resend-sender.ts`, `mock-sender.ts`, `templates.ts`, `types.ts`
- `packages/db/src/schema/outreach.ts` — datamodell
- `apps/web/src/app/(portal)/portal/lead-mejl/page.tsx` — operatörs-UI
- `docs/leads/build_utskick.py`, `enrich_*.py`, `docs/leads/underlag/` — leadpipeline
- `scripts/setup-resend.py`, `.env.example`, `apps/api/src/lib/validate-env.ts`
- `apps/api/src/lib/rate-limit.ts`, `apps/api/src/lib/scheduler.ts`, `apps/api/src/lib/jobs/`
- `apps/api/src/routes/outreach-claim.integration.test.ts`

## Namnskylt — det som finns idag
Stack: Next.js 15 App Router, React 19, TypeScript strict, CSS Modules + `globals.css`, zod,
postgres (`postgres`-paketet, `scripts/db-migrate.ts`), OpenAI, sharp/resvg, playwright-core, pnpm 9, Node 20.
- Projektregler: `.cursor/rules/*.mdc` (läs `project-standards.mdc`)
- Återförsäljarbutiker: `src/lib/shops/`, `src/lib/tenants/`, `src/lib/reseller-auth/` (inbjudan, lösenord, session)
- Återförsäljarsida: `src/app/aterforsaljare/[token]/page.tsx`
- Varumärkesskrapning från webbplats: `src/lib/brand/` (logga, färger, typsnitt)
- Bildrendering av skyltar: `src/lib/images/badge-shot.ts`, `logo-plate.ts`; motorn i `src/engine/`
- Signerade länkar: `src/lib/auth/signed-pass.ts`, `src/lib/site-gate/token.ts`
- Offert: `src/lib/quotes/`; admin: `src/app/admin/`

## Regler för dig som planeringsagent
- **Läs-bara mot kod.** Skriv endast din egen planfil (sökväg anges i din uppgift).
- Skriv på **svenska**. Var konkret: filvägar, tabellnamn, funktionsnamn, env-variabler.
- Struktur i din planfil:
  1. Sammanfattning (3–5 meningar)
  2. Vad vi återanvänder från Roots (filer + vad som ska ändras)
  3. Förslag för Namnskylt (konkret: filer, typer, flöden)
  4. Förberedelser som kan göras **före** Resend-kontot
  5. Beslut som användaren måste ta (max 5)
  6. Risker och hur de hanteras
  7. Beroenden till andra planområden (01–16)
- Max ca 250 rader. Inga utfyllnadsstycken.
