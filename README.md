# Glimt – hvor og når?

Et sanntids flerspillerspill i stil med Kahoot × TimeGuessr. Verten laster opp egne bilder (eller
korte videoer) med fasit – år og sted – og vennene gjetter fra mobilen: nål på kartet og årstall.
Første spill: «Hvor og når er Anders».

- **Frontend:** SvelteKit 2 + Svelte 5 (runes), TypeScript strict, Tailwind v4
- **Sanntid og database:** Convex (`convex-svelte`), funksjoner i `src/convex/`
- **Kart:** Leaflet + OpenStreetMap, stedssøk med Nominatim
- **Komponenter:** lokalt, headless komponentbibliotek i `src/lib/ui` (Bits UI + tailwind-variants)
- **Tester:** Vitest (poeng), `convex-test` (backend), Playwright (ende-til-ende)

Spesifikasjonen, med tilleggene som er avtalt underveis, ligger i [`docs/SPEC.md`](docs/SPEC.md).

## Kom i gang lokalt

Krever Node 22+.

```sh
npm install
cp .env.example .env.local   # fylles ut automatisk av `convex dev` under
npx convex dev               # terminal 1: Convex-backend (lokal eller sky), holder funksjonene oppdatert
npm run dev                  # terminal 2: SvelteKit på http://localhost:5173
```

Første gang spør `npx convex dev` hvilket prosjekt du vil bruke. Velg en **lokal** deployment
for utvikling (kjører på `http://127.0.0.1:3210`) eller en sky-deployment. CLI-en skriver
`CONVEX_DEPLOYMENT` og `PUBLIC_CONVEX_URL` til `.env.local`. Den filen skal ikke committes.

Slik spiller du lokalt:

1. Gå til `/create`, lag et spill og last opp bilder. Sett fasit med kartet eller stedssøket.
2. Trykk **Start spill**. Vertsskjermen viser kode og QR-kode.
3. Åpne `/` på mobilen (eller i et annet nettleservindu) og skriv inn koden.

Hver nettleser får en anonym id i `localStorage`. To faner i samme nettleser er derfor samme
spiller. Vil du teste flere spillere på én maskin, kan du bruke private vinduer, andre
nettleserprofiler eller ulike vertsnavn (`localhost`, `127.0.0.1` og LAN-IP-en har hver sin
lagring).

## Skript

| Kommando              | Hva den gjør                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`         | Utviklingsserver                                                                                                          |
| `npm run build`       | Produksjonsbygg                                                                                                           |
| `npm test`            | Alle Vitest-tester (enhet + `convex-test`)                                                                                |
| `npm run test:unit`   | Bare poengberegningen (`src/lib/scoring.test.ts`)                                                                         |
| `npm run test:convex` | Bare backend-testene (`src/convex/game.test.ts`)                                                                          |
| `npm run test:e2e`    | Playwright mot lokal Convex og et produksjonsbygg (`vite build` + `vite preview`). Starter begge selv hvis de ikke kjører |
| `npm run check`       | `svelte-check`                                                                                                            |
| `npm run typecheck`   | `tsc --noEmit`                                                                                                            |
| `npm run lint`        | Prettier + ESLint                                                                                                         |
| `npm run fixtures`    | Lager testbildene i `tests/fixtures/` på nytt                                                                             |

Første gang du kjører E2E: `npx playwright install --with-deps chromium`. E2E-testen mocker
kartfliser og stedssøk, så den trenger ikke nett. Skjermbilder fra kjøringen havner i
`docs/screenshots/`.

## Deploy (Vercel + Convex)

Produksjon består av en Convex prod-deployment og et Vercel-prosjekt. Byggekommandoen i
`vercel.json` (`scripts/vercel-build.sh`) kjører

```sh
npx convex deploy --cmd 'npm run build'
```

Den deployer Convex-funksjonene og bygger SvelteKit med `PUBLIC_CONVEX_URL` satt til
prod-deploymenten.

Engangsoppsett:

1. Lag en **production deploy key** i Convex-dashboardet (Settings → URL & Deploy Key). Den
   trenger minst `deployment:deploy`.
2. Legg den inn i Vercel som `CONVEX_DEPLOY_KEY` for Production:
   `npx vercel env add CONVEX_DEPLOY_KEY production`.
3. Deploy: `npx vercel deploy --prod`. Eller koble Git-repoet til Vercel-prosjektet for
   automatiske deployer fra `main`.

Uten deploy key (f.eks. i previews) bygger skriptet bare frontend. Da må `PUBLIC_CONVEX_URL`
være satt i Vercel-miljøet.

## Justere poengoppsettet

Poengene regnes ut i `src/lib/scoring.ts`, som brukes både av Convex og av testene. Hver runde
gir opptil 5 000 poeng for sted og 5 000 for år:

- **Sted:** 5 000 innenfor `perfectKm`, deretter `5000 · e^(−(d − perfectKm) / kKm)`.
- **År:** `5000 · e^(−Δår / kYear)`.

Verten velger «Kartområde» i spillbyggeren. Valget lagres per spill i `settings.scoring`:

| Oppsett           | `perfectKm` | `kKm` | Passer når …                 |
| ----------------- | ----------- | ----- | ---------------------------- |
| By                | 0,05        | 3     | alle bildene er fra samme by |
| Norge             | 1           | 100   | bildene er spredt i Norge    |
| Europa (standard) | 5           | 500   | bildene er fra hele Europa   |
| Verden            | 25          | 2 000 | bildene er fra hele verden   |

Slik endrer du oppsettene:

- **Endre eller legge til et oppsett:** rediger `PRESETS` i `src/lib/scoring.ts`. Oppdater
  tabelltestene i `src/lib/scoring.test.ts` slik at de matcher de nye verdiene.
- **Gjøre årspoengene strengere eller snillere:** endre `DEFAULT_K_YEAR` (standard 4). Lavere
  tall straffer bom hardere: med 4 gir 1 års bom 3 894 poeng, med 2 gir den 3 033.
- **Bruke egne verdier for ett spill:** `settings.scoring` godtar `preset: 'custom'` med egne
  `perfectKm`, `kKm` og `kYear` via `games.update`.

Endringer i oppsettene gjelder nye økter. En økt tar et øyeblikksbilde av innstillingene når den
startes.

## Struktur

```
src/
  convex/          Convex: schema, spill/runder/økter/spillere + convex-test-tester
  lib/
    scoring.ts     Ren poengberegning (delt av server, klient og tester)
    game.ts        Spillregler og konstanter (koder, navn, grenser, tidsfrister)
    ui/            Komponentbiblioteket (tokens i theme.css)
    map/           Leaflet-kartet
    game/          Spillskjermer for vert og spiller
    builder/       Spillbyggeren
    client/        Klienthjelpere (identitet, klokke, heartbeat, bilder, stedssøk)
  routes/          /, /join, /create, /create/[gameId], /host/[sessionId], /play/[code]
tests/
  e2e/             Playwright-scenarioet
  fixtures/        Genererte testbilder (scripts/generate-fixtures.mjs)
```
