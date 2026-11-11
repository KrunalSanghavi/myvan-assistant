import { test, expect, connectDemo, tab } from "./fixtures.mjs";

const VIEWS = { Live: "live", Health: "health", Codes: "codes", Alerts: "checks", Vehicle: "vehicle", Log: "log" };

test("each tab shows only its own screen", async ({ page }) => {
  await connectDemo(page);
  for (const [name, id] of Object.entries(VIEWS)) {
    await tab(page, name);
    for (const other of Object.values(VIEWS)) {
      const v = page.locator("#view-" + other);
      if (other === id) await expect(v, `${name} tab shows #view-${other}`).toBeVisible();
      else await expect(v, `${name} tab hides #view-${other}`).toBeHidden();
    }
  }
});

test("page is no taller than the visible screen needs before connecting", async ({ page }) => {
  await page.goto("index.html");
  await tab(page, "Codes");
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(h).toBeLessThan(2000);
});
