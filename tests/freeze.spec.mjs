import { test, expect, connectDemo, tab } from "./fixtures.mjs";

async function openCodes(page) {
  await connectDemo(page);
  await tab(page, "Codes");
  await expect(page.locator("#codesOut")).toContainText("P0456", { timeout: 15000 });
}

test("stored code shows a freeze frame chip and the snapshot in its guide", async ({ page }) => {
  await openCodes(page);
  const item = page.locator("#codesOut .item", { hasText: "P0456" }).first();
  await expect(item).toContainText("Freeze frame");
  await item.getByRole("button", { name: "Troubleshoot" }).click();
  const box = page.getByRole("dialog").locator("#freezeBox");
  await expect(box).toContainText("Conditions when this code set");
  await expect(box).toContainText("Engine speed: 705 rpm");
  await expect(box).toContainText("Vehicle speed: 0 mph");
  await expect(box).toContainText("Coolant temperature: 192 °F");
  await expect(box).toContainText("Long-term fuel trim, bank 2: +12.5 %");
  await expect(box).toContainText("Time since engine start: 30:34");
});

test("other codes don't show the freeze frame", async ({ page }) => {
  await openCodes(page);
  await page.locator("#lookupIn").fill("P0171");
  await page.getByRole("button", { name: "Open steps" }).click();
  await expect(page.getByRole("dialog")).toContainText("P0171");
  await expect(page.locator("#freezeBox")).toHaveCount(0);
});

test("clearing codes clears the freeze frame", async ({ page }) => {
  await openCodes(page);
  await page.getByRole("button", { name: "Clear codes" }).click();
  await page.getByRole("button", { name: "Turn the demo engine off" }).click();
  await page.locator("#clearYes").click({ timeout: 15000 });
  await expect(page.locator("#codesOut .group").first()).toContainText("Stored · 0", { timeout: 15000 });
  await expect(page.locator("#codesOut")).not.toContainText("Freeze frame");
  await page.locator("#lookupIn").fill("P0456");
  await page.getByRole("button", { name: "Open steps" }).click();
  await expect(page.getByRole("dialog")).toContainText("P0456");
  await expect(page.locator("#freezeBox")).toHaveCount(0);
});
