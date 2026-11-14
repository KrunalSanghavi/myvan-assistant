import { test, expect, connectDemo, seedStorage, tab } from "./fixtures.mjs";

// #18: part-life outlook from this van's own drive history.
test("demo van: battery voltage drifting down gets a time estimate; steady parts say so", async ({ page }) => {
  await connectDemo(page);
  await tab(page, "Health");
  const out = page.locator("#outlook");
  await expect(out).toContainText("Outlook for the next year");
  await expect(out).toContainText("12V battery");
  await expect(out).toContainText(/drifting toward the problem level\. At this rate it gets there in about/);
  await expect(out).toContainText("rough guide, not a guarantee");
  await out.locator('[data-comp="batt"]').click();
  await expect(page.locator("#compOutlook")).toContainText("Battery voltage before starting is drifting toward the problem level");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await page.locator('.hcard[data-comp="chg"]').click();
  await expect(page.locator("#compOutlook")).toContainText("Charging voltage while driving is steady");
});

test("maintenance due date uses the van's usual daily driving", async ({ page }) => {
  const day = 864e5, now = Date.now();
  const drives = Array.from({ length: 10 }, (_, i) => ({ t: now - (28 - 3 * i) * day, dur: 1200, km: 40, restV: 12.6, runV: 14.1 }));
  await seedStorage(page, { drives, maint: { odo: "50000", items: { oil: { lastMi: "44000" } } } });
  await tab(page, "Health");
  const out = page.locator("#outlook");
  await expect(out).toContainText(/Engine oil and filter will be due in about \d+ months \(around .+\), at your usual 8\.\d mi a day/);
  await page.locator("#view-health [data-go=report]").click();
  await expect(page.locator("#reportDoc")).toContainText("Outlook for the next year");
});

test("with too few drives the outlook says what it needs", async ({ page }) => {
  await seedStorage(page, {});
  await tab(page, "Health");
  await expect(page.locator("#outEmpty")).toContainText("Needs at least 8 recorded drives");
});
