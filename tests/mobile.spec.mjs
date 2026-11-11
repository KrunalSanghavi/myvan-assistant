import { test, expect, connectDemo } from "./fixtures.mjs";

// Runs in the "android" project (Pixel 7 emulation) as well as the others.
test("lays out at the phone's real width with readable text", async ({ page }) => {
  await page.goto("index.html");
  const m = await page.evaluate(() => ({
    inner: window.innerWidth, screen: screen.width, scroll: document.documentElement.scrollWidth,
    body: parseFloat(getComputedStyle(document.body).fontSize),
    mode: document.compatMode
  }));
  expect(m.mode, "standards mode, not quirks").toBe("CSS1Compat");
  expect(m.inner, "layout width equals the device width (no shrunken desktop page)").toBeLessThanOrEqual(Math.max(m.screen, 1280));
  if (test.info().project.name === "android") expect(m.inner).toBe(m.screen);
  expect(m.scroll, "no sideways scrolling").toBeLessThanOrEqual(m.inner);
  expect(m.body, "body text at least 15px").toBeGreaterThanOrEqual(15);
});

test("Home is readable on a phone once connected", async ({ page }) => {
  await connectDemo(page);
  const h = await page.locator("#statusCard h3").evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(h).toBeGreaterThanOrEqual(20);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
