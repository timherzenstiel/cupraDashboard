# Collector

Keeps the dashboard current. Every 15 minutes it downloads the new data package from the
Volkswagen Group EU Data Act portal, stores what changed, and serves the result to the dashboard
on this computer.

**Status:** the download, storage and serving logic is tested against a stand-in for the portal
(`npm test`). The sign-in step and the calls to the real portal have **not** been run yet, because
they need your account. Expect to report back what happens on the first run.

## One-time preparation on the portal

The one-time "complete export" is not enough. On
[eu-data-act.drivesomethinggreater.com](https://eu-data-act.drivesomethinggreater.com/):

1. Sign in and make sure the vehicle is linked under **Data clusters → Vehicle overview**.
2. Create a **continuous** data request with a frequency of **15 minutes**.
3. Choose the **All Data** preset.
4. Wait until the first packages appear. This can take from minutes up to a few days.

## Run it

```
cd collector
npm install
npx playwright install chromium   # the browser the collector drives
npm run login                     # a browser window opens: sign in yourself, it closes when done
npm start                         # fetch now, then every 15 minutes, and serve the data
```

Then open the dashboard's **Daten** tab, leave the address at `http://localhost:8787` and press
**Verbinden**. The dashboard asks the collector again every 15 minutes while it is open.

Other commands: `npm run once` (fetch once and exit), `npm run serve` (serve what is already
there, without fetching).

Options: `--vin <VIN>` if the account has several vehicles, `--port <n>`, `--data <folder>`,
`--origin <url>` to allow another address of the dashboard.

## What it stores, and where

Everything goes into `data/` at the repository root, which git ignores:

| Path | Content |
|---|---|
| `data/collector-profile/` | The browser profile holding your portal session. Treat it like a password. |
| `data/packages/` | Every downloaded package, unchanged. |
| `data/continuous.json` | All value changes with the time of their package, in the export's format. |
| `data/collector-state.json` | Which packages are done, and a short log. |

The collector never asks for or stores your password: you type it into the portal's own page in
the browser window. When the session expires, `npm start` says so and you run `npm run login` again.

## Privacy

The local server listens on this computer only (`127.0.0.1`) and answers only pages from the
dashboard's own addresses (`localhost:5173`, `localhost:4173`, `timherzenstiel.github.io`). Other
websites open in your browser cannot read the data.

Safari does not let a page loaded over https talk to `http://localhost`. Use Chrome, Edge or
Firefox for the GitHub Pages version, or run the dashboard locally with `npm run web`.

## Open points

- Field names in the packages differ from the one-time export. The dashboard maps charge level,
  odometer, range, charge power, plug state and outside temperature using names from the portal's
  data dictionary; these still need checking against a real package from the Born.
- Interface details (paths, headers) follow the open-source Home Assistant integration
  [HA_VAG-EU-Data-Act](https://github.com/TommiG1/HA_VAG-EU-Data-Act) (MIT). The portal offers no
  documented interface, so it can change without notice.
