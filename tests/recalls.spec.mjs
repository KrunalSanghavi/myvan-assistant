import { test, expect, connectDemo, tab, readStorage, seedStorage } from "./fixtures.mjs";

// NHTSA is never contacted in tests: both services are answered here, and any other call fails the test.
const VIN = "5FNRL6H9XJB000001";
const RECALLS = { Count: 2, results: [
  { NHTSACampaignNumber: "19V299000", ReportReceivedDate: "12/04/2019", Component: "POWER TRAIN:AUTOMATIC TRANSMISSION", Summary: "Loose battery  terminal connections may cause the TCU to reboot.", Consequence: "The vehicle can roll when parked.", Remedy: "Dealers will update the TCU software, free of charge.", parkIt: false, parkOutSide: false },
  { NHTSACampaignNumber: "21V000000", ReportReceivedDate: "01/20/2021", Component: "FUEL SYSTEM, GASOLINE:DELIVERY:FUEL PUMP", Summary: "The fuel pump may fail.", Consequence: "Engine stall.", Remedy: "Replace the pump.", parkIt: false, parkOutSide: true }
] };
async function mockNhtsa(page, { decode, recalls } = {}) {
  const calls = [];
  await page.route("https://vpic.nhtsa.dot.gov/**", r => { calls.push(r.request().url()); return r.fulfill({ contentType: "application/json", body: JSON.stringify(decode || { Results: [{ Make: "HONDA", Model: "Odyssey", ModelYear: "2018", ErrorCode: "0" }] }) }); });
  await page.route("https://api.nhtsa.gov/**", r => { calls.push(r.request().url()); return r.fulfill({ contentType: "application/json", body: typeof recalls === "string" ? recalls : JSON.stringify(recalls || RECALLS) }); });
  return calls;
}
const box = page => page.locator("#recallOut");

test("typed VIN: looks up the model, lists recalls newest first, and saves them", async ({ page }) => {
  const calls = await mockNhtsa(page);
  await seedStorage(page, {});
  await tab(page, "More");
  await page.getByLabel("VIN", { exact: true }).fill(VIN.toLowerCase());
  await expect(page.getByLabel("VIN", { exact: true })).toHaveValue(VIN);
  await page.getByRole("button", { name: "Check recalls" }).click();
  await expect(page.locator("#recallCount")).toHaveText("2 recalls");
  await expect(box(page)).toContainText("for the 2018 Honda Odyssey");
  await expect(box(page)).toContainText("says not to drive or to park outside");
  await expect(box(page).getByRole("link", { name: "check your VIN on nhtsa.gov" })).toHaveAttribute("href", "https://www.nhtsa.gov/recalls?vin=" + VIN);
  expect(calls[0]).toBe(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${VIN}?format=json`);
  expect(calls[1]).toBe("https://api.nhtsa.gov/recalls/recallsByVehicle?make=HONDA&model=Odyssey&modelYear=2018");
  expect(calls).toHaveLength(2);

  await page.getByRole("button", { name: "See all" }).click();
  const items = page.locator("#recallList details");
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText("Fuel Pump");   // 2021 before 2019
  await items.first().locator("summary").click();
  await expect(items.first()).toContainText("Park outside");
  await expect(items.nth(1)).toContainText("Loose battery terminal");   // whitespace tidied

  const st = await readStorage(page);
  expect(st.vin).toBe(VIN);
  expect(st.recalls.items.map(r => r.id)).toEqual(["21V000000", "19V299000"]);
});

test("saved results show offline, with a clear message", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false }));
  const calls = await mockNhtsa(page);
  await seedStorage(page, { vin: VIN, recalls: { vin: VIN, at: Date.now() - 864e5, make: "HONDA", model: "Odyssey", year: "2018", items: [{ id: "19V299000", date: "12/04/2019", component: "POWER TRAIN:AUTOMATIC TRANSMISSION", summary: "s", consequence: "", remedy: "", parkIt: false, parkOutSide: false }] } });
  await tab(page, "More");
  await expect(page.locator("#recallCount")).toHaveText("1 recall");
  await expect(page.getByLabel("VIN", { exact: true })).toHaveValue(VIN);
  await page.getByRole("button", { name: "Check recalls" }).click();
  await expect(box(page)).toContainText("You're offline");
  await expect(box(page)).toContainText("from the last check");
  await expect(page.locator("#recallCount")).toHaveText("1 recall");
  expect(calls).toHaveLength(0);
});

test("NHTSA not answering properly keeps the last results and says so", async ({ page }) => {
  await mockNhtsa(page, { recalls: "<html>maintenance</html>" });
  await seedStorage(page, {});
  await tab(page, "More");
  await page.getByLabel("VIN", { exact: true }).fill(VIN);
  await page.getByRole("button", { name: "Check recalls" }).click();
  await expect(box(page)).toContainText("didn't answer");
  await expect(page.getByRole("button", { name: "Check recalls" })).toBeEnabled();
});

test("bad VINs are caught before anything is sent", async ({ page }) => {
  const calls = await mockNhtsa(page, { decode: { Results: [{ Make: "", Model: "", ModelYear: "", ErrorCode: "1" }] } });
  await seedStorage(page, {});
  await tab(page, "More");
  await page.getByLabel("VIN", { exact: true }).fill("12345");
  await page.getByRole("button", { name: "Check recalls" }).click();
  await expect(box(page)).toContainText("17 letters and numbers");
  expect(calls).toHaveLength(0);
  await page.getByLabel("VIN", { exact: true }).fill("1HGCM82633A00435Z");
  await page.getByRole("button", { name: "Check recalls" }).click();
  await expect(box(page)).toContainText("couldn't match this VIN");
});

test("demo van shows sample recalls without contacting NHTSA, and the report lists them", async ({ page }) => {
  const calls = await mockNhtsa(page);
  await connectDemo(page);
  await tab(page, "More");
  await expect(page.getByLabel("VIN", { exact: true })).toHaveValue("5FNRL6H9XJBDEMO01");
  await page.getByRole("button", { name: "Check recalls" }).click();
  await expect(box(page)).toContainText("sample recalls");
  await expect(page.locator("#recallCount")).toHaveText("2 recalls");
  expect(calls).toHaveLength(0);
  expect((await readStorage(page)).recalls).toBeUndefined();
  await tab(page, "Health");
  await page.locator("#view-health [data-go=report]").click();
  await expect(page.locator("#reportDoc h2", { hasText: "Recalls" })).toBeVisible();
  await expect(page.locator("#reportDoc")).toContainText("19V299000");
});
