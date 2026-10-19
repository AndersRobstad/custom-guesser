# Spesifikasjon: Glimt

Dette er den opprinnelige oppgavebeskrivelsen, med tilleggene vi har avtalt underveis samlet i
[Tillegg](#tillegg-avtalt-underveis) nederst. Der tilleggene sier noe annet enn
grunnspesifikasjonen, gjelder tilleggene.

## Mål og konsept

Bygg en Kahoot-lignende, sanntids flerspillerversjon av TimeGuessr der verten laster opp egne
bilder og setter fasit (år + sted), og venner gjetter fra mobilen via en spillkode.

- Ingen innlogging. Hver nettleser får en anonym `clientId` (UUID i `localStorage`). Spillere
  skriver bare et navn når de joiner.
- Verten bygger et spill (N bilder, valgfritt antall) og starter en økt. Økten får en 6-tegns
  kode som spillerne taster inn på forsiden.
- Hver runde: bildet vises på alle skjermer, spillerne setter pin på kart og velger år, fasit og
  poeng avsløres, ledertavle oppdateres.
- Verten styrer tempoet (neste runde / avslør nå), som i Kahoot. Verten kan også spille selv, men
  det er av som standard (verten kjenner fasiten).
- Spillet skal fungere godt på mobil først; vertens skjerm er typisk en laptop koblet til TV.

Utenfor scope i v1: brukerkontoer, offentlig katalog av spill, chat. (Video var opprinnelig
utenfor scope, men er lagt til – se tillegg 3.)

## Arkitektur og stack

All sanntid går gjennom Convex; det skal ikke bygges en egen socket-server i SvelteKit.
Convex-queries er reaktive abonnementer over en WebSocket som klienten åpner selv, så alle
klienter får oppdatert spilltilstand automatisk når en mutation endrer data.

| Lag          | Valg                                              | Merknad                                                                                                  |
| ------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Frontend     | SvelteKit 2 + Svelte 5 (runes), TypeScript strict | `adapter-auto`; deployes til Vercel                                                                      |
| Sanntid + DB | Convex med `convex` + `convex-svelte`             | `useQuery` for live state, mutations for handlinger. Convex-funksjoner i `src/convex/` via `convex.json` |
| Fillagring   | Convex File Storage                               | Opplasting via `generateUploadUrl`; bilder komprimeres klientside til maks ~1600 px / ~400 KB            |
| Kart         | Leaflet + OpenStreetMap-tiles                     | Gratis, ingen API-nøkkel. Klikk/tap setter pin, kan flyttes før innsending                               |
| Avstand      | Haversine i delt `src/lib/scoring.ts`             | Samme kode brukes i Convex og i tester                                                                   |
| Test         | Vitest, `convex-test`, Playwright                 | Se testseksjonen                                                                                         |

Prinsipper:

- Convex er eneste kilde til sannhet. All poengberegning og tilstandsoverganger skjer i
  Convex-mutations, aldri i klienten.
- Fasit (år, koordinater) sendes aldri til spillerklienter før runden er avslørt.
- Tidtaker bruker server-tidsstempler (`roundEndsAt`), klienten teller bare ned visuelt.
  Innsending etter fristen avvises på server (med ~1 s slakk).
- Spillets data ligger i Convex; bare `clientId` ligger i `localStorage`.

## Datamodell

| Tabell     | Felter                                                                                                                                                                                                                                                    | Indekser                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `games`    | `ownerClientId`, `title`, `settings`, `createdAt`                                                                                                                                                                                                         | `by_owner`                            |
| `rounds`   | `gameId`, `order`, `imageId` (storage id for bildet eller videoen), `mediaType?` (`image`/`video`), `posterId?` (stillbilde for video), `answerYear`, `answerLat`, `answerLng`, `answerLabel?`, `caption?`, `roundSeconds?` (tidsgrense for dette bildet) | `by_game_order`                       |
| `sessions` | `gameId`, `hostClientId`, `code` (6 tegn), `status`, `currentRoundIndex`, `roundStartedAt?`, `roundEndsAt?`, `createdAt`                                                                                                                                  | `by_code`, `by_host`                  |
| `players`  | `sessionId`, `clientId`, `name`, `totalScore`, `joinedAt`, `lastSeenAt`                                                                                                                                                                                   | `by_session`, `by_session_client`     |
| `guesses`  | `sessionId`, `roundIndex`, `playerId`, `lat`, `lng`, `year`, `distanceKm`, `yearDiff`, `locationScore`, `yearScore`, `submittedAt`                                                                                                                        | `by_session_round`, `by_player_round` |

`settings` per spill: `roundSeconds` (standard 60, 0 = ingen tidtaker), `yearMin`/`yearMax`
(standard 1999 til inneværende år), `scoring` (parametre fra poengseksjonen), `hostPlays`
(standard false).

`status` for økt: `lobby` → `playing` → `reveal` → (`playing` neste runde) … → `finished`.

Kode: 6 tegn fra `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, unik blant økter som ikke er `finished`,
oppslag er case-insensitivt og tåler mellomrom.

## Spillflyt og regler

1. **Lobby.** Verten starter økt → kode vises stort med QR-kode til `/join?code=XXXXXX`.
   Spillere joiner med kode + navn og vises live.
2. **Start.** Krever minst 1 spiller og minst 1 runde → runde 0, `status = playing`.
3. **Gjetting.** Spillere setter pin og velger år, og trykker Send. Én gjetning per spiller per
   runde. Verten ser «7/9 har svart».
4. **Avsløring.** Når tiden går ut, når alle aktive har svart, eller når verten trykker «Avslør
   nå». Poeng beregnes i samme mutation.
5. **Neste.** Neste runde, eller `finished` med pall og resultatliste etter siste runde.

Kanttilfeller: navn 1–20 tegn og unikt (case-insensitivt); reconnect med samme `clientId` gir
samme spiller; sen join tillatt under `playing`/`reveal`; ingen svar gir 0; tidsutløp via
`ctx.scheduler.runAt` (idempotent); økten står stille hvis verten forsvinner; spillere uten
heartbeat på 45 s regnes ikke med i «alle har svart» (heartbeat hvert 15. sekund).

## Poengsystem

Opptil 5 000 for sted og 5 000 for år per runde.

- Sted: 5 000 hvis `d ≤ d_perfekt`, ellers `round(5000 · e^(−(d − d_perfekt)/k_km))`.
- År: `round(5000 · e^(−Δ/k_år))`, standard `k_år = 4`.

| Oppsett           | d_perfekt | k_km     | Bom på 50 km | Bom på 500 km |
| ----------------- | --------- | -------- | ------------ | ------------- |
| By                | 0,05 km   | 3 km     | 0            | 0             |
| Norge             | 1 km      | 100 km   | 3 063        | 34            |
| Europa (standard) | 5 km      | 500 km   | 4 570        | 1 858         |
| Verden            | 25 km     | 2 000 km | 4 938        | 3 943         |

Lik totalsum: lavest samlet svartid vinner. `src/lib/scoring.ts` er ren og deterministisk.

## Sider og UI

All UI-tekst på norsk. Mobil først for spillersider (360 px), vertssider for laptop/TV (1280 px+).

| Rute                | Hvem    | Innhold                                                                        |
| ------------------- | ------- | ------------------------------------------------------------------------------ |
| `/`                 | Alle    | Kodefelt + «Bli med», og «Lag eget spill»                                      |
| `/join?code=`       | Spiller | Kode forhåndsutfylt, navnefelt, Bli med                                        |
| `/create`           | Vert    | Egne spill + «Nytt spill»                                                      |
| `/create/[gameId]`  | Vert    | Spillbygger: tittel, innstillinger, kartoppsett, runder med dra-for-å-sortere  |
| `/host/[sessionId]` | Vert    | Lobby → runde → avsløring → resultat                                           |
| `/play/[code]`      | Spiller | Venter → gjetting → «Venter på de andre» → poeng og plassering → sluttresultat |

Rundeeditor: flere filer samtidig, EXIF-dato/GPS forhåndsutfylles for bilder, fasit med klikk
på kart + stedssøk (Nominatim, debounce). En runde kan ikke lagres uten fil, år og koordinater.

## Testing og akseptansekriterier

1. **Vitest** for `scoring.ts` (haversine, grenser, monotoni, tabellverdier).
2. **convex-test** for alle mutations og queries (kode, join, tilgang, overganger, gjetning,
   avsløring, fasit-lekkasje).
3. **Playwright E2E** mot lokal Convex: én vert + tre spillere (iPhone 13), tre runder med kjent
   fasit, automatisk avsløring, tidsutløp, reload midt i runden og like sluttresultater overalt.
   Kartfliser og Nominatim mockes lokalt.

Mål: ingen konsollfeil, `svelte-check`, `tsc` og `eslint` uten feil.

---

## Tillegg (avtalt underveis)

### 1. Navn og design

Appen heter **Glimt** («et glimt» – et øyeblikksbilde). Designet er en cyanotypi-blå verden med
papirhvit tekst, og datostempel-oransje (som datoen i hjørnet på gamle kompaktkamerabilder) brukt
bare for tid: årstall, nedtelling og fasit-nålen. Logoen er en kartnål der hodet er en
kameralinse. All UI bygges med et lokalt, headless komponentbibliotek (`src/lib/ui`, Bits UI +
tailwind-variants) med tokens i `src/lib/ui/theme.css`.

### 2. Tidsgrense per bilde

Hvert bilde kan ha sin egen tidsgrense (`rounds.roundSeconds`) som overstyrer spillets standard.
`0` betyr ingen tidtaker for den runden. Tom verdi betyr «bruk spillets standard».

### 3. Video-runder

En runde kan være en kort video i stedet for et bilde.

- **Formater og grenser:** mp4, webm og mov. Maks **30 sekunder** og **50 MB** per klipp.
  Videoer komprimeres ikke i nettleseren. Lengde sjekkes i nettleseren; type, størrelse og
  stillbilde sjekkes på serveren.
- **Stillbilde (poster):** Nettleseren lager et stillbilde fra klippet ved opplasting.
  Stillbildet lagres som `posterId`.
- **Avspilling:** På vertens skjerm (TV) spilles videoen av automatisk, uten lyd og i loop. På
  mobilen vises stillbildet med en «Spill av video»-knapp, så klippet bare lastes ned når
  spilleren vil se det. Det sparer mobildata og Convex-båndbredde (10 spillere × 20 MB = 200 MB
  per runde om alle lastet ned automatisk).
- **Metadata fjernes før opplasting:** MP4/MOV-filer fra mobilen inneholder ofte GPS-posisjon og
  opptaksdato. Siden spillerne får videoen under runden, nøytraliseres `udta`/`meta`/XMP-boksene
  og tidsstemplene i nettleseren før opplasting (uten å endre filstørrelse eller offsets). WebM
  sendes uendret; der finnes sjelden posisjon.
- **Forhåndsutfylling:** År og sted fra metadata forhåndsutfylles bare for bilder (EXIF). For
  video må verten sette år og sted selv.
- **Kompatibilitet:** iPhone-videoer i HEVC (`.mov`) spilles ikke av i alle nettlesere (f.eks.
  Chrome på Android/Windows). Spillbyggeren viser en advarsel når nettleseren ikke kan spille av
  formatet; MP4 (H.264) anbefales.

### 4. Hosting og deploy

Vercel (personlig konto) for frontend, Convex prod-deployment for backend. Deploy med
`npx convex deploy --cmd 'npm run build'` (se README).

### 5. Ende-til-ende i nettleser

I tillegg til Playwright-testen skal et komplett spill kjøres manuelt i nettleseren med én
vert-fane og to «mobil»-faner som deltakere.

### 6. Tekniske avvik fra grunnspesifikasjonen

- **`lastSeenAt` ligger i en egen `presence`-tabell** (også for verten), ikke på `players`.
  Ellers ville hver heartbeat (hvert 15. sekund per spiller) kjøre alle åpne skjermers
  spørringer på nytt. Spillerne leser bare vertens rad; vertens skjerm og «alle har svart»-sjekken
  leser hele tabellen.
- **«Aktiv» måles fra rundestart:** En spiller regnes som aktiv hvis hen har sendt heartbeat de
  siste 45 sekundene _eller_ runden startet for under 45 sekunder siden. Mobiler som låste seg i
  en lang lobby blir dermed ikke avskrevet i det runden starter. En runde uten svar avsløres aldri
  automatisk før tiden går ut.
- **Koder gjenbrukes tidligst 24 timer etter at en økt er ferdig** (strengere enn «unik blant økter
  som ikke er ferdige»), så gamle lenker til `/play/KODE` fortsatt viser riktig spill.
- **`sessions` har i tillegg indeksen `by_game`.**
- **«Avslør nå» og «Neste» sender med runden som vises på skjermen.** Hvis timeren eller en annen
  fane allerede har gjort jobben, skjer ingenting.

### 7. Rekkefølge på bildene

- Rekkefølgen man laster opp i er ikke låst: rundene kan dras eller flyttes opp/ned i spillbyggeren,
  og knappen **«Stokk rekkefølgen»** blander dem én gang (lagres som ny rekkefølge).
- Innstillingen **«Tilfeldig rekkefølge hver gang»** (`settings.shuffleRounds`, av som standard)
  stokker rundene på nytt for hver økt. Stokkingen skjer på serveren når økten opprettes og lagres
  i øktens `roundIds`, så alle spillerne får nøyaktig samme rekkefølge.

### 8. Justerbart poengoppsett

- Nytt kartområde **«Landsdel»** (`perfectKm` 0,5, `kKm` 30) mellom By og Norge, for spill der alle
  bildene er fra én region. Bom på 10 km gir 3 643, 25 km gir 2 210 og 50 km gir 960 poeng.
- Verten velger hvor strengt årstallet teller: **Snill / Normal / Streng** (`kYear` 8 / 4 / 2,
  Normal er standard). Med Streng gir 1 års bom 3 033 og 2 år 1 839 poeng.
- Spillbyggeren viser en live tabell over hva typiske bom gir med valgt oppsett.
- Anbefalt for spill med bilder fra hele Norge og år som er lette å gjette: Kartområde **Norge**
  og Årstall **Streng**.
