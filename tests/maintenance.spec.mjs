import { test, expect, tab, seedStorage, readStorage, connectDemo } from "./fixtures.mjs";

async function logService(page, { part, date, mi, cost, note }) {
  await page.getByRole("button", { name: "Log a service" }).click();
  const f = page.locator("#svcForm");
  if (part) await f.locator("#svcPart").selectOption(part);
  if (date) await f.locator("#svcDate").fill(date);
  if (mi != null) await f.locator("#svcMi").fill(String(mi));
  if (cost != null) await f.locator("#svcCost").fill(String(cost));
  if (note) await f.locator("#svcNote").fill(note);
  await f.getByRole("button", { name: /Save/ }).click();
  await expect(page.locator("#svcForm")).toHaveCount(0);
}

test("logging a service adds it to the history and updates that part's age", async ({ page }) => {
  await seedStorage(page, { maint: { odo: "52203", items: {} } });
  await tab(page, "Health");
  await expect(page.locator("#ms-oil")).toContainText("Not set");
  await logService(page, { part: "oil", date: "2026-06-01", mi: 45500, cost: 59.99, note: "Full synthetic 0W-20" });
  const item = page.locator("#svcList .item").first();
  await expect(item).toContainText("Engine oil and filter");
  await expect(item).toContainText("45,500 mi");
  await expect(item).toContainText("$59.99");
  await expect(item).toContainText("Full synthetic 0W-20");
  await expect(page.locator("#ms-oil")).toContainText("Due soon");
  const m = (await readStorage(page)).maint.items.oil;
  expect(m).toMatchObject({ lastMi: "45500", lastDate: "2026-06-01", fromLog: true });
});

test("due-soon parts show on Health and on Home", async ({ page }) => {
  await seedStorage(page, { maint: { odo: "52203", items: {} } });
  await tab(page, "Health");
  await logService(page, { part: "oil", date: "2026-06-01", mi: 45500 });
  await expect(page.locator("#maintDue")).toContainText("Engine oil and filter due soon");
  await connectDemo(page);
  await expect(page.locator("#homeRows")).toContainText("Maintenance");
  await expect(page.locator("#homeRows")).toContainText("Engine oil and filter due soon");
});

test("editing an entry updates the part; the newest entry wins", async ({ page }) => {
  await seedStorage(page, { maint: { odo: "60000", items: {} } });
  await tab(page, "Health");
  await logService(page, { part: "oil", date: "2026-01-10", mi: 40000 });
  await logService(page, { part: "oil", date: "2026-06-01", mi: 47000 });
  expect((await readStorage(page)).maint.items.oil.lastMi).toBe("47000");
  await page.locator("#svcList .item", { hasText: "47,000" }).getByRole("button", { name: "Edit" }).click();
  await page.locator("#svcMi").fill("48000");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("#svcList")).toContainText("48,000 mi");
  expect((await readStorage(page)).maint.items.oil.lastMi).toBe("48000");
  expect((await readStorage(page)).services).toHaveLength(2);
});

test("deleting entries falls back to the previous one, then clears what the log set", async ({ page }) => {
  await seedStorage(page, { maint: { odo: "60000", items: {} } });
  await tab(page, "Health");
  await logService(page, { part: "plugs", date: "2025-03-01", mi: 30000 });
  await logService(page, { part: "plugs", date: "2026-03-01", mi: 50000 });
  const del = page.locator("#svcList .item", { hasText: "50,000" }).getByRole("button", { name: "Delete" });
  await del.click();
  await page.locator("#svcList .item", { hasText: "50,000" }).getByRole("button", { name: "Tap again to delete" }).click();
  await expect(page.locator("#svcList .item")).toHaveCount(1);
  expect((await readStorage(page)).maint.items.plugs.lastMi).toBe("30000");
  await page.locator("#svcList .item").getByRole("button", { name: "Delete" }).click();
  await page.locator("#svcList .item").getByRole("button", { name: "Tap again to delete" }).click();
  await expect(page.locator("#maintOut")).toContainText("No services logged yet");
  expect((await readStorage(page)).maint.items.plugs.lastMi).toBeUndefined();
});

test("values typed by hand are kept when log entries are deleted", async ({ page }) => {
  await seedStorage(page, { maint: { odo: "60000", items: { atf: { lastMi: "20000", lastDate: "2024-05-01" } } } });
  await tab(page, "Health");
  await logService(page, { part: "brakefluid", date: "2026-02-01" });
  await page.locator("#svcList .item").getByRole("button", { name: "Delete" }).click();
  await page.locator("#svcList .item").getByRole("button", { name: "Tap again to delete" }).click();
  expect((await readStorage(page)).maint.items.atf).toEqual({ lastMi: "20000", lastDate: "2024-05-01" });
});

test("the service log is included in backups", async ({ page }) => {
  await seedStorage(page, { maint: { odo: "60000", items: {} } });
  await tab(page, "Health");
  await logService(page, { part: "airfilter", date: "2026-04-01", mi: 55000, cost: 24 });
  await tab(page, "More");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Back up to a file" }).click()]);
  const chunks = []; for await (const c of await dl.createReadStream()) chunks.push(c);
  const b = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(b.data.services).toHaveLength(1);
  expect(b.data.services[0]).toMatchObject({ part: "airfilter", mi: 55000, cost: 24 });
});
