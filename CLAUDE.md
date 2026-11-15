# MyVan Assistant

Installable web app (PWA) that monitors a 2018 Honda Odyssey Elite over OBD-II through an ELM327 adapter (Web Bluetooth or Web Serial). Owner: KrunalSanghavi. GitHub: `KrunalSanghavi/myvan-assistant` (public).

## Layout
- `index.html`: the whole app in one file: CSS, markup, then one `<script>`. No build step, no framework, no runtime dependencies.
  Script sections start with `/* ---------- `; search for that to find one.
- Honda data finder (#52, #13, #14): **read-only**. `FIND_SAFE` allows only UDS 22, KWP 21, 1A and UDS 19 02. Never add session changes (10), writes (2E), routines (31), resets (11) or clears (14) without asking the owner. The demo van emulates modules 60 (panel), 1E (transmission) and 7E0.
- Security (#64): `index.html` has a Content-Security-Policy `<meta>` with the inline script's SHA-256 hash. **After editing the script, run `npm run csp`**, or `npm run check` fails. A new approved origin goes in `CONNECT` in `scripts/csp.mjs`. No external scripts, no `eval`. CI `security.yml` runs CodeQL, npm audit, gitleaks and a ZAP baseline. Accepted ZAP findings go in `.zap/rules.tsv` with a reason.
- `sw.js`: offline cache. `VERSION` must match `APP_VERSION` in index.html.
- `ROADMAP.md`: each item links to its GitHub issue.

## Android (`android/`)
- Native app for #85; the plan is `docs/android-architecture.md`. Kotlin, Compose, Gradle with `android/gradle/libs.versions.toml`. CI: `.github/workflows/android.yml` (no wrapper yet: it runs a pinned `gradle` from `android/`).
- **Allowlist:** only `:core:obd` produces bytes for the adapter, and only as a `SafeCommand`: OBD modes 01, 02, 03, 06, 07, 09, the fixed AT list, and `FIND_SAFE`. Mode 04, 10, 11, 14, 27, 2E, 31, `ATPP` and `ATMA` can never be added without asking the owner.
- **Fixtures:** after changing `PARAMS`, `parseMsgs`, `FIND_SAFE` or `demo.emulate()`, run `npm run fixtures` and commit the JSON. CI fails if it is stale. Kotlin ports must still match the JS.
- **Modules:** `:core:model` and `:core:obd` are pure Kotlin/JVM. Only `:app` and `:core:testing` (later `:core:bluetooth` and `:service:logger`) may depend on `:core:obd`; features never do. Root `build.gradle.kts` enforces this. Add modules only when their PR arrives.
- No permissions, network calls or analytics beyond what the doc lists for each PR.

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
