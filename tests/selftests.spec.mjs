import { test, expect, connectDemo, connectFakeUsb, tab, readStorage } from "./fixtures.mjs";

// #45: grading of on-board self-tests (mode 06), found on the first real-van check.
async function readSelfTests(page) {
  await tab(page, "Health");
  await page.locator("#m06Btn").click();
  await expect(page.locator("#healthOut .hero p")).toContainText("Self-tests read", { timeout: 30000 });
}

test("a passing test near its limit is Watch, never Plan replacement", async ({ page }) => {
  await connectDemo(page);
  await readSelfTests(page);
  const af2 = page.locator('.hcard[data-comp="af2"]');
  await expect(af2).toContainText("Watch");
  await expect(af2).toContainText("passed its self-test, close to Honda's limit");
  await expect(page.locator("#healthOut")).not.toContainText("Plan replacement");
  // One row per part in "What I'm seeing".
  const ids = await page.locator("#healthOut .insight [data-comp]").evaluateAll(b => b.map(x => x.dataset.comp));
  expect(ids.length).toBeGreaterThan(0);
  expect(new Set(ids).size).toBe(ids.length);
});

test("an all-zero result shows Not run yet; a part's troubleshooting page says no code is set", async ({ page }) => {
  await connectDemo(page);
  await readSelfTests(page);
  await page.locator('.hcard[data-comp="evap"]').click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("Not run yet");
  await expect(sheet).toContainText("no result yet");
  await sheet.getByRole("button", { name: "Close" }).click();

  await page.locator('.hcard[data-comp="af2"]').click();
  await page.locator("#compGuide").click();
  await expect(page.locator("#noCodeNote")).toContainText("Your van hasn't set this code");
});

test("self-test results are saved, survive a reload and appear in the report", async ({ page }) => {
  await connectFakeUsb(page);
  await readSelfTests(page);
  const saved = (await readStorage(page)).selftests;
  expect(saved.rows.length).toBeGreaterThan(5);
  expect(saved.rows.every(r => r.length === 9)).toBe(true);

  page.once("dialog", d => d.accept());   // connected to a real adapter: the app asks before reloading (#58)
  await page.reload();
  await tab(page, "Health");
  await expect(page.locator("#healthOut .hero p")).toContainText("Self-tests read");
  await expect(page.locator('.hcard[data-comp="af2"]')).toContainText("Watch");

  await page.locator("#view-health [data-go=report]").click();
  const doc = page.locator("#reportDoc");
  await expect(doc.locator("h2", { hasText: "Self-test results" })).toBeVisible();
  await expect(doc).toContainText("Not run yet");
  await expect(doc).toContainText("Passed, near limit");
});

test("NHTSA recall dates are read as day/month/year", async ({ page }) => {
  await page.goto("index.html");
  const d = await page.evaluate(() => [["22/05/2026"], ["19/12/2023"], ["01/20/2021"], ["31/31/2020"]].map(([date]) => {
    const t = recallTime({ date }); if (!t) return null;
    const x = new Date(t), p = n => String(n).padStart(2, "0");
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  }));
  expect(d).toEqual(["2026-05-22", "2023-12-19", "2021-01-20", null]);
});
