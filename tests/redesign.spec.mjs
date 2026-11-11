import { test, expect, connectDemo, tab, readStorage } from "./fixtures.mjs";

test("Home shows the key gauges plus the out-of-range reading, highlighted, first", async ({ page }) => {
  await connectDemo(page);
  const tiles = page.locator("#homeTiles .tile");
  await expect(page.locator("#homeTiles .tile").first()).toHaveAttribute("data-k", "ltft2", { timeout: 15000 });
  await expect(tiles.first()).toHaveClass(/warn/);
  await expect(tiles.first().locator(".st")).toHaveText("High");
  for (const k of ["ect", "batt", "rpm", "speed"]) await expect(page.locator(`#homeTiles [data-k=${k}]`)).toBeVisible();
  await expect(page.locator("#statusCard")).toContainText("Bank 2 running lean");
});

test("status card opens the graph and the troubleshooting guide", async ({ page }) => {
  await connectDemo(page);
  await page.getByRole("button", { name: "See the graph" }).click({ timeout: 15000 });
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("Long-term fuel trim, bank 2");
  await expect(sheet.locator(".bigspark")).toBeVisible();
  await expect(sheet).toContainText("Above normal");
  await sheet.getByRole("button", { name: "Troubleshoot" }).click();
  await expect(page.getByRole("dialog")).toContainText("P0174");
});

test("All readings switches between list and tiles, and remembers the choice", async ({ page }) => {
  await connectDemo(page);
  await page.locator("#homeRows [data-go=readings]").click();
  await expect(page.locator("#groups .rrow")).toHaveCount(25);
  await expect(page.locator("#groups .rrow svg.spark").first()).toBeVisible();
  await page.getByRole("button", { name: "Tiles" }).click();
  await expect(page.locator("#groups .tile")).toHaveCount(25);
  await expect(page.locator("#groups .rrow")).toHaveCount(0);
  expect((await readStorage(page)).readView).toBe("tiles");
});

test("a reading's detail shows stats and can be pinned to Home", async ({ page }) => {
  await connectDemo(page);
  await page.locator("#homeRows [data-go=readings]").click();
  await page.locator("#groups [data-k=load]").click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.locator(".stats")).toContainText("Lowest");
  await expect(sheet.locator(".stats")).toContainText("Highest");
  await sheet.getByRole("button", { name: "Pin to Home" }).click();
  await expect(sheet.getByRole("button", { name: "Unpin from Home" })).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.locator("#homeTiles [data-k=load]")).toBeVisible();
  expect((await readStorage(page)).pins).toEqual(["load"]);
});

test("key gauges can't be unpinned", async ({ page }) => {
  await connectDemo(page);
  await page.locator("#homeTiles [data-k=ect]").click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Always shown on Home" })).toBeDisabled();
});

test("Appearance: Auto, Light and Dark", async ({ page }) => {
  await page.goto("index.html");
  await tab(page, "More");
  const html = page.locator("html");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
  await tab(page, "More");
  await page.getByRole("button", { name: "Auto", exact: true }).click();
  await expect(html).not.toHaveAttribute("data-theme", /./);
  expect((await readStorage(page)).theme).toBe("auto");
});
