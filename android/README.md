# MyVan for Android

Native Android app for MyVan Assistant (#85). The plan, safety rules and PR list are in [`docs/android-architecture.md`](../docs/android-architecture.md).

This is PR 1, the foundation. It has no Bluetooth and asks for no permissions. The app shows one screen, "Demo van", with live values from the built-in demo van.

## Modules

| Module | What it holds |
|---|---|
| `:app` | `MainActivity` and the Demo van screen. |
| `:core:model` | `Reading`, `PidDef`. Pure Kotlin. |
| `:core:obd` | `ElmCodec`, `PidTable`, `SafeCommand` (the read-only allowlist), `ElmSession`, `AdapterLink`, `Poller`. Pure Kotlin. The only code that makes adapter requests. |
| `:core:testing` | `FakeVanTransport` (the demo van) and fault scripts. |

## Build

There is no Gradle wrapper yet. With JDK 17, Gradle 8.14 and the Android SDK installed:

```
cd android
gradle test lint assembleDebug
```

CI does this on every change to `android/`, `index.html` or the fixture script, and keeps the debug APK as a download.

## Fixtures

The Kotlin decoders are ports of the JavaScript in `index.html`. `npm run fixtures` (from the repo root) runs the JS in a browser and writes what it produced to `core/obd/src/test/resources/fixtures/` and `core/testing/src/main/resources/demo-van.json`. The Kotlin tests check against those files. Run it after changing `PARAMS`, `parseMsgs`, `FIND_SAFE` or the demo van, and commit the result.
