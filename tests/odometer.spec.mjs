import { test, expect, tab, connectDemo, connectFakeUsb, seedStorage, readStorage } from "./fixtures.mjs";

// Demo van starts at 84,012.4 km = 52,203 mi.
const DEMO_MI = /52,2\d\d/;

test("demo van shows its odometer on the Vehicle screen in both units", async ({ page }) => {
  await connectDemo(page);
  await tab(page, "More");
  await expect(page.locator("#vehKv")).toContainText(/Odometer\s*52,2\d\d mi \(simulated\)/, { timeout: 30000 });
  await page.locator("#uMet").click();
  await expect(page.locator("#vehKv")).toContainText(/84,01\d km/);
});

test("demo odometer is shown on Health but never saved", async ({ page }) => {
  await seedStorage(page, { maint: { odo: "1000", items: {} } });
  await connectDemo(page);
  await tab(page, "Health");
  await expect(page.locator("#odoSrc")).toContainText("The demo van reports", { timeout: 15000 });
  await expect(page.locator("#odoSrc")).toContainText(DEMO_MI);
  await expect(page.locator("#m-odo")).toHaveValue("1000");
  expect((await readStorage(page)).maint.odo).toBe("1000");
});

test("a real van's odometer updates the maintenance odometer and part ages", async ({ page }) => {
  await seedStorage(page, { maint: { odo: "40000", items: { oil: { lastMi: "45500" } } } });
  await connectFakeUsb(page);
  await tab(page, "Health");
  await expect(page.locator("#m-odo")).toHaveValue(/^522\d\d$/, { timeout: 15000 });
  await expect(page.locator("#odoSrc")).toContainText("Read from the van");
  const m = (await readStorage(page)).maint;
  expect(m.odoSrc).toBe("van");
  expect(+m.odo).toBeGreaterThan(52190);
  // Last oil change at 45,500 with a 7,500 mi interval: ~6,700 mi used (89%), so the oil chip moves to "Due soon" (>= 85%).
  await expect(page.locator("#ms-oil")).toContainText("Due soon");
});

test("manual odometer entry still works when the van doesn't report A6", async ({ page }) => {
  await seedStorage(page, { maint: { odo: "40000", items: {} } });
  await connectFakeUsb(page, { without: [0xA6] });
  await tab(page, "More");
  await expect(page.locator("#vehKv")).toContainText("40,000 mi (entered by you)");   // the van has no A6, so the typed reading shows (#51)
  await tab(page, "Health");
  await page.locator("#m-odo").fill("61234");
  await expect(page.locator("#odoSrc")).toContainText("Type it in");
  await page.waitForTimeout(1500); // a few poll cycles: nothing should overwrite it
  await expect(page.locator("#m-odo")).toHaveValue("61234");
  expect((await readStorage(page)).maint).toMatchObject({ odo: "61234", odoSrc: "manual" });
});
