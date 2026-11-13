import { test, expect, connectFakeUsb } from "./fixtures.mjs";

// #60: the real van left coolant, intake air and airflow blank, and kept showing old values after the engine stopped.

test("reads coolant, intake air and airflow from the newer PIDs 67, 68 and 66", async ({ page }) => {
  await connectFakeUsb(page, { without: [0x05, 0x0F, 0x10], add: [0x66, 0x67, 0x68] });
  expect(await page.evaluate(() => [P.ect.pid, P.iat.pid, P.maf.pid])).toEqual([0x67, 0x68, 0x66]);
  await expect.poll(() => page.evaluate(() => V.ect), { timeout: 15000 }).toBeGreaterThan(80);
  await expect.poll(() => page.evaluate(() => V.iat), { timeout: 15000 }).toBeGreaterThan(20);
  await expect.poll(() => page.evaluate(() => V.maf), { timeout: 15000 }).toBeGreaterThan(2);
  await page.locator("#homeRows [data-go=readings]").click();
  await expect(page.locator("#groups")).toContainText("Coolant temperature");
  await expect(page.locator("#groups")).not.toContainText(/not reported.*coolant/i);
});

test("combines the supported lists when the transmission computer answers first", async ({ page }) => {
  await connectFakeUsb(page, { setup: () => { demo.tcmFirst = true; } });
  expect(await page.evaluate(() => [0x05, 0x0F, 0x3C, 0x44].every(p => state.supported.has(p)))).toBe(true);
  await expect.poll(() => page.evaluate(() => V.ect), { timeout: 15000 }).toBeGreaterThan(80);
});

test("clears readings the van stops answering, says so, and doesn't log them", async ({ page }) => {
  await connectFakeUsb(page);
  await expect.poll(() => page.evaluate(() => V.rpm), { timeout: 10000 }).toBeGreaterThan(400);
  await page.evaluate(() => { state.staleMs = 1500; state.recording = true; demo.silent = true; });
  await expect(page.locator("#connText")).toHaveText("Connected · no answer from the engine", { timeout: 10000 });
  expect(await page.evaluate(() => [V.rpm, V.speed, V.ect])).toEqual([null, null, null]);
  const rows = await page.evaluate(() => state.rows.length);
  await page.waitForTimeout(1200);
  expect(await page.evaluate(n => state.rows.slice(n).filter(r => r[1] !== "").length, rows)).toBe(0);
  await page.evaluate(() => { demo.silent = false; });
  await expect(page.locator("#connText")).toHaveText("Connected · USB adapter", { timeout: 10000 });
  await expect.poll(() => page.evaluate(() => V.rpm), { timeout: 10000 }).toBeGreaterThan(400);
});
