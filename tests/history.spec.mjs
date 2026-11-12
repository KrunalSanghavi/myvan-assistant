import { test, expect, connectDemo, tab, readStorage, seedStorage } from "./fixtures.mjs";

async function openHistory(page) {
  await tab(page, "Health");
  await page.locator("#view-health [data-go=history]").click();
  await expect(page.locator("#topTitle")).toHaveText("Drive history");
}

test("demo history: fuel economy across all 14 drives, then a metric with a warning level", async ({ page }) => {
  await connectDemo(page);
  await tab(page, "Health");
  await expect(page.locator("#histCount")).toHaveText("14 drives");
  await openHistory(page);
  await expect(page.locator("#histMetric")).toHaveValue("mpg");
  await expect(page.locator("#histN")).toHaveText("14 drives");
  await expect(page.locator("#histLatest")).toHaveText(/mpg$/);
  await expect(page.locator("#histOut svg .dot")).toHaveCount(14);

  // Bank 2 trim drifts from about +5.5% to +13% in the demo history: past the warning level.
  await page.locator("#histMetric").selectOption("ltft2");
  await expect(page.locator("#histNote")).toContainText("warning level: beyond ±7.0%");
  await expect(page.locator("#histOut svg .thr")).not.toHaveCount(0);
  expect(await page.locator("#histOut svg .dot.warn, #histOut svg .dot.crit").count()).toBeGreaterThan(0);
  expect(parseFloat(await page.locator("#histLatest").textContent())).toBeGreaterThan(10);
  expect((await readStorage(page)).histMetric).toBe("ltft2");
});

test("date range narrows the drives shown and is remembered", async ({ page }) => {
  await connectDemo(page);
  await openHistory(page);
  await page.getByRole("button", { name: "2 weeks" }).click();
  const n = parseInt(await page.locator("#histN").textContent());
  expect(n).toBeGreaterThan(3);
  expect(n).toBeLessThan(14);
  await expect(page.locator("#histList .item")).toHaveCount(n);
  expect((await readStorage(page)).histRange).toBe("14");
});

test("back from history returns to Health", async ({ page }) => {
  await connectDemo(page);
  await openHistory(page);
  await page.goBack();
  await expect(page.locator("#topTitle")).toHaveText("Health");
});

test("saved drives from older versions: engine metrics chart, trips explain why they're empty", async ({ page }) => {
  const now = Date.now();
  await seedStorage(page, { drives: [0, 1, 2].map(i => ({ t: now - (3 - i) * 864e5, dur: 1200, restV: 12.6 - i * .1, ltft1: 2 })) });
  await openHistory(page);
  await expect(page.locator("#histOut")).toContainText("Trips saved from version 2.5 on");
  await page.locator("#histMetric").selectOption("restV");
  await expect(page.locator("#histN")).toHaveText("3 drives");
  await expect(page.locator("#histLatest")).toHaveText("12.40 V");
});

test("no drives yet", async ({ page }) => {
  await seedStorage(page, {});
  await openHistory(page);
  await expect(page.locator("#histOut")).toContainText("No drives recorded yet");
});
