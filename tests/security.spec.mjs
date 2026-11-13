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

test("fonts come from the app itself, not Google Fonts", async ({ page }) => {
  const external = [];
  page.on("request", r => { if (!r.url().startsWith("http://localhost") && !r.url().startsWith("http://127.0.0.1")) external.push(r.url()); });
  await page.goto("index.html");
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => [document.fonts.check('600 16px "Inter"'), document.fonts.check('700 16px "Space Grotesk"')])).toEqual([true, true]);
  expect(await page.evaluate(() => [...document.fonts].filter(f => f.status === "loaded").map(f => f.family.replace(/"/g, "")).sort())).toEqual(expect.arrayContaining(["Inter", "Space Grotesk"]));
  expect(external.filter(u => /fonts\.(googleapis|gstatic)/.test(u))).toEqual([]);
});
