import { test, expect, connectDemo, readStorage } from "./fixtures.mjs";

// Reference numbers worked out by hand: 22 g/s of air at the ideal mixture (14.7:1) is 1.497 g/s of fuel,
// or 7.232 L (1.911 gal) per hour at 745 g/L. At 74 km/h (45.98 mph) that is 24.07 mpg / 9.77 L/100 km.
const CRUISE = { rpm: 2000, speed: 74, maf: 22, lambda: 1, load: 40, tps: 20 };
// Twice the speed and twice the air gives the same mpg, and the demo covers distance fast enough for a test.
const FAST = { ...CRUISE, speed: 148, maf: 44 };

test("trip math matches the hand-worked cruise numbers within 1%", async ({ page }) => {
  await page.goto("index.html");
  const r = await page.evaluate(c => {
    const t = newTrip();
    for (let i = 0; i < 3600; i++) tripStep(t, c, 1);
    units = "us"; const mpg = economy(t.km, t.fuelL);
    units = "metric"; const l100 = economy(t.km, t.fuelL);
    return { ...t, mpg, l100 };
  }, CRUISE);
  expect(r.km).toBeCloseTo(74, 6);
  expect(Math.abs(r.fuelL - 7.232) / 7.232).toBeLessThan(0.01);
  expect(Math.abs(r.mpg - 24.07) / 24.07).toBeLessThan(0.01);
  expect(Math.abs(r.l100 - 9.77) / 9.77).toBeLessThan(0.01);
  expect(r.idleSec).toBe(0);
});

test("a gap in readings isn't counted as driving", async ({ page }) => {
  await page.goto("index.html");
  const t = await page.evaluate(c => tripStep(newTrip(), c, 600), CRUISE);
  expect(t.sec).toBe(5);
});

test("demo van at idle: fuel matches the airflow, all time counts as idle", async ({ page }) => {
  await connectDemo(page);
  await page.waitForTimeout(8000);   // the demo idles for its first 22 seconds
  const t = await page.evaluate(() => ({ ...state.drive.trip, maf: mean(H.maf) }));
  expect(t.sec).toBeGreaterThan(3);
  expect(t.km).toBe(0);
  expect(t.idleSec).toBeCloseTo(t.sec, 6);
  const expected = t.maf / 14.7 / 745 * t.sec;   // liters
  expect(Math.abs(t.fuelL - expected) / expected).toBeLessThan(0.1);
  await expect(page.locator("#homeRows")).toContainText("This trip");
});

test("demo van at cruise: trip panel shows about 24 mpg and the cost from the fuel price", async ({ page }) => {
  await page.goto("index.html");
  await page.evaluate(c => { const base = demo.vals; demo.vals = function () { return Object.assign(base.call(this), c); }; }, FAST);
  await page.getByRole("button", { name: /demo/i }).click();
  await expect(page.locator("#connText")).toHaveText("Demo van", { timeout: 15000 });
  await expect.poll(() => page.evaluate(() => state.drive && state.drive.trip.km), { timeout: 15000 }).toBeGreaterThan(0.35);
  await page.locator("#homeRows [data-go=trip]").click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "This trip" })).toBeVisible();
  const econ = sheet.locator("#tripKv dd").nth(2);
  await expect(econ).toHaveText(/mpg$/);
  const mpg = parseFloat(await econ.textContent());
  expect(Math.abs(mpg - 24.07) / 24.07).toBeLessThan(0.02);
  await expect(sheet.locator("#tripKv")).toContainText("Set a fuel price below");
  await sheet.getByLabel(/Fuel price/).fill("3.49");
  await expect(sheet.locator("#tripKv dd").nth(3)).toHaveText(/^\$\d+\.\d\d$/);
  expect((await readStorage(page)).fuelPrice).toEqual({ v: 3.49, u: "gal" });
  await expect(sheet.locator("#tripList .item")).toHaveCount(8);   // demo history
});

test("a finished drive saves distance, fuel, idle time and cost", async ({ page }) => {
  await page.goto("index.html");
  const d = await page.evaluate(() => {
    store.set("fuelPrice", { v: 4, u: "gal" });
    state.mode = "usb";
    state.drive = { start: Date.now() - 600000, idle: { ltft1: [], ltft2: [], stft1: [], stft2: [], maf: [], rpm: [] }, run: [], c1: [], c2: [],
      trip: { sec: 600, km: 10, fuelL: 1, idleSec: 90, maf: true } };
    endDrive();
    return drives().at(-1);
  });
  expect(d.km).toBe(10);
  expect(d.fuelL).toBe(1);
  expect(d.idleSec).toBe(90);
  expect(d.cost).toBeCloseTo(4 / 3.78541, 2);
});
