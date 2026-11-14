import { test, expect, tab, seedStorage, readStorage, connectFakeUsb } from "./fixtures.mjs";

// #15: vehicle profiles. Each car keeps its own drive history, maintenance and ranges, picked by VIN.
const VAN_VIN = "5FNRL6H9XJB000001", CIVIC_VIN = "1HGCV1F30LA000002";

test("adding a car keeps its maintenance and drives separate from the van", async ({ page }) => {
  await seedStorage(page, { maint: { odo: "52203", items: {} }, drives: [{ t: Date.now() - 86400000, sec: 1200, km: 20 }] });
  await tab(page, "More");
  await expect(page.locator("#profSel")).toHaveValue("van");
  await page.getByRole("button", { name: "Add a car" }).click();
  await page.locator("#profName").fill("Family sedan");
  await expect(page.locator("#profEngine")).toHaveValue("generic");
  await page.getByRole("button", { name: "Add car" }).click();
  await expect(page.locator("#profInfo")).toContainText("Other gasoline car");

  const s = await readStorage(page);
  expect(s.profiles.map(p => p.name)).toEqual(["My van", "Family sedan"]);
  const id = s.profiles[1].id;
  expect(s.profile).toBe(id);

  await tab(page, "Health");
  await expect(page.locator("#m-odo")).toHaveValue("");
  await page.locator("#m-odo").fill("8000");
  await expect.poll(async () => (await readStorage(page))[`car.${id}.maint`]?.odo).toBe("8000");
  expect((await readStorage(page)).maint.odo).toBe("52203");
  expect(await page.evaluate(() => drives().length)).toBe(0);

  // Odyssey-only ranges are off for the sedan, back on for the van.
  expect(await page.evaluate(() => PARAMS.find(p => p.key === "rpm").normal)).toBeUndefined();
  await tab(page, "More");
  await page.locator("#profSel").selectOption("van");
  expect(await page.evaluate(() => PARAMS.find(p => p.key === "rpm").normal)).toEqual([600, 850]);
  expect(await page.evaluate(() => drives().length)).toBe(1);
  await tab(page, "Health");
  await expect(page.locator("#m-odo")).toHaveValue("52203");
});

test("an unknown VIN offers to add the car", async ({ page }) => {
  await seedStorage(page, { profiles: [{ id: "van", name: "My van", engine: "odyssey", vin: VAN_VIN }] });
  await connectFakeUsb(page, { setup: v => { demo.vin = v; }, setupArg: CIVIC_VIN });
  const note = page.locator("#profNote");
  await expect(note).toContainText("New car?");
  await expect(note).toContainText("000002");
  await note.getByRole("button", { name: "Add this car" }).click();
  await expect(page.locator("#profVin")).toHaveValue(CIVIC_VIN);
  await page.locator("#profName").fill("Civic");
  await page.getByRole("button", { name: "Add car" }).click();
  await expect(note).toBeEmpty();
  const s = await readStorage(page);
  const civic = s.profiles.find(p => p.name === "Civic");
  expect(civic).toMatchObject({ vin: CIVIC_VIN, engine: "generic" });
  expect(s.profile).toBe(civic.id);
});

test("a known VIN switches to its car by itself", async ({ page }) => {
  await seedStorage(page, { profile: "van", profiles: [{ id: "van", name: "My van", engine: "odyssey", vin: VAN_VIN }, { id: "civic1", name: "Civic", engine: "generic", vin: CIVIC_VIN }] });
  await connectFakeUsb(page, { setup: v => { demo.vin = v; }, setupArg: CIVIC_VIN });
  await expect(page.locator("#profNote")).toContainText("Switched to Civic");
  expect((await readStorage(page)).profile).toBe("civic1");
  await tab(page, "More");
  await expect(page.locator("#profSel")).toHaveValue("civic1");
});

test("the first car claims the VIN it reads when it has none", async ({ page }) => {
  await seedStorage(page, {});
  await connectFakeUsb(page, { setup: v => { demo.vin = v; }, setupArg: VAN_VIN });
  await expect.poll(async () => (await readStorage(page)).profiles?.[0]?.vin).toBe(VAN_VIN);
  await expect(page.locator("#profNote")).toBeEmpty();
});

test("sync carries each car's data and merges its drives", async ({ page }) => {
  await page.goto("index.html");
  const r = await page.evaluate(() => {
    const M = mergeSync({ data: { "car.a1.drives": [{ t: 1 }], profiles: [{ id: "van" }, { id: "a1" }] }, mtimes: {} }, { data: { "car.a1.drives": [{ t: 2 }] }, mtimes: {} });
    return { n: M.data["car.a1.drives"].length, prof: !!M.data.profiles, odo: syncable("car.a1.odoSource"), active: syncable("profile") };
  });
  expect(r).toEqual({ n: 2, prof: true, odo: false, active: false });
});
