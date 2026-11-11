import { test, expect, connectDemo, tab } from "./fixtures.mjs";

async function openClear(page) {
  await connectDemo(page);
  await tab(page, "Codes");
  await expect(page.locator("#codesOut")).toContainText("P0456", { timeout: 15000 });
  await page.getByRole("button", { name: "Clear codes" }).click();
}

test("with the engine running, clearing asks for engine off + ignition ON and offers no clear button", async ({ page }) => {
  await openClear(page);
  const box = page.locator("#clearConfirm");
  await expect(box).toContainText("Turn the engine off first");
  await expect(box).toContainText("press the power button twice");
  await expect(page.locator("#clearYes")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(box).toBeHidden();
  await expect(page.locator("#codesOut")).toContainText("P0456");
});

test("once the engine is off, the prompt moves on by itself and codes clear", async ({ page }) => {
  await openClear(page);
  await page.getByRole("button", { name: "Turn the demo engine off" }).click();
  await expect(page.locator("#clearReady")).toContainText("Engine is off", { timeout: 15000 });
  await page.locator("#clearYes").click();
  await expect(page.locator("#clearConfirm")).toBeHidden({ timeout: 15000 });
  await expect(page.locator("#codesOut .group").first()).toContainText("Stored · 0");
});

test("if the engine restarts before confirming, nothing is cleared", async ({ page }) => {
  await openClear(page);
  await page.getByRole("button", { name: "Turn the demo engine off" }).click();
  await expect(page.locator("#clearYes")).toBeVisible({ timeout: 15000 });
  await page.evaluate(() => { demo.engineOff = false; });
  await page.locator("#clearYes").click();
  await expect(page.locator("#clearConfirm")).toContainText("Turn the engine off first", { timeout: 15000 });
  await expect(page.getByRole("alert")).toContainText("started again, so nothing was cleared");
  expect(await page.evaluate(() => demo.cleared)).toBe(false);
});

test("a refusal from the engine computer is reported, not treated as cleared", async ({ page }) => {
  await openClear(page);
  await page.getByRole("button", { name: "Turn the demo engine off" }).click();
  await expect(page.locator("#clearYes")).toBeVisible({ timeout: 15000 });
  await page.evaluate(() => { const orig = demo.emulate.bind(demo); demo.emulate = c => c.replace(/\s/g, "") === "04" ? "7F0422" : orig(c); });
  await page.locator("#clearYes").click();
  await expect(page.getByRole("alert")).toContainText("didn't accept the clear command");
  await expect(page.locator("#codesOut")).toContainText("P0456");
});
