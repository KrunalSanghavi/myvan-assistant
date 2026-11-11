import { test, expect, connectDemo, tab } from "./fixtures.mjs";

const ALL = ["live", "readings", "health", "codes", "checks", "more", "log"];
async function onlyVisible(page, id) {
  for (const v of ALL) {
    const el = page.locator("#view-" + v);
    if (v === id) await expect(el, `#view-${v} visible`).toBeVisible();
    else await expect(el, `#view-${v} hidden`).toBeHidden();
  }
}

test("four tabs, each showing only its own screen", async ({ page }) => {
  await connectDemo(page);
  for (const [name, id] of [["Home", "live"], ["Health", "health"], ["Codes", "codes"], ["More", "more"]]) {
    await tab(page, name);
    await onlyVisible(page, id);
  }
  await expect(page.getByRole("tab")).toHaveCount(4);
});

test("sub-screens open from rows and Back returns", async ({ page }) => {
  await connectDemo(page);
  await page.locator("#homeRows [data-go=readings]").click();
  await onlyVisible(page, "readings");
  await expect(page.locator("#topTitle")).toHaveText("All readings");
  await page.getByRole("button", { name: "Back" }).click();
  await onlyVisible(page, "live");
  await tab(page, "More");
  await page.locator("#view-more [data-go=checks]").first().click();
  await onlyVisible(page, "checks");
  await page.getByRole("button", { name: "Back" }).click();
  await page.locator("#view-more [data-go=log]").click();
  await onlyVisible(page, "log");
  await page.getByRole("button", { name: "Back" }).click();
  await onlyVisible(page, "more");
});

test("no sideways scrolling on any screen", async ({ page }, info) => {
  await connectDemo(page);
  const width = page.viewportSize().width;
  for (const name of ["Home", "Health", "Codes", "More"]) {
    await tab(page, name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${name} at ${width}px`).toBeLessThanOrEqual(width);
  }
});
