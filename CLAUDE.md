# MyVan Assistant

Installable web app (PWA) that monitors a 2018 Honda Odyssey Elite over OBD-II through an ELM327 adapter (Web Bluetooth or Web Serial). Owner: KrunalSanghavi. GitHub: `KrunalSanghavi/myvan-assistant` (public).

## Layout
- `index.html`: the whole app in one file: CSS, markup, then one `<script>`. No build step, no framework, no runtime dependencies.
  Script sections, in order (search for `/* ---------- `): helpers and `store`, `PARAMS` (PID table), guides `G`, ELM327 driver, **demo van emulator** (`demo`), real transports, connection flow, polling, alert rules, rendering, sheets, log/CSV, mode 06 self-tests, drive history, maintenance (`MAINT`), component report card (`COMPONENTS`, `TR`), tabs and wiring.
- Security (#64): `index.html` has a Content-Security-Policy `<meta>` with the inline script's SHA-256 hash. **After editing the script, run `npm run csp`**, or `npm run check` fails. A new approved origin goes in `CONNECT` in `scripts/csp.mjs`. No external scripts, no `eval`. CI `security.yml` runs CodeQL, npm audit, gitleaks and a ZAP baseline. Accepted ZAP findings go in `.zap/rules.tsv` with a reason.
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
  - AI answers (Ask about my van, #12): only when the app has no built-in answer, or the owner taps Ask <provider> for more, and only with the owner's own key. Sends the question plus a facts sheet (the health report text and recent drives, never the VIN) to the provider the owner picked: Gemini (`generativelanguage.googleapis.com`, default), Claude (`api.anthropic.com`), ChatGPT (`api.openai.com`) or Grok (`api.x.ai`). Keys live under `odxai:`, so they are never in backups or sync. Tests mock all four; the demo van gives a sample answer and never calls out. "Search Google" is a plain link the owner taps.
  - Voice input (#49, approved by the owner 2026-11-13): the mic button uses the browser's own speech recognition (`SpeechRecognition` / `webkitSpeechRecognition`); on Android Chrome the audio goes to Google only while the mic is listening. No other speech service. Tests fake it. Spoken answers and alerts use the phone's own voice (`speechSynthesis`), with no network call.

## Verify
- `npm test` runs static checks plus Playwright on phone (390px) and laptop (1280px) viewports. Locally it uses installed Chrome; CI uses Playwright Chromium.
- Every enhancement adds at least one test in `tests/` exercising it through the demo van.
- Tests fail on any console error or uncaught exception.
- `tests/a11y.spec.mjs` runs axe-core (WCAG 2.1 A/AA) on every main screen in light and dark mode. New screens or sheets should be added there.

## Workflow (see `.claude/skills/`)
- Backlog = GitHub issues, milestones `v2.1`, `v2.x`, `v3`. Labels: `agent-ready` (demo van is enough), `needs-van` (needs real hardware: don't mark done without the owner), `status:in-progress`.
- `/ship-enhancement <issue#>`: branch `feat/<issue#>-<slug>` **from `main`**, implement, test, PR with `Closes #N`, tick ROADMAP.md, merge when CI passes.
- `/release`: when a milestone's agent-ready work is merged, bump `APP_VERSION` and `sw.js` `VERSION` together, tag `vX.Y`; the Release workflow publishes notes.
- Never commit to `main` directly; open a PR. **Merge PRs yourself once CI passes** (`gh pr merge --merge --delete-branch`). Never stack PRs: when a PR's base branch is deleted on merge, GitHub closes the dependent PR. Finish one PR before branching the next.
- Ask the owner before release tags (other than ones they've approved), repo settings changes, or work on held issues (none are on hold right now).
- The repo is public: commit as `KrunalSanghavi <64157848+KrunalSanghavi@users.noreply.github.com>` (set in local git config), never a work email.
- Live site: https://krunalsanghavi.github.io/myvan-assistant/ (GitHub Pages from `main`).
