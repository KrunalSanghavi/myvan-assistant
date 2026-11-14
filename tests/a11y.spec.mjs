import AxeBuilder from "@axe-core/playwright";
import { test, expect, connectDemo, tab } from "./fixtures.mjs";

// #65: every main screen passes axe-core's WCAG 2.1 A and AA checks, in light and dark mode.
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
async function check(page, where) {
  // Panels fade in; checking mid-fade would measure contrast at partial opacity.
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
  const r = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const found = r.violations.map(v => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map(n => n.target.join(" ")).join(" | ")}`);
  expect(found, `accessibility problems on ${where}`).toEqual([]);
}

for (const scheme of ["light", "dark"]) {
  test(`main screens pass WCAG 2.1 AA checks (${scheme})`, async ({ page }) => {
    test.setTimeout(90000);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("index.html");
    await check(page, "connect screen");
    await connectDemo(page);
    await page.waitForTimeout(1500);   // let live values and sparklines fill in
    await check(page, "Home");
    await page.locator("#homeRows [data-go=readings]").click();
    await check(page, "All readings");
    await page.getByRole("button", { name: "Back" }).click();
    for (const name of ["Health", "Codes", "More"]) { await tab(page, name); await check(page, name); }
    await page.locator("#view-more [data-go=checks]").first().click();
    await check(page, "Checks");
    await page.getByRole("button", { name: "Back" }).click();
    await page.locator("#view-more [data-go=log]").click();
    await check(page, "Log");
    await page.getByRole("button", { name: "Back" }).click();
    await tab(page, "Codes");
    await page.locator("#lookupIn").fill("P0171");
    await page.getByRole("button", { name: "Open steps" }).click();
    await expect(page.getByRole("dialog")).toContainText("P0171");
    await check(page, "a repair guide");
  });
}
