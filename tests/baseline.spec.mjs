import { test, expect, connectDemo, seedStorage, tab } from "./fixtures.mjs";

// #2: grades compare with this van's own normal once there are enough drives; general limits before that.
const day = 864e5;
const drivesWith = (n, f) => Array.from({ length: n }, (_, i) => ({ t: Date.now() - (n - i) * 2 * day, dur: 1200, km: 30, ...f(i, n) }));

test("demo van: a part's sheet names the personal baseline it uses", async ({ page }) => {
  await connectDemo(page);
  await tab(page, "Health");
  await page.locator('.hcard[data-comp="batt"]').click();
  await expect(page.locator('[data-base="restV"]')).toContainText(/Your van's normal is about 12\.\d\d V, learned from 11 drives/);
  await expect(page.locator('[data-base="restV"]')).toContainText("the general limits still apply");
});

test("a small drop that general limits miss is flagged against the van's own tight normal", async ({ page }) => {
  // Resting voltage is rock-steady at 12.70 V, then the last 3 drives read 12.60 V: within the general 0.15 V drift and above 12.3 V.
  const drives = drivesWith(16, (i, n) => ({ restV: i >= n - 3 ? 12.6 : 12.7 + (i % 2 ? .01 : -.01) }));
  await seedStorage(page, { drives });
  await tab(page, "Health");
  const card = page.locator('.hcard[data-comp="batt"]');
  await expect(card).toContainText("Watch");
  await expect(card).toContainText("outside this van's own normal range");
});

test("before enough drives it says it's using general limits, and the same drop stays Good", async ({ page }) => {
  const drives = drivesWith(8, (i, n) => ({ restV: i >= n - 3 ? 12.6 : 12.7 }));
  await seedStorage(page, { drives });
  await tab(page, "Health");
  const card = page.locator('.hcard[data-comp="batt"]');
  await expect(card).toContainText("Good");
  await card.click();
  await expect(page.locator('[data-base="restV"]')).toContainText("Using general limits until there are 13 drives over 14 days to learn your van's normal (8 so far).");
});
