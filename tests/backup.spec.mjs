import { test, expect, tab, seedStorage, readStorage } from "./fixtures.mjs";

const drive = i => ({ t: Date.UTC(2026, 9, i), dur: 1200, ltft1: 1.2, ltft2: 3.4, restV: 12.6, crankV: 10.5, runV: 14.1 });
const SAVED = {
  drives: [drive(1), drive(2), drive(3)],
  maint: { odo: "52000", items: { oil: { lastMi: "50000", lastDate: "2026-06-01" } } },
  "note:P0171": "Smoke-tested intake, no leak",
  "chk:P0171": [0, 1],
  units: "metric"
};

async function backUp(page) {
  await tab(page, "More");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Back up to a file" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^myvan-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const chunks = []; for await (const c of await dl.createReadStream()) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}
const pick = (page, text, name = "backup.json") => page.locator("#restoreIn").setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(text) });

test("backup contains all saved data and nothing else", async ({ page }) => {
  await seedStorage(page, SAVED);
  await page.evaluate(() => localStorage.setItem("other-app", "x"));
  const b = JSON.parse(await backUp(page));
  expect(b).toMatchObject({ app: "myvan-assistant", format: 1, appVersion: expect.any(String) });
  expect(b.data).toEqual(SAVED);
  await expect(page.locator("#backupMsg")).toContainText("3 drives, 1 code note and maintenance dates for 1 part");
});

test("restore round-trips a backup after confirmation", async ({ page }) => {
  await seedStorage(page, SAVED);
  const file = await backUp(page);
  await seedStorage(page, { drives: [drive(9)], "note:P0420": "will be removed" });

  await tab(page, "More");
  await pick(page, file);
  await expect(page.locator("#backupMsg")).toContainText("It has 3 drives, 1 code note");
  await page.getByRole("button", { name: "Replace my data" }).click();
  await expect(page.locator("#backupMsg")).toContainText("Restored 3 drives");

  expect(await readStorage(page)).toEqual(SAVED);
  await expect(page.locator("#uMet")).toHaveAttribute("aria-pressed", "true");
  await tab(page, "Health");
  await expect(page.locator("#healthOut")).toContainText("3 drives recorded");
  await expect(page.locator("#m-odo")).toHaveValue("52000");
});

test("cancelling a restore changes nothing", async ({ page }) => {
  await seedStorage(page, SAVED);
  const file = await backUp(page);
  const before = { drives: [drive(9)] };
  await seedStorage(page, before);
  await tab(page, "More");
  await pick(page, file);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("#backupMsg")).toBeEmpty();
  expect(await readStorage(page)).toEqual(before);
});

for (const [label, text, msg] of [
  ["not JSON", "hello", "isn't a MyVan backup"],
  ["another app's JSON", JSON.stringify({ app: "other", data: {} }), "isn't a MyVan backup"],
  ["newer format", JSON.stringify({ app: "myvan-assistant", format: 99, data: {} }), "newer version"],
  ["damaged drives", JSON.stringify({ app: "myvan-assistant", format: 1, data: { drives: "oops" } }), "drive history in this backup is damaged"]
]) {
  test(`rejects ${label} and keeps current data`, async ({ page }) => {
    await seedStorage(page, SAVED);
    await tab(page, "More");
    await pick(page, text);
    await expect(page.getByRole("alert")).toContainText(msg);
    await expect(page.getByRole("alert")).toContainText("hasn't been changed");
    expect(await readStorage(page)).toEqual(SAVED);
  });
}

test("restore can merge: adds the backup's drives and keeps this device's own notes and settings", async ({ page }) => {
  await seedStorage(page, SAVED);
  const file = await backUp(page);
  await seedStorage(page, { drives: [drive(9)], "note:P0171": "Mine, newer" });
  await tab(page, "More");
  await pick(page, file);
  await page.getByRole("button", { name: "Merge with my data" }).click();
  await expect(page.locator("#backupMsg")).toContainText("Added 3 drives and 0 service records");
  const st = await readStorage(page);
  expect(st.drives.map(d => d.t)).toEqual([1, 2, 3, 9].map(i => drive(i).t));
  expect(st["note:P0171"]).toBe("Mine, newer");
  expect(st.maint).toEqual(SAVED.maint);
  expect(st.units).toBeUndefined();
});
