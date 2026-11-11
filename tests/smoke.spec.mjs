import { test, expect } from "@playwright/test";

// Fails the test on any uncaught page error or console error.
test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on("pageerror", e => page.errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/favicon|fonts\.g/.test(m.text())) page.errors.push(m.text()); });
});
test.afterEach(async ({ page }) => { expect(page.errors, "page errors").toEqual([]); });

export async function connectDemo(page) {
  await page.goto("index.html");
  await page.getByRole("button", { name: /demo/i }).click();
  await expect(page.locator("#connText")).toHaveText("Demo van", { timeout: 15000 });
}
const tab = (page, name) => page.getByRole("tab", { name: new RegExp("^" + name) }).click();

test("loads with MyVan branding", async ({ page }) => {
  await page.goto("index.html");
  await expect(page).toHaveTitle("MyVan Assistant");
  await expect(page.locator("h1")).toHaveText("MyVan Assistant");
});

test("demo van streams live readings", async ({ page }) => {
  await connectDemo(page);
  await expect(page.locator("#liveBox")).toBeVisible();
  await expect.poll(() => page.locator("#groups button, #groups .tile").count()).toBeGreaterThan(10);
});

test("vehicle screen shows VIN from the demo van", async ({ page }) => {
  await connectDemo(page);
  await tab(page, "Vehicle");
  await expect(page.locator("#vehKv")).toContainText("5FNRL6H9XJBDEMO01");
});

test("health report card grades parts from demo history", async ({ page }) => {
  await connectDemo(page);
  await tab(page, "Health");
  await expect(page.locator(".hcard")).toHaveCount(15);
  await expect(page.locator("#healthOut")).toContainText("drives recorded");
});

test("codes are read and a guide opens", async ({ page }) => {
  await connectDemo(page);
  await tab(page, "Codes");
  await expect(page.locator("#codesOut")).toContainText("P0456", { timeout: 15000 });
  await page.locator("#lookupIn").fill("P0171");
  await page.getByRole("button", { name: "Open steps" }).click();
  await expect(page.getByRole("dialog")).toContainText("P0171");
});
