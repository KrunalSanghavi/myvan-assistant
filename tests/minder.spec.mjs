import { test, expect, tab, connectFakeUsb, seedStorage, readStorage } from "./fixtures.mjs";

// #51: the typed odometer shows on the Vehicle screen; Maintenance Minder codes are decoded and can be logged.

test("a van without an odometer reading shows the typed one on the Vehicle screen", async ({ page }) => {
  await connectFakeUsb(page, { without: [0xA6] });
  await tab(page, "More");
  await expect(page.locator("#vehKv")).toContainText("Not reported by this van. Type it in under Maintenance");
  await tab(page, "Health");
  await page.locator("#m-odo").fill("109412");
  await tab(page, "More");
  await expect(page.locator("#vehKv")).toContainText("109,412 mi (entered by you)");
});

test("a Minder code is explained and one tap logs the jobs", async ({ page }) => {
  await seedStorage(page, { maint: { odo: "109412", items: {} } });
  await tab(page, "Health");
  await page.locator("#m-minder").fill("b1247");
  await expect(page.locator("#m-minder")).toHaveValue("b1247");
  const jobs = page.locator("#minderJobs");
  await expect(jobs).toContainText("B1247 means:");
  await expect(jobs).toContainText("Replace engine oil and filter");
  await expect(jobs).toContainText("Rotate the tires");
  await expect(jobs).toContainText("Replace the engine air filter and the cabin");
  await expect(jobs).toContainText("Replace the spark plugs and timing belt");
  await expect(jobs).toContainText("Replace the brake fluid");
  await page.locator("#m-minder").fill("X9");
  await expect(page.locator("#minderOut")).toContainText("doesn't look like a Minder code");
  await page.locator("#m-minder").fill("B1247");
  await page.getByRole("button", { name: /Mark these done today at 109,412 mi/ }).click();
  await expect(page.locator("#maintOut")).toContainText("Last Minder service logged: B1247");
  const s = await readStorage(page);
  expect(s.services.map(x => x.part).sort()).toEqual(["airfilter", "belt", "brakefluid", "oil", "other", "plugs"]);
  expect(s.services.every(x => x.mi === 109412 && /Maintenance Minder B1247/.test(x.note))).toBe(true);
  expect(s.maint.items.oil.lastMi).toBe("109412");
  expect(s.maint.minder).toBe("");
});

test("a pending Minder code is in the health report", async ({ page }) => {
  await seedStorage(page, { maint: { odo: "109412", minder: "B12", items: {} } });
  await tab(page, "Health");
  await page.locator("#view-health [data-go=report]").click();
  await expect(page.locator("#reportDoc")).toContainText("Maintenance Minder");
  await expect(page.locator("#reportDoc")).toContainText("B12: Replace engine oil and filter; Rotate the tires; Replace the engine air filter and the cabin (dust and pollen) filter");
});
