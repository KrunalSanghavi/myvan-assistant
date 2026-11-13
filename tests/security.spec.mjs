import { test, expect } from "@playwright/test";

// #64: the Content Security Policy blocks injected scripts and calls to origins that aren't approved.
// Uses plain Playwright (not the fixture) because the blocked attempts log console errors on purpose.
test("CSP blocks injected inline scripts and unapproved network calls", async ({ page }) => {
  const violations = [];
  page.on("console", m => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  await page.goto("index.html");
  await expect(page.locator("#appVer")).not.toBeEmpty();   // the app's own (hashed) script ran
  const ran = await page.evaluate(async () => {
    const s = document.createElement("script"); s.textContent = "window.__injected = 1"; document.body.append(s);
    let fetched = true; try { await fetch("https://example.com/"); } catch { fetched = false; }
    return { injected: window.__injected === 1, fetched };
  });
  expect(ran).toEqual({ injected: false, fetched: false });
  expect(violations.length).toBeGreaterThanOrEqual(2);
});
