# Born Datenlabor

A personal dashboard for a Cupra Born, built on the vehicle data export from the Volkswagen Group
EU Data Act portal. React Native + TypeScript; the same code runs in the browser through
react-native-web.

Everything runs on your device. The export is read locally, reduced to a compact dataset
(about 2 MB) and stored in the browser's IndexedDB. The VIN and the raw records are not stored,
and nothing is uploaded.

## Run it in the browser

```
npm install
npm run web
```

Open http://localhost:5173 and choose the export JSON. The dataset survives reloads; "Export laden"
replaces it with a newer file.

```
npm test          # data layer unit tests
npm run typecheck
npm run build:web # production build in dist/
```

**Never commit an export.** It contains the VIN and a full movement history. `.gitignore` blocks
`data/` and `VSS*.json`; keep exports there or outside the repo.

## What the export contains, and what is derived

The export is a flat list of `{ dataFieldName, value, timestampUtc }` records. For the Born it
delivers state of charge, range, odometer, charge power and state, plug and climatisation state,
charging sessions with power curves, daily/monthly charged energy, warning messages and a
door/window snapshot. It does **not** deliver trips, consumption, positions, outside temperature,
cell voltages, tyre pressure or costs.

So these are computed in `src/data/derive.ts`:

| Figure | How | Caveat |
|---|---|---|
| Trips | Runs of odometer changes at most 10 minutes apart; longer gaps count as the same trip when the distance implies driving | Start time is back-dated by one kilometre's pace |
| Consumption | SoC drop during the trip × capacity ÷ distance | SoC comes in whole percent, so single short trips are imprecise; no per-trip figure under 8 km |
| Capacity | Energy under each power curve ÷ SoC gain, upper quartile over curves with ≥ 30 points gain | Measured before the battery, so slightly above true net capacity |
| Charged energy | Power curve where the car sent one, else SoC gain × capacity | The car sends curves only for the most recent sessions |
| Older sessions | Rebuilt from the charge-power series for the months before the car's session list starts | Marked `derived` |
| Standby loss | SoC drop over parked periods ≥ 12 h without plug or charging | Whole-percent resolution |

## Layout

```
src/data      parse.ts (export → dataset), merge.ts, derive.ts (trips, sessions, aggregates), tests
src/store     dataset context, storage and file picker (.web / .native variants)
src/charts    Bars, XYChart (react-native-svg)
src/screens   Übersicht, Laden, Fahrten, Logbuch, Stand & Klima, Fahrzeug, Signale, Daten, Import
collector/    fetches the portal's 15-minute packages (Node, separate package.json)
src/theme     colour and type tokens
```

## Android / iOS

`npm run setup:native` generates `android/` and `ios/` with the official React Native CLI and
installs the native modules (AsyncStorage, document picker, file system). This script and the
`.native.ts` files have not been run on a device yet.

## GitHub Pages

Every push to `main` runs the tests and deploys the browser build with
`.github/workflows/pages.yml`. In the repository settings, Pages must use **GitHub Actions** as
its source. The published page is only the app: it contains no vehicle data, and a file you load
there stays in your browser.

## Keeping the data current

- **Another export:** "Export hinzufügen" on the Daten tab merges a newer file into what is loaded.
- **Automatically:** the collector in `collector/` fetches the portal's 15-minute packages and the
  dashboard syncs from it. See `collector/README.md`; its sign-in step is not yet tried against the
  real portal.

## Not built yet

Screens from the design that the export cannot fill (map of places, cell voltages, tyre pressure,
costs) and MapLibre. The continuous packages may carry outside temperature and climatisation
energy; charts for those wait for a first real package.
