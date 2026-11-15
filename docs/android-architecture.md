# MyVan for Android: architecture (#85)

**Decision:** build a native Android app whose always-on core (Bluetooth link, logging, auto-start, sync, alerts) is Kotlin, with native screens for anything seen while driving. Today's `index.html` is kept inside the app as the parked-only "Garage" screens.

**Basis:** architecture consult with Fable 5.2 on 2026-11-14, from reading the repo and from Android platform knowledge. Nothing has been built or run yet. Items marked *verify* need the van or a console check.

**Owner's answers built in**
- Phone: Google Pixel 11 Pro on current Android. Target the latest SDK; OEM battery-killer work is out of scope.
- The phone is paired with the van's HandsFreeLink, and other people drive the van.
- Distribution: a signed APK on GitHub Releases, sideloaded. Play Store is a possible later step.
- The adapter test (advertising and `ATLP` wake) is planned for 2026-11-15. See section 0 for what it decides.

---

## 0. Blocked on the van test

PR 1 and PR 2 do not depend on this test. **PR 3 (auto-start and sleep) must not start until the results are posted on #85.**

**What to check (about 15 minutes, with nRF Connect on the phone)**
1. Engine off, adapter asleep for 30 minutes or more: does it still advertise?
2. After the app's Disconnect (which sends `ATLP`): does it advertise? Does it wake at ignition on, and how many seconds until it is connectable?
3. Is its Bluetooth address the same after unplugging and replugging?
4. What name and service UUIDs does it advertise? Does a classic "Android-Vlink" entry appear in Bluetooth settings?
5. Does the phone join HandsFreeLink at accessory, or only at ignition on? Before or after the adapter appears?
6. Type `ATDPN` in the app's log: is the protocol 6 (11-bit) or 7 (29-bit)? After a finder run, do live readings resume? (Review item 6.)
7. Does the van have Idle-Stop, and what does engine speed read during a stop? (Review item 2.)

**How each result changes the design**

| Result | Consequence |
|---|---|
| Advertises only when the van is awake | Design stands: adapter presence is the primary trigger. |
| Advertises all the time | Presence would fire whenever the phone is near the parked van. The head unit becomes the primary trigger; presence stays for its background privileges. |
| Does not wake after `ATLP` until replugged | The app never sends `ATLP`. It relies on the adapter's own 30-minute sleep. |
| Address changes | Pair by name and service UUID instead of address. |

---

## 1. Approach

| Option | Verdict |
|---|---|
| TWA wrapper | No. It is still Chrome's Web Bluetooth, so the same disconnects. |
| Capacitor | No. It adds a Node build chain and plugins, and the background service must still be native. |
| Full native rewrite | Not now. About 4,100 lines and 33 Playwright specs would be re-created for screens that already work. |
| **Native core, native driving UI, web Garage** | **Yes.** |

- **Ported to Kotlin (about 500 lines of JS):** `Elm`/`parseMsgs`, the connect sequence, the `PARAMS` decoders, `pollLoop`, `trackDrive`/`endDrive`/trip maths, `evalRules`, `mergeSync` and seal.
- **Reused as-is in a WebView:** health report card, self-tests, codes and freeze frames, maintenance, recalls, Ask, history, shareable report, finder UI.
- **Drift guard:** a script runs the demo van with a seeded clock and writes golden fixtures (ELM reply to decoded value, sample stream to drive summary, merge cases). Playwright and JUnit both check them.
- **Rejected:** running the JS in a hidden WebView inside the service. Timer throttling and renderer kills make it fragile.

## 2. Background connection

- **Service:** a foreground service of type `connectedDevice` with a permanent notification ("Recording this drive · 14 min") and a Stop action.
- **SDK levels:** compile and target the latest stable SDK. minSdk 34 (Android 14), which covers the Pixel and any family phone from the last few years.
- **Permissions:**
  - `BLUETOOTH_CONNECT`
  - `BLUETOOTH_SCAN` with `neverForLocation`
  - `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_CONNECTED_DEVICE`
  - `POST_NOTIFICATIONS`
  - `REQUEST_OBSERVE_COMPANION_DEVICE_PRESENCE`, `REQUEST_COMPANION_RUN_IN_BACKGROUND`, `REQUEST_COMPANION_START_FOREGROUND_SERVICES_FROM_BACKGROUND`
  - `INTERNET`, `WAKE_LOCK`
  - No location, no activity recognition, no boot-started service.
- **BLE or classic:** BLE. The web app already reaches the adapter over BLE (`BLE_SVCS`: FFE0, FFF0, 18F0 and the Vgate UUID). Listings for the iCar Pro 2S disagree on whether it also has classic Bluetooth; the van test settles it. Classic SPP is a later fallback only.
- **Keeping the link:**
  - `connectGatt(autoConnect=false, TRANSPORT_LE)` for the first connect.
  - One serialised GATT queue, high connection priority while polling, 20-byte writes.
  - A partial wake lock only while the engine runs.
- **Reconnect:** `close()` on every drop (including status 133), retry at 1, 2, 5 and 10 seconds, then `autoConnect=true`. The drive stays open, the gap goes in the existing `gapSec`/`partial` fields, and the drive ends after 5 minutes lost.
- **Battery:** on the Pixel, the companion association plus the foreground service should be enough. Setup offers one deep link to set battery use to "Unrestricted".
- **Checkpoint:** saved every 30 seconds, so any kill loses at most 30 seconds.

## 3. Auto-start

| Trigger | Assessment |
|---|---|
| **CompanionDeviceManager presence on the adapter** | **Primary, pending the van test.** One system dialog. Android wakes the app when the adapter appears and allows a background service start. Works for any driver's phone that has the app. |
| **Head unit `ACL_CONNECTED`** | **Fallback, registered alongside.** The owner's phone is paired with HandsFreeLink. A manifest receiver that costs no battery. |
| BLE scan with `PendingIntent` | Reserve. Needs re-arming after reboot or a Bluetooth toggle. |
| Activity Recognition | Rejected. Slow, fires in any vehicle, needs another permission. |

- After any trigger the service checks the van is really on (a `0100` answer, `ATRV` charging voltage). If not, it disconnects and stops within about a minute.
- Engine off for 5 minutes ends the session, with `ATLP` if the van test allows it.

**Other drivers**
- A drive made without a phone running the app is not recorded. Home says so plainly when the odometer jumps between drives.
- The adapter accepts one connection. If two phones with the app are in the van, the second backs off quietly and retries at long intervals.
- If the owner's phone is near the van when someone else drives off, the link drops and the drive is saved as partial after 5 minutes.
- Drive appdata is per Google account, so another driver's phone only shares history if it signs in with the owner's account.
- Full coverage without any phone is what the Raspberry Pi logger (#16) is for.

## 4. Data and sync

- **Room (WAL mode):**
  - `kv(key, json, mtime)` mirrors today's `odx:` keys, so backup files and `myvan-sync.json` stay compatible.
  - `drive(t, carId, json)` uses the same fields `endDrive` writes, with no 400 cap locally.
  - `checkpoint` holds the drive in progress.
- **Sync:** a WorkManager job (network required) runs at drive end, on edits and every 15 minutes. It never touches the adapter.
  - Same file, `SYNC_FORMAT 1`, same merge rules and the same optional passphrase.
  - It re-reads `headRevisionId` just before writing and merges again if it changed. The merge is idempotent, so a lost race heals on the next run.
- **Sign-in:** Google's native `AuthorizationClient` with scope `drive.appdata`. Tokens renew silently, so the hourly popup goes away. Google blocks its sign-in page in WebViews, so the web flow cannot be reused.
- **Bonus:** once sync works, drives logged by the Android app appear in the existing PWA on the laptop.

## 5. One owner of the adapter

- `AdapterLink` in `:core:obd` is a single coroutine reading a priority queue: control (init, `ATLP`), then a diagnostic lease, then polling.
- The finder, self-tests and code reads take a lease. Polling pauses, headers are restored on release, and the lease expires if the UI dies.
- A lease is granted only when speed is 0. It is revoked the moment the van moves.

---

## A. Architecture and modules

**Style:** Clean Architecture with one-way data flow (MVVM). Kotlin coroutines and Flow, Hilt, Room, Compose, WorkManager, a Gradle version catalog and convention plugins in `build-logic`.

| Module | Single responsibility |
|---|---|
| `:app` | Entry point, navigation, Hilt wiring, manifest. |
| `:core:model` | Plain data types (Reading, PidDef, DriveSummary, Finding). Pure Kotlin. |
| `:core:obd` | ELM327 protocol, PID decoders, the command allowlist and `AdapterLink`. Pure Kotlin. **The only code that can produce bytes for the adapter.** |
| `:core:bluetooth` | BLE GATT transport, companion pairing and presence. |
| `:core:domain` | Drive tracker, trip maths, alert rules, engine state machine, repository interfaces. Pure Kotlin. |
| `:core:data` | Room, repositories, settings, Keystore-backed secret store. |
| `:core:network` | The one HTTP client, with the approved-host allowlist. |
| `:core:sync` | Drive appdata client, merge and seal, sync worker, Google authorization. |
| `:core:designsystem` | Theme, big-number components, the "parked only" gate. |
| `:core:testing` | Fake van transport, fixtures, fault scripts. |
| `:service:logger` | Foreground service, auto-start receivers, notification, spoken alerts. |
| `:feature:setup`, `:feature:home`, `:feature:drive`, `:feature:drives`, `:feature:garage`, `:feature:settings` | One screen group each. |

**Dependency direction** (arrows point at what a module may use):

```
:app ──► :feature:*  ──► :core:domain ──► :core:model
  │      :feature:*  ──► :core:designsystem
  ├────► :service:logger ──► :core:obd ──► :core:model
  │                     ├──► :core:bluetooth ──► :core:obd
  │                     └──► :core:domain
  └────► :core:sync ──► :core:domain, :core:network, :core:data
         :core:data ──► :core:domain
```

**Rules, checked in CI by a module-graph assertion:**
- Features never depend on each other.
- Features never depend on `:core:obd`, `:core:bluetooth` or `:core:network`. They see the van through domain interfaces such as `VanSession` and `DiagnosticsGateway`.
- Only `:core:bluetooth` and `:service:logger` depend on `:core:obd`.

Seventeen modules is a lot for one owner. They are created only when their milestone arrives; PR 1 has four.

## B. Safety and compliance

**Driver distraction** (NHTSA visual-manual guidelines, Android for Cars design principles, Play's expectations)
- The default while driving is no screen at all: the phone can stay in a pocket.
- "Moving" is OBD speed above 5 km/h, so no location permission is needed.
- While moving, the only screen is Drive: at most four numbers, one status line, one alert banner. No scrolling, lists, text entry or animation.
- Home, Drives, Garage and Settings show "Available when parked" while moving.
- Alerts are spoken (Android `TextToSpeech` with audio focus ducking) and posted as notifications that need no response. The existing limits are kept: 5-minute cooldown, critical alerts repeat every 2 minutes.
- There is no Android Auto app: Auto has no category for an OBD dashboard. The phone UI follows its principles instead.

**Vehicle safety**
- The link is read-only by construction. `:core:obd` exposes typed requests only; raw strings cannot be sent from outside the module.
- Allowlist: OBD modes 01, 02, 03, 06, 07, 09, a fixed list of AT commands, and `FIND_SAFE` (UDS 22, KWP 21, 1A, 19 02).
- Mode 04 (clear codes), 10, 11, 14, 27, 2E, 31, `ATPP` and `ATMA` do not exist in the Android app. Clear codes stays in the PWA.
- A fuzz test sends random hex and asserts nothing outside the allowlist passes.
- Fail-safe:
  - An adapter that does not identify as ELM327 is refused.
  - Repeated timeouts, `CAN ERROR`, `BUS BUSY` or `BUFFER FULL` stop all sending, with back-off; after three rounds the session ends until the next ignition cycle.
  - The adapter is released on every exit path.

**Security and privacy** (target OWASP MASVS L1, checked with MASTG tests)

| MASVS group | How it is met |
|---|---|
| STORAGE | AI keys and the sync passphrase are encrypted with an Android Keystore AES-GCM key. `allowBackup=false`. No tokens stored (Play services holds them). The VIN is redacted in logs. |
| CRYPTO | AES-GCM and PBKDF2-SHA256, platform providers only, no hard-coded keys. |
| AUTH | Google authorization with the single scope `drive.appdata`; revoked on sign-out. |
| NETWORK | Network security config: no cleartext, system CAs only. An interceptor in `:core:network` rejects any host outside the approved list. The WebView blocks non-approved requests and keeps its CSP. |
| PLATFORM | WebView loads bundled content only, with file and content access off. The bridge uses `addWebMessageListener` restricted to the app's own origin. `PendingIntent`s are immutable. Only the launcher and system-protected components are exported. |
| CODE | R8, pinned dependencies with Gradle verification metadata, Dependabot for Gradle, CodeQL for Kotlin, the existing gitleaks. |
| PRIVACY | No analytics, ads or crash SDKs; crash logs stay on the phone. The VIN goes only to NHTSA on tap and never to an AI provider. |

Network security config cannot allowlist hosts by itself, which is why the interceptor and WebView filter exist.

**Sideloading (the chosen route)**
- The APK is signed with one release key; the release notes carry its SHA-256 so a download can be checked.
- The app makes no update check: that would be a new network call. The owner installs new versions from the Releases page.
- Google's planned verification of developers who distribute outside Play may apply; *verify* before the first public release.

**If published on Play later**
- Foreground service: declare `connectedDevice` with the justification "continuous, user-visible connection to the owner's Bluetooth OBD adapter", plus a short demo video.
- Data safety form: nothing collected by the developer. User-initiated transfers declared: VIN to NHTSA, health facts to the owner's chosen AI provider, sync to the owner's own Drive. Encrypted in transit.
- A privacy policy page is required: `docs/privacy.md`. Worth writing anyway.
- No location, foreground or background. No battery-exemption permission. The wake lock is held only while the engine runs, to stay inside Play's wake-lock vitals.

**Reliability**
- The drive recorder is one state machine (Idle, Connecting, Van-off check, Recording, Engine-off grace, Sleeping), testable with virtual time.
- On process start, a checkpoint younger than 5 minutes resumes; an older one is saved as a partial drive.
- Room schemas are exported and migrations are tested.
- A soak test injects drops, garbage bytes and a kill between checkpoints.
- Home shows "Last drive recorded: yes/no", so silent failure is visible.

## C. UI

| Screen | What it shows | Change from the web app, and why |
|---|---|---|
| **Setup** (first run) | Pick the adapter, allow notifications, pick the van's Bluetooth, battery setting, try the demo van. | New. Replaces the Connect screen; permissions need explaining once. |
| **Home** | "Last drive: today 8:14, 23 min, fully recorded", what needs attention, sync status. | No Connect, Reconnect or Disconnect buttons. Connection is automatic; "Connect now" is in a menu. |
| **Drive** | Speed, engine, coolant, battery, one alert. | Appears by itself when the app is open and the van moves. No Drive mode button, no "keep the app open" text, no wake lock. |
| **Drives** | List of drives, then one drive's detail. | Native, because it is the proof the logger works. |
| **Garage** (WebView) | Health report card, self-tests, codes, maintenance, recalls, Ask, finder, shareable report. | Same screens, parked only. The web tab bar and connect UI are hidden; live values arrive over the bridge. |
| **Settings** | Alerts and voice, cloud sync, units, "What leaves this phone", troubleshooting log, backup. | Sync loses its hourly sign-in messages. |

Bottom bar: Home, Drives, Garage, Settings.

Accessibility: TalkBack labels, text scaling to 200%, status never by colour alone, targets at least 48 dp (76 dp on Drive), contrast at least 4.5:1. Compose UI tests run with accessibility checks on.

## 6. Delivery

- **Layout:** `android/` in this repo. Gradle copies the root `index.html` and fonts into the APK assets, so there is one source.
- **CI:** `.github/workflows/android.yml`, actions pinned by SHA as elsewhere.
- **Signing:** one release keystore, created once by the owner and stored in GitHub secrets, used from PR 2 on. Updates and Google sign-in both depend on the key never changing. Keep an offline copy.
- **Release:** the existing Release workflow also builds the signed APK and attaches it with its checksum. `versionName` comes from `APP_VERSION`.
- **Testing without the van:** golden fixtures on the JVM, plus a "Demo van" transport in debug builds. No emulator in CI.

| PR | Scope | Label |
|---|---|---|
| 1. Foundation | Project, `:core:model`, `:core:obd`, `:core:testing`, fixtures, CI, demo screen. | agent-ready |
| 2. Background logger | BLE transport, foreground service, reconnect, drives in Room, Home and Drives, signed APK on Releases. Started by a button. **Removes the main pain.** | needs-van |
| 3. Auto-start and sleep | Companion pairing, head unit trigger, van-on check, `ATLP`, Setup. **Blocked on the van test.** | needs-van |
| 4. Sync while logging | Native sign-in, worker, Kotlin merge and seal. | agent-ready, then van |
| 5. Drive screen, alerts, Garage bridge | Spoken alerts, parked gate, WebView with leases. | mixed |
| 6. Hardening | Soak tests, MASTG pass, privacy page, second-phone behaviour. | mixed |

## D. Handoff: PR 1

**Branch:** `feat/85-android-foundation`. No Bluetooth and no permissions in this PR, so it does not wait for the van test.

**Files and folders**
```
android/
  settings.gradle.kts  build.gradle.kts  gradle.properties
  gradle/libs.versions.toml  gradle/wrapper/  gradlew  gradlew.bat
  build-logic/convention/      (android app, android library, jvm library, compose, hilt)
  app/                         MainActivity: one Compose screen, "Demo van", live values
  core/model/                  Reading, PidDef, DriveSummary, Finding
  core/obd/                    ByteTransport, ElmCodec, ElmSession, PidTable,
                               SafeCommand, AdapterLink, Poller
  core/obd/src/test/resources/fixtures/   pids.json, transcripts.json
  core/testing/                FakeVanTransport, fault scripts
scripts/android-fixtures.mjs   loads index.html in Playwright, stubs Math.random and
                               performance.now, calls demo.emulate() and each PARAMS f()
.github/workflows/android.yml
```
Also edit `package.json` (add `npm run fixtures`), `.gitignore` (Android build output, `*.jks`), `.github/dependabot.yml` (gradle ecosystem) and `CLAUDE.md` (an Android section: the allowlist rule, the fixtures rule, the module rules).

**CI workflow:** trigger on `android/**`, `index.html` and `scripts/android-fixtures.mjs`. Steps: checkout, JDK 17, Gradle cache, `npm ci`, `npm run fixtures` then `git diff --exit-code` (fixtures are current), `./gradlew test lint assembleDebug`, upload the debug APK as an artifact.

**Acceptance tests**
1. Every PID in `PARAMS` decodes to the same value in Kotlin as in JS, within 0.01.
2. `ElmCodec` parses the same messages as `parseMsgs`, including multi-frame, `NO DATA`, `SEARCHING...` and `UNABLE TO CONNECT`.
3. `SafeCommand` rejects `04`, `10 03`, `2E…`, `31…`, `14…`, `11…`, `ATPP` and 10,000 random hex strings outside the allowlist; it accepts every `FIND_SAFE` example.
4. `AdapterLink`: a lease pauses polling and polling resumes after release; an expired lease is reclaimed; a late reply after a timeout is never given to the next command.
5. Three rounds of timeouts stop all sending.
6. The debug app on an emulator shows changing demo-van values.
7. Existing `npm test` still passes.

**Key files:** `index.html` (ELM327 driver, demo van, transports, connection, polling, rules, finder, drive history, cloud sync sections), `tests/fixtures.mjs` (pattern for driving the demo emulator from Playwright), `.github/workflows/ci.yml` and `release.yml` (conventions for `android.yml`; APK attachment), `scripts/check.mjs`.

## E. Review of the current web app

Ranked by impact. Line numbers refer to `index.html` at v2.13 plus #84.

**1. Sync is switched off while connected (line 3906), and sign-in expires hourly (3825).** This is the owner's complaint. The Drive calls never touch the adapter, so the guard can simply be removed in the PWA now. The hourly popup can only be fixed natively.

**2. Drive ends after 20 seconds of engine off (line 2360), and drives under 2 minutes are dropped.** The Elite may have Idle-Stop. If so, a long red light splits one trip into several, and "resting voltage" is measured after a 20-second stop, which would skew the battery grade. The van test checks this. Fix: end a drive on engine off plus time, not `rpm` alone, and only take resting voltage after a long park.

**3. History is capped at 400 drives (line 2343, and `slice(-400)` in the merge).** With every drive logged that is a few months. The personal baseline learns from the earliest drives, so as old drives fall off it re-learns from newer, possibly already-drifted ones. Fix: save the learned baseline, keep all drives locally and plan a sync format 2.

**4. The finder has no "parked" check, and it pauses live polling for up to 30 minutes (`state.hold`).** Overheat alerts are blind for that time, and it queries airbag, stability and steering modules. Fix: parked only, and interleave a coolant and speed read every few requests.

**5. Finder answers are not matched to the request.** `diagRead` checks only the service byte, not the echoed identifier, and `Elm.send` can hand a late reply to the next command after a timeout. A slow panel answer could be credited to the wrong identifier. Fix: check the echo and re-synchronise after a timeout.

**6. `diagRestore` sends `ATSH7DF` (line 2037).** That is the 11-bit default. If the van's protocol is 29-bit, the default is `ATSHDB33F1`. The van test checks that polling resumes after a finder run.

| Area | Keep or port | Bugs or risks | Improve |
|---|---|---|---|
| Connection and transports | The `{onData, onClose, write, close}` seam; friendly errors; `ATLP` on disconnect; 10-minute background disconnect. | `ATZ` and `ATSP0` on every reconnect is slow; three retries then gives up. | Remember the protocol for fast reconnect. |
| Polling | Fast and slow lists; stale values cleared; fuel median. | One PID per request. | Ask for up to six PIDs per CAN request for about three times the rate. |
| Alerts | Plain wording; Odyssey-specific limits; "Pull over safely". | Debounce counts samples (`ALERT_AFTER`), so it depends on poll speed. | Use seconds. |
| Health and report card | Grades, trends, personal baseline: the app's best part. Stays in JS. | See items 2 and 3. | Store raw 1 Hz data locally so drives can be re-analysed. |
| Finder | `FIND_SAFE` regex; negative-answer text; VIN not saved. | Items 4, 5, 6. | Enforce the allowlist natively as well. |
| Drive history | Summary format; `gapSec`/`partial`; checkpoint. | Whole array rewritten each save. | Room. |
| Maintenance | Service log, Minder codes, tombstones. | None found. | None. |
| Recalls | VIN only on tap; cached; demo never calls out. | Lookup is by model and year, so the list is not specific to this van. | Say so next to the list. |
| Ask / AI | Built-in answers first; no VIN; owner's own key. | Keys sit in `localStorage`. | Keystore on Android. |
| Cloud sync | Merge design; optional passphrase; `odxsync:` separation. | Item 1; passphrase and token in `localStorage`; 6-character minimum; PBKDF2 at 200,000 rounds is below OWASP's current 600,000; no write-race check. | Raise both in format 2, storing the round count in the file. |
| Drive mode | Gap accounting; burn-in shift. | Needs the screen on. | Replaced by the service. |
| Voice | Cooldowns; `spokenText` cleanup. | Stops when the screen locks. | Native `TextToSpeech`. |
| Accessibility | axe tests in both themes; live regions; reduced motion. | None found. | Carry the same checks to Compose. |

**Other feedback**
- The CSP hash, mocked network tests and the "fail on any console error" rule are strong; keep them.
- One 375 KB file with global state suits the PWA. Do not refactor it for Android; share behaviour through fixtures.

## 7. Risks and remaining questions

**Risks**
- The van test may reorder the auto-start triggers or remove `ATLP` (section 0).
- Two copies of the decode logic exist; the fixtures are the mitigation.
- The signing key is a single point of failure: losing it means uninstalling and reinstalling the app.
- Drives made without a phone running the app are missed.

**Questions for the owner**
1. Is leaving clear-codes out of the Android app acceptable?
2. Should a passenger be able to unlock the parked-only screens? Default: no.
3. Should other drivers install the app, and if so signed in to the owner's Google account so the history is shared?
4. Is an in-app "new version available" check against GitHub wanted? It would be a new approved network call. Default: no.
5. The Android OAuth client must be in the same Google Cloud project as the web one to see the same hidden Drive file. *Verify* when creating it.

Sources for the adapter check: [Vgate iCar Pro 2S vs iCar Pro Bluetooth 4.0](https://blog.obdii365.com/2024/09/11/vgate-icar-pro-2s-vs-icar-pro-bluetooth-4-0/), [manuals.plus iCar Pro 2S](https://manuals.plus/ae/1005007606765710), [retailer listing](https://www.desertcart.co.za/products/646274224-icar-pro-2s.md).
