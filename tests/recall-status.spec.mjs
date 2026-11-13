import { test, expect, connectDemo, tab, readStorage, seedStorage } from "./fixtures.mjs";

// #54: the owner marks recalls closed; only open ones are highlighted. Saved recalls are used, so nothing calls NHTSA.
const VIN = "5FNRL6H9XJB000001";
const item = (id, date, comp, extra = {}) => ({ id, date, component: comp, summary: "Summary " + id, consequence: "", remedy: "", parkIt: false, parkOutSide: false, ...extra });
const SAVED = { vin: VIN, recalls: { vin: VIN, at: Date.now() - 864e5, make: "HONDA", model: "Odyssey", year: "2018", items: [
  item("26V332000", "22/05/2026", "AIR BAGS:FRONT PASSENGER"),
  item("23V858000", "19/12/2023", "FUEL SYSTEM:FUEL PUMP", { parkOutSide: true }),
  item("19V299000", "12/04/2019", "POWER TRAIN:AUTOMATIC TRANSMISSION")] } };
const box = page => page.locator("#recallOut");
const sheet = page => page.getByRole("dialog");
async function openList(page) { await tab(page, "More"); await page.locator("#recallSee").click(); }

test("mark all closed, reopen the one still open on the van; only it stays highlighted", async ({ page }) => {
  await page.route("https://*.nhtsa.gov/**", r => r.abort());
  await seedStorage(page, SAVED);
  await tab(page, "More");
  await expect(box(page).locator("#recallOpen")).toContainText("3 open recalls");
  await expect(box(page)).toContainText("says not to drive or to park outside");

  await page.locator("#recallSee").click();
  await sheet(page).getByRole("button", { name: "Mark all closed" }).click();
  await expect(sheet(page).locator("#recallList")).toContainText("No open recalls.");
  await expect(sheet(page).locator("#recallClosedBox > summary")).toHaveText("Closed (3)");
  await expect(box(page).locator("#recallOpen")).toContainText("All 3 recalls marked closed");
  await expect(box(page)).not.toContainText("says not to drive");   // the park warning only counts open recalls

  await sheet(page).locator("#recallClosedBox > summary").click();
  const air = sheet(page).locator('[data-rid="26V332000"]');
  await air.locator("summary").click();
  await air.getByRole("button", { name: /Reopen/ }).click();
  const open = sheet(page).locator("#recallList details.recall.open");
  await expect(open).toHaveCount(1);
  await expect(open).toContainText("Front Passenger");
  await expect(open).toContainText("Open");
  await expect(box(page).locator("#recallOpen")).toContainText("1 open recall, 2 marked closed");
  await expect(box(page).locator("#recallOpen")).toContainText("Open: Front Passenger");

  const st = await readStorage(page);
  expect(Object.keys(st.recallClosed[VIN]).sort()).toEqual(["19V299000", "23V858000"]);

  await page.reload();
  await tab(page, "More");
  await expect(box(page).locator("#recallOpen")).toContainText("1 open recall, 2 marked closed");
  await tab(page, "Health");
  await page.locator("#view-health [data-go=report]").click();
  await expect(page.locator("#reportDoc")).toContainText("1 open, 2 marked closed by the owner");
});

test("a recall NHTSA adds later starts open", async ({ page }) => {
  const saved = structuredClone(SAVED);
  await seedStorage(page, { ...saved, recallClosed: { [VIN]: { "26V332000": "2026-11-13", "23V858000": "2026-11-13", "19V299000": "2026-11-13" } } });
  await page.evaluate(() => { const r = JSON.parse(localStorage.getItem("odx:recalls")); r.items.unshift({ id: "26V999000", date: "01/11/2026", component: "STEERING:COLUMN", summary: "New", consequence: "", remedy: "", parkIt: false, parkOutSide: false }); localStorage.setItem("odx:recalls", JSON.stringify(r)); });
  await page.reload();
  await tab(page, "More");
  await expect(box(page).locator("#recallOpen")).toContainText("1 open recall, 3 marked closed");
  await expect(box(page).locator("#recallOpen")).toContainText("Open: Column");
});

test("demo van: marks stay in memory and aren't saved", async ({ page }) => {
  await connectDemo(page);
  await tab(page, "More");
  await page.getByRole("button", { name: "Check recalls" }).click();
  await expect(page.locator("#recallCount")).toHaveText("2 recalls");
  await page.locator("#recallSee").click();
  await sheet(page).getByRole("button", { name: "Mark all closed" }).click();
  await expect(box(page).locator("#recallOpen")).toContainText("All 2 recalls marked closed");
  expect((await readStorage(page)).recallClosed).toBeUndefined();
});
