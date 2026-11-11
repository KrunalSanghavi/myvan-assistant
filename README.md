# MyVan Assistant

A live health monitor and diagnostic assistant for a 2018 Honda Odyssey Elite (3.5L V6, 10-speed). It runs in Chrome as an installable app on Android or a laptop and talks to the van through an ELM327-compatible OBD-II adapter.

## What it does

Four tabs: **Home, Health, Codes, More**. On a laptop the tabs become a side menu. Appearance follows your phone (light or dark), or set it under More.

- **Home:** a plain-English status card, then live gauges for coolant, battery, engine speed and road speed. Any reading that goes out of range appears on Home by itself, highlighted, and you can pin any other gauge there.
- **All readings:** about 26 engine readings as a compact list or as tiles, each with a live graph against the normal range for this engine. The graph turns amber or red where a reading was flagged. Tap any reading for a large graph, lowest/average/highest, the normal range, any alert and its troubleshooting steps.
- **Health:** a report card for 15 major parts. Grades come from three sources:
  - the engine computer's own self-test results (OBD-II mode 06), measured against Honda's pass/fail limits
  - trends across your recorded drives: fuel trims, warm-up time, battery and cranking voltage, airflow, idle steadiness, downstream O2 activity and misfire counts per cylinder
  - the part ages you enter
- **Early warnings:** spots slow changes, such as a battery weakening or a cylinder starting to misfire, before a trouble code or warning light appears.
- **Codes:** stored, pending and permanent codes, the freeze frame for the stored code, and step-by-step troubleshooting guides for about 60 common codes. Codes can only be cleared with the engine off and the ignition ON; the app walks you through it and checks engine speed first.
- **More:** connection, VIN, odometer, readiness monitors, alerts this session, the session log (CSV export), backup and restore, units, appearance and help.
- **Demo van:** a simulated Odyssey for trying every screen without the car.

## Adapter

Use a **Bluetooth LE** adapter, such as a Vgate iCar Pro BLE 4.0, Veepeak OBDCheck BLE or OBDLink CX. Older classic-Bluetooth ELM327 adapters can't be reached from a browser. On a laptop, a USB ELM327 adapter also works.

Power use: when you disconnect, the app sends `ATLP` to put the adapter into low-power mode. It never disables the adapter's automatic sleep, and it disconnects by itself after 10 minutes in the background. Unplug the adapter if the van will sit for more than a week or two.

## Install on Android

1. On your phone, open **https://krunalsanghavi.github.io/myvan-assistant/** in Chrome. (It's served by GitHub Pages from `main`, so every merge goes live within a minute or two.)
2. Tap **Install app** in the header, or use **⋮ → Install app**.
3. Open it once while online. After that it works without signal.

On iPhone, use the Bluefy browser, because Safari has no Web Bluetooth.

## Development

The app is static files with no build step. Tooling is only for testing.

```
npm install
npm test        # static checks + Playwright smoke tests against the demo van
npm run serve   # http://localhost:8080
```

- **Backlog:** every roadmap item is a GitHub issue under the `v2.1`, `v2.x` or `v3` milestone. `agent-ready` issues can be built and verified with the demo van; `needs-van` issues need the real vehicle.
- **Changes:** one branch and pull request per issue (`Closes #N`), always branched from `main`. CI runs `npm test` on every PR, and PRs are merged once it passes.
- **Releases:** bump `APP_VERSION` in `index.html` and `VERSION` in `sw.js` together (CI checks they match), then push a tag such as `v2.1`. The Release workflow publishes the notes. Bumping `VERSION` is what makes installed copies refresh.
- **Claude Code:** `CLAUDE.md` describes the codebase; `/ship-enhancement <issue>` and `/release` run the workflow.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app: UI, ELM327 driver, demo emulator, health logic, guides |
| `sw.js` | Offline cache |
| `manifest.json`, `icon-*.png` | App install metadata and icons |
| `ROADMAP.md` | Planned enhancements, each linked to its GitHub issue |
| `tests/`, `scripts/check.mjs` | Smoke tests and static checks (`npm test`) |
| `CLAUDE.md`, `.claude/` | Instructions, agents and workflows for Claude Code |

## Limits

- Standard OBD-II only. ABS/VSA, airbags, body modules, TPMS, Honda Sensing and detailed transmission data need Honda's i-HDS or an enhanced scanner.
- Troubleshooting steps are general guidance, not Honda's service procedures. Exact specs and pinpoint tests are at [techinfo.honda.com](https://techinfo.honda.com).
- Health grades are estimates to help you plan, not guarantees.
- Live data and codes work on other gasoline cars sold in the US from 1996 on, but the normal ranges and guides are tuned for this van.

All data (drive history, notes, maintenance) stays on the device in browser storage.

## License

MIT. See `LICENSE`.
