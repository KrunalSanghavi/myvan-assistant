import { defineConfig, devices } from "@playwright/test";

// Locally we use the installed Chrome so no browser download is needed; CI installs Playwright's Chromium.
export default defineConfig({
  testDir: "tests",
  timeout: 30000,
  workers: process.env.CI ? undefined : 3, // more parallel browsers make the demo van's timing flaky locally
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: { channel: process.env.CI ? undefined : (process.env.PW_CHANNEL || "chrome"), headless: true, acceptDownloads: true },
  webServer: { command: "npx --yes http-server -p 8123 -c-1 -s .", url: "http://127.0.0.1:8123/index.html", reuseExistingServer: !process.env.CI },
  projects: [
    { name: "phone", use: { viewport: { width: 390, height: 844 }, baseURL: "http://127.0.0.1:8123/" } },
    { name: "laptop", use: { viewport: { width: 1280, height: 800 }, baseURL: "http://127.0.0.1:8123/" } },
    // A real phone: mobile layout rules (meta viewport, 980px default width) only apply with isMobile.
    { name: "android", testMatch: /(mobile|smoke|navigation|back)\.spec\.mjs/, use: { ...devices["Pixel 7"], channel: process.env.CI ? undefined : (process.env.PW_CHANNEL || "chrome"), baseURL: "http://127.0.0.1:8123/" } }
  ]
});
