# MyVan Assistant

A live health monitor and diagnostic assistant for a 2018 Honda Odyssey Elite (3.5L V6, 10-speed). It runs in Chrome as an installable app on Android or a laptop and talks to the van through an ELM327-compatible OBD-II adapter.

## What it does

- **Live:** about 27 engine readings, each drawn against the normal range for this engine, with trend lines that turn orange or red where a reading was flagged.
- **Health:** a report card for 15 major parts. Grades come from three sources:
  - the engine computer's own self-test results (OBD-II mode 06), measured against Honda's pass/fail limits
  - trends across your recorded drives: fuel trims, warm-up time, battery and cranking voltage, airflow, idle steadiness, downstream O2 activity and misfire counts per cylinder
  - the part ages you enter
- **Early warnings:** spots slow changes, such as a battery weakening or a cylinder starting to misfire, before a trouble code or warning light appears.
- **Codes:** stored, pending and permanent codes, plus step-by-step troubleshooting guides for about 60 common codes.
- **Live alerts:** readings that stay out of range for a few seconds.
- **Vehicle:** VIN, protocol, readiness monitors and units.
- **Log:** records a drive and exports it as CSV.
- **Demo van:** a simulated Odyssey for trying every screen without the car.

## Adapter

Use a **Bluetooth LE** adapter, such as a Vgate iCar Pro BLE 4.0, Veepeak OBDCheck BLE or OBDLink CX. Older classic-Bluetooth ELM327 adapters can't be reached from a browser. On a laptop, a USB ELM327 adapter also works.

Power use: when you disconnect, the app sends `ATLP` to put the adapter into low-power mode. It never disables the adapter's automatic sleep, and it disconnects by itself after 10 minutes in the background. Unplug the adapter if the van will sit for more than a week or two.

## Install on Android

1. In this repository, go to **Settings → Pages**, set the source to **Deploy from a branch**, choose `main` and `/ (root)`, and save.
2. On your phone, open `https://<your-username>.github.io/myvan-assistant/` in Chrome.
3. Tap **Install app** in the header, or use **⋮ → Install app**.
4. Open it once while online. After that it works without signal.

On iPhone, use the Bluefy browser, because Safari has no Web Bluetooth.

## Updating

Edit `index.html`, then change `VERSION` at the top of `sw.js` so installed copies pick up the change.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app: UI, ELM327 driver, demo emulator, health logic, guides |
| `sw.js` | Offline cache |
| `manifest.json`, `icon-*.png` | App install metadata and icons |
| `ROADMAP.md` | Planned enhancements |

## Limits

- Standard OBD-II only. ABS/VSA, airbags, body modules, TPMS, Honda Sensing and detailed transmission data need Honda's i-HDS or an enhanced scanner.
- Troubleshooting steps are general guidance, not Honda's service procedures. Exact specs and pinpoint tests are at [techinfo.honda.com](https://techinfo.honda.com).
- Health grades are estimates to help you plan, not guarantees.
- Live data and codes work on other gasoline cars sold in the US from 1996 on, but the normal ranges and guides are tuned for this van.

All data (drive history, notes, maintenance) stays on the device in browser storage.

## License

MIT. See `LICENSE`.
