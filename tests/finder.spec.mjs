import { test, expect, tab, connectDemo, seedStorage, readStorage } from "./fixtures.mjs";

// #52: the read-only Honda data finder, driven against the demo van's emulated instrument panel (29-bit 0x60, DID 2202).
async function openFinder(page) { await tab(page, "More"); await page.locator("#finderRow").click(); return page.getByRole("dialog"); }

test("finds the odometer on the instrument panel, uses it, and gives the adapter back to live data", async ({ page }) => {
  await connectDemo(page);
  const miles = await page.evaluate(() => Math.round(demo.vals().odo / KM_PER_MI));
  const sheet = await openFinder(page);
  await sheet.locator("#fdOdo").fill(String(miles));
  await sheet.locator("summary", { hasText: "Advanced" }).click();
  await sheet.locator("#fd29").fill("5E-62");
  await sheet.locator("#fd11").fill("7E0");
  await sheet.locator("#fdIds").fill("22:2200-2204, 21:00-02");
  await sheet.getByRole("button", { name: "Start" }).click();
  await expect(sheet.locator("#fdProg")).toContainText("finished", { timeout: 30000 });
  await expect(sheet.locator("#fdOut")).toContainText("18DA60F1, 7E0");
  const hit = sheet.locator("#fdOut .item", { hasText: "request 22 2202" });
  await expect(hit).toHaveCount(1);
  await expect(hit).toContainText("bytes 1–3, high byte first, km");
  await expect(sheet.locator("#fdOut .item:has([data-fduse])")).toHaveCount(1);   // DID 2203 and the VIN don't match
  await hit.getByRole("button", { name: "Use this" }).click();
  await expect(sheet.locator("#fdProg")).toContainText(/Read 52,2\d\d mi from the van/);
  expect((await readStorage(page)).odoSource).toMatchObject({ req: "222202", mod: "18DA60F1", order: "be", unit: "km", len: 3 });
  // The adapter is back on the normal protocol and live data keeps flowing.
  expect(await page.evaluate(() => [demo.p29, demo.hdr, state.hold])).toEqual([false, "7DF", false]);
  const rpm0 = await page.evaluate(() => (H.rpm || []).length);
  await expect.poll(() => page.evaluate(() => (H.rpm || []).length), { timeout: 10000 }).toBeGreaterThan(rpm0);
});

test("only read requests can be sent, and the VIN stays out of the results file", async ({ page }) => {
  await connectDemo(page);
  const blocked = await page.evaluate(async () => {
    const out = [];
    for (const r of ["04", "2E220200", "3101FF00", "1101", "14FFFFFF", "1003"]) { try { await diagRead(r); out.push("sent " + r); } catch (e) { out.push(e.message); } }
    return out;
  });
  expect(blocked.every(m => m.startsWith("Blocked"))).toBe(true);
  const sheet = await openFinder(page);
  await sheet.locator("#fdOdo").fill("1");
  await sheet.getByRole("button", { name: "Start" }).click();
  await expect(sheet.locator("#fdProg")).toContainText("Type the odometer from the dash first");
  await sheet.locator("#fdOdo").fill("52000");
  await sheet.locator("summary", { hasText: "Advanced" }).click();
  await sheet.locator("#fd29").fill("60"); await sheet.locator("#fd11").fill(""); await sheet.locator("#fdIds").fill("22:2203-2203");
  await sheet.getByRole("button", { name: "Start" }).click();
  await expect(sheet.locator("#fdOut")).toContainText("No reading matched", { timeout: 20000 });
  const log = await page.evaluate(() => JSON.stringify(finder.log));
  expect(log).toContain("VIN, not saved");
  expect(log).not.toContain(await page.evaluate(() => toHex([...demo.vin].map(c => c.charCodeAt(0)))));
});

// Finder v2 (#52, #13, #14): focus presets, why requests were refused, and trouble codes from other modules.
async function scan(sheet, focus, m29, m11, ids) {
  await sheet.locator("#fdFocus").selectOption(focus);
  if (!(await sheet.locator("#fd29").isVisible())) await sheet.locator("summary", { hasText: "Advanced" }).click();
  await sheet.locator("#fd29").fill(m29); await sheet.locator("#fd11").fill(m11);
  if (ids != null) await sheet.locator("#fdIds").fill(ids);
  await sheet.getByRole("button", { name: "Start" }).click();
  await expect(sheet.locator("#fdProg")).toContainText("finished", { timeout: 30000 });
}

test("trouble codes from every module, by name, read-only", async ({ page }) => {
  await connectDemo(page);
  const sheet = await openFinder(page);
  await sheet.locator("#fdFocus").selectOption("engine");
  await expect(sheet.locator("#fdOdoRow")).toBeHidden();
  await expect(sheet.locator("#fd29")).toHaveValue("10, 1E");
  await scan(sheet, "codes", "1E, 60", "7E0");
  await expect(sheet.locator("#fdProg")).toContainText("1 trouble code");
  const codes = sheet.locator("#fdCodes");
  await expect(codes.locator(".item", { hasText: "Transmission computer (18DA1EF1)" })).toContainText(/P0740.*Past/);
  await expect(codes.locator(".item", { hasText: "Instrument panel" })).toContainText("No codes.");
  await expect(codes.locator(".item", { hasText: "Engine computer (7E0)" })).toContainText("Didn't share its codes");
  await sheet.locator("#fdWhy summary").click();
  await expect(sheet.locator("#fdWhy")).toContainText("1 × service not supported");
});

test("panel deep scan counts refusals and still finds the odometer; engine scan saves live context", async ({ page }) => {
  await connectDemo(page);
  const miles = await page.evaluate(() => Math.round(demo.vals().odo / KM_PER_MI));
  const sheet = await openFinder(page);
  await sheet.locator("#fdFocus").selectOption("panel");
  await expect(sheet.locator("#fd29")).toHaveValue("60");
  await sheet.locator("#fdOdo").fill(String(miles));
  await scan(sheet, "panel", "60", "", "22:1000-1003, 22:2202-2202, 22:2204-2205");
  await expect(sheet.locator("#fdOut .item", { hasText: "request 22 2202" })).toHaveCount(1);
  await sheet.locator("#fdWhy summary").click();
  await expect(sheet.locator("#fdWhy")).toContainText("4 × needs a different diagnostic mode");
  await expect(sheet.locator("#fdWhy")).toContainText("2 × not supported (no such data)");
  await expect(sheet.locator("#fdWhy")).toContainText("would be added only with your OK");
  await scan(sheet, "engine", "1E", "", "22:2200-2202");
  await expect(sheet.locator("#fdOut")).toContainText("1 reading saved.");
  const f = await page.evaluate(() => ({ focus: finder.focus, snap: finder.snap, log: finder.log.map(x => x.req) }));
  expect(f.focus).toBe("engine");
  expect(f.snap.length).toBe(2);
  expect(f.snap[0].rpm).toBeGreaterThan(0);
  expect(f.log).toContain("222201");
  expect(await page.evaluate(() => [demo.p29, demo.hdr, state.hold])).toEqual([false, "7DF", false]);
});

test("the panel can be closed mid-scan: screen kept on, spoken and in-app alert, results kept", async ({ page }) => {
  await page.addInitScript(() => {
    window.__wake = []; window.__said = [];
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: async () => { __wake.push("on"); return { release: async () => __wake.push("off") }; } } });
    if (window.speechSynthesis) window.speechSynthesis.speak = u => __said.push(u.text);
  });
  await connectDemo(page);
  const sheet = await openFinder(page);
  await sheet.locator("#fdFocus").selectOption("codes");
  await sheet.locator("summary", { hasText: "Advanced" }).click();
  await sheet.locator("#fd29").fill("1E-62"); await sheet.locator("#fd11").fill("7E0");
  await sheet.getByRole("button", { name: "Start" }).click();
  await expect(sheet.locator("#fdBg")).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  const ban = page.locator("#fdDone");
  await expect(ban).toContainText("Data finder finished.", { timeout: 60000 });
  await expect(ban).toContainText("1 trouble code");
  expect(await page.evaluate(() => [__wake, __said.some(t => t.startsWith("Data finder finished"))])).toEqual([["on", "off"], true]);
  await ban.getByRole("button", { name: "See results" }).click();
  await expect(page.getByRole("dialog").locator("#fdCodes")).toContainText("P0740");
  // Kept after a reload too.
  await page.reload();
  await tab(page, "More"); await page.locator("#finderRow").click();
  await expect(page.getByRole("dialog").locator("#fdProg")).toContainText("Data finder finished");
  await expect(page.getByRole("dialog").locator("#fdSave")).toBeVisible();
});

test("recalls are listed newest first by NHTSA's date, even from an old saved check", async ({ page }) => {
  const VIN = "5FNRL6H9XJB000001", it = (id, date) => ({ id, date, component: "X:" + id, summary: "", consequence: "", remedy: "", parkIt: false, parkOutSide: false });
  await seedStorage(page, { vin: VIN, recalls: { vin: VIN, at: Date.now(), make: "HONDA", model: "Odyssey", year: "2018", items: [it("23V858000", "19/12/2023"), it("18V777000", "01/11/2018"), it("26V332000", "22/05/2026"), it("26V227000", "10/04/2026")] } });
  await tab(page, "More");
  await page.locator("#recallSee").click();
  const ids = await page.locator("#recallList [data-rid]").evaluateAll(e => e.map(x => x.dataset.rid));
  expect(ids).toEqual(["26V332000", "26V227000", "23V858000", "18V777000"]);
});
