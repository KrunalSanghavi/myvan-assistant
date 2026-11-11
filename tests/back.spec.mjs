import { test, expect, connectDemo, tab } from "./fixtures.mjs";

// page.goBack() is what the phone's back button / back gesture does.
const back = page => page.goBack();
const visible = (page, v) => expect(page.locator("#view-" + v)).toBeVisible();
const dialogs = page => page.getByRole("dialog");

test("back closes a panel instead of leaving the app", async ({ page }) => {
  await connectDemo(page);
  await page.locator("#homeTiles [data-k=ect]").click();
  await expect(dialogs(page)).toHaveCount(1);
  await back(page);
  await expect(dialogs(page)).toHaveCount(0);
  await visible(page, "live");
  expect(page.url()).toContain("index.html");
});

test("back from a guide returns to the graph it was opened from", async ({ page }) => {
  await connectDemo(page);
  await page.getByRole("button", { name: "See the graph" }).click({ timeout: 15000 });
  await expect(dialogs(page)).toContainText("Long-term fuel trim, bank 2");
  await dialogs(page).getByRole("button", { name: "Troubleshoot" }).click();
  await expect(dialogs(page)).toHaveCount(1);
  await expect(dialogs(page)).toContainText("P0174");
  await back(page);
  await expect(dialogs(page)).toHaveCount(1);
  await expect(dialogs(page)).toContainText("Long-term fuel trim, bank 2");
  await back(page);
  await expect(dialogs(page)).toHaveCount(0);
  await visible(page, "live");
});

test("back walks out of sub-screens and tabs to Home", async ({ page }) => {
  await connectDemo(page);
  await tab(page, "Health");
  await tab(page, "More");
  await page.locator("#view-more [data-go=checks]").first().click();
  await visible(page, "checks");
  await back(page); await visible(page, "more");
  await back(page); await visible(page, "health");
  await back(page); await visible(page, "live");
  await expect(page.getByRole("tab", { name: /^Home/ })).toHaveAttribute("aria-selected", "true");
});

test("X, the header Back arrow and tapping Home keep history in step", async ({ page }) => {
  await connectDemo(page);
  // X closes the panel and consumes its history entry
  await page.locator("#homeTiles [data-k=batt]").click();
  await dialogs(page).getByRole("button", { name: "Close" }).click();
  await expect(dialogs(page)).toHaveCount(0);
  expect(await page.evaluate(() => history.state)).toMatchObject({ v: "live", d: 0, sheet: 0 });
  // header Back arrow is the same as the phone's back
  await page.locator("#homeRows [data-go=readings]").click();
  await visible(page, "readings");
  await page.getByRole("button", { name: "Back" }).click();
  await visible(page, "live");
  expect(await page.evaluate(() => history.state.d)).toBe(0);
  // tapping Home from deep inside rewinds to the start, so back then leaves the app
  await tab(page, "Codes"); await tab(page, "More");
  await page.locator("#view-more [data-go=log]").click();
  await tab(page, "Home");
  await visible(page, "live");
  await expect.poll(() => page.evaluate(() => history.state.d)).toBe(0);
});

test("tapping outside a panel and Escape also step history back", async ({ page }) => {
  await connectDemo(page);
  await page.locator("#homeTiles [data-k=rpm]").click();
  await page.keyboard.press("Escape");
  await expect(dialogs(page)).toHaveCount(0);
  expect(await page.evaluate(() => history.state.sheet)).toBe(0);
});
