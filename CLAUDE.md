# MyVan Assistant

Installable web app (PWA) that monitors a 2018 Honda Odyssey Elite over OBD-II through an ELM327 adapter (Web Bluetooth or Web Serial). Owner: KrunalSanghavi. GitHub: `KrunalSanghavi/myvan-assistant` (public).

## Layout
- `index.html`: the whole app in one file: CSS, markup, then one `<script>`. No build step, no framework, no runtime dependencies.
  Script sections, in order (search for `/* ---------- `): helpers and `store`, `PARAMS` (PID table), guides `G`, ELM327 driver, **demo van emulator** (`demo`), real transports, connection flow, polling, alert rules, rendering, sheets, log/CSV, mode 06 self-tests, drive history, maintenance (`MAINT`), component report card (`COMPONENTS`, `TR`), tabs and wiring.
- `sw.js`: offline cache. `VERSION` must match `APP_VERSION` in index.html.
- `tests/`: Playwright smoke tests that drive the demo van. `scripts/check.mjs`: static checks (script parses, versions match, no old branding).
- `ROADMAP.md`: each item links to its GitHub issue.

## Conventions
- Keep everything in `index.html`. Match the existing terse style: `$()` selector, `esc()` for every interpolated string in HTML, template-literal rendering, `store.get/set` (prefixes keys with `odx:`) wrapped in try/catch.
- Internal values are metric; convert at display time with `conv`/`num`/`unitOf`.
- Every new OBD feature must also be emulated by `demo.emulate()` so it can be tested without the van.
- User-facing text: plain English, short sentences, no jargon without explanation. Health advice is guidance, not a guarantee.
- No new external network calls without asking; the app must work offline after first load. Data stays on the device.
- Approved network calls, and nothing else:
  - Recalls (More → Recalls): sends only the VIN to NHTSA (`vpic.nhtsa.dot.gov` decode, `api.nhtsa.gov` recalls), and only when the owner taps Check recalls. Tests mock both; the demo van uses sample recalls and never calls out.
  - Cloud sync (More → Cloud sync, #17): only after the owner signs in with Google. `accounts.google.com` (sign-in popup), `www.googleapis.com` (Drive files in the hidden `appDataFolder`, scope `drive.appdata`), `oauth2.googleapis.com` (revoke on sign-out). `GOOGLE_CLIENT_ID` in index.html must be set for it to work. Tests mock all three; the demo van uses a pretend in-memory cloud. Sync bookkeeping (token, account, change times) uses the `odxsync:` prefix so it never lands in backups.

## Verify
- `npm test` runs static checks plus Playwright on phone (390px) and laptop (1280px) viewports. Locally it uses installed Chrome; CI uses Playwright Chromium.
- Every enhancement adds at least one test in `tests/` exercising it through the demo van.
- Tests fail on any console error or uncaught exception.

## Workflow (see `.claude/skills/`)
- Backlog = GitHub issues, milestones `v2.1`, `v2.x`, `v3`. Labels: `agent-ready` (demo van is enough), `needs-van` (needs real hardware: don't mark done without the owner), `status:in-progress`.
- `/ship-enhancement <issue#>`: branch `feat/<issue#>-<slug>` **from `main`**, implement, test, PR with `Closes #N`, tick ROADMAP.md, merge when CI passes.
- `/release`: when a milestone's agent-ready work is merged, bump `APP_VERSION` and `sw.js` `VERSION` together, tag `vX.Y`; the Release workflow publishes notes.
- Never commit to `main` directly; open a PR. **Merge PRs yourself once CI passes** (`gh pr merge --merge --delete-branch`). Never stack PRs: when a PR's base branch is deleted on merge, GitHub closes the dependent PR. Finish one PR before branching the next.
- Ask the owner before release tags (other than ones they've approved), repo settings changes, or work on held issues (#12 is on hold).
- The repo is public: commit as `KrunalSanghavi <64157848+KrunalSanghavi@users.noreply.github.com>` (set in local git config), never a work email.
- Live site: https://krunalsanghavi.github.io/myvan-assistant/ (GitHub Pages from `main`).
