import { test, expect, connectDemo, connectFakeUsb, readStorage } from "./fixtures.mjs";

// Drive mode: keeps the screen on for a whole drive, saves the drive in progress,
// reconnects by itself and ends once the van has been parked for a while.
const fakeWake = page => page.addInitScript(() => {
  window.__wake = [];
  Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: async () => { __wake.push("on"); return { release: async () => __wake.push("off") }; } } });
});
const setHidden = (page, hidden) => page.evaluate(h => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => h ? "hidden" : "visible" });
  document.dispatchEvent(new Event("visibilitychange"));
}, hidden);
// A fake Bluetooth LE adapter on the demo emulator. __mute makes the current connection go quiet,
// as Android does to a page in the background; a fresh connection answers again.
async function fakeBle(page) {
  await page.addInitScript(() => {
    let buf = "", notify = null;
    const rx = { properties: { notify: true }, async startNotifications() {}, addEventListener(t, f) { notify = f; } };
    const tx = { properties: { writeWithoutResponse: true }, async writeValueWithoutResponse(chunk) {
      buf += new TextDecoder().decode(chunk);
      if (buf.includes("\r")) { const cmd = buf.trim(); buf = ""; if (window.__mute) return; setTimeout(() => { try { notify({ target: { value: new TextEncoder().encode(demo.emulate(cmd) + "\r\r>") } }); } catch {} }, 3); }
    } };
    const server = { async getPrimaryService(u) { if (u !== 0xFFF0) throw new Error("not here"); return { async getCharacteristics() { return [rx, tx]; } }; } };
    const dev = { id: "dev-1", name: "IOS-Vlink", __fake: true, ls: [], addEventListener(t, f) { if (t === "gattserverdisconnected") this.ls.push(f); },
      gatt: { async connect() { window.__connects = (window.__connects || 0) + 1; if (window.__unreachable) throw new Error("NetworkError"); window.__mute = false; return server; }, disconnect() {} },
      drop() { this.ls.forEach(f => f()); } };
    window.__dev = dev;
    Object.defineProperty(navigator, "bluetooth", { configurable: true, value: { requestDevice: async () => dev, getDevices: async () => [dev] } });
  });
  await page.goto("index.html");
  await page.getByRole("button", { name: /Bluetooth LE adapter/ }).click();
  await expect(page.locator("#connText")).toHaveText("Connected · IOS-Vlink", { timeout: 15000 });
}
const view = page => page.getByRole("dialog", { name: "Drive mode" });

test("Drive mode keeps the screen on, shows big readings, and takes the wake lock again on return", async ({ page }) => {
  await fakeWake(page);
  await connectDemo(page);
  await page.getByRole("button", { name: "Start Drive mode" }).click();
  await expect(view(page)).toBeVisible();
  await expect(view(page).locator("#driveStat")).toContainText("Recording this drive");
  await expect(view(page).locator(".dvv")).toHaveCount(4);
  await expect(view(page).locator(".dvv b").nth(1)).toHaveText(/^\d+$/);   // engine rpm
  expect(await page.evaluate(() => __wake)).toEqual(["on"]);
  await setHidden(page, true);
  await setHidden(page, false);
  await expect.poll(() => page.evaluate(() => __wake)).toEqual(["on", "on"]);
  await view(page).getByRole("button", { name: "Leave" }).click();
  await expect(view(page)).toBeHidden();
  expect(await page.evaluate(() => __wake)).toEqual(["on", "on", "off"]);
  await expect(page.locator("#connText")).toHaveText("Demo van");   // still connected
});

test("the drive in progress is saved now and then, outside backups", async ({ page }) => {
  await connectDemo(page);
  await page.evaluate(() => { drv.cpMs = 300; });
  await expect.poll(() => page.evaluate(() => { const cp = JSON.parse(localStorage.getItem("odxdev:drive")); return cp && cp.mode === "demo" && cp.d.start === state.drive.start; }), { timeout: 10000 }).toBe(true);
  expect(Object.keys(await readStorage(page))).not.toContain("drive");
});

test("a stalled connection on return reconnects and carries on with the same drive, counting the gap", async ({ page }) => {
  await fakeBle(page);
  await page.evaluate(() => { drv.checkMs = 1500; drv.retryMs = 100; });
  await page.getByRole("button", { name: "Start Drive mode" }).click();
  await expect.poll(() => page.evaluate(() => !!state.drive), { timeout: 10000 }).toBe(true);
  const start = await page.evaluate(() => state.drive.start);
  // The page goes to the background and the connection goes quiet for 12 seconds.
  await page.evaluate(() => { window.__mute = true; });
  await setHidden(page, true);
  await page.waitForTimeout(12000);
  await setHidden(page, false);
  await expect.poll(() => page.evaluate(() => window.__connects), { timeout: 15000 }).toBe(2);
  await expect(page.locator("#connText")).toHaveText("Connected · IOS-Vlink", { timeout: 15000 });
  await expect.poll(() => page.evaluate(() => state.drive && state.drive.start), { timeout: 10000 }).toBe(start);
  expect(await page.evaluate(() => state.drive.gapSec)).toBeGreaterThan(8);
  await expect(view(page)).toBeVisible();
});

test("Drive mode keeps trying after Bluetooth drops, then picks the drive up again", async ({ page }) => {
  await fakeBle(page);
  await page.evaluate(() => { drv.retryMs = 200; });
  await page.getByRole("button", { name: "Start Drive mode" }).click();
  await expect.poll(() => page.evaluate(() => !!state.drive), { timeout: 10000 }).toBe(true);
  const start = await page.evaluate(() => state.drive.start);
  await page.evaluate(() => { window.__unreachable = true; window.__dev.drop(); });
  await expect(view(page).locator("#driveStat")).toHaveText("Reconnecting to the adapter…", { timeout: 10000 });
  await expect.poll(() => page.evaluate(() => window.__connects), { timeout: 15000 }).toBeGreaterThan(5);   // past the usual three tries
  await page.evaluate(() => { window.__unreachable = false; });
  await expect(page.locator("#connText")).toHaveText("Connected · IOS-Vlink", { timeout: 15000 });
  await expect.poll(() => page.evaluate(() => state.drive && state.drive.start), { timeout: 10000 }).toBe(start);
});

test("engine off for a while: Drive mode ends, the adapter sleeps and the screen can turn off", async ({ page }) => {
  await fakeWake(page);
  await connectDemo(page);
  await page.evaluate(() => { drv.offMs = 1500; });
  await page.getByRole("button", { name: "Start Drive mode" }).click();
  await page.evaluate(() => { demo.engineOff = true; });
  await expect(page.locator("#connectBox")).toContainText("engine was off for 5 minutes", { timeout: 15000 });
  await expect(view(page)).toBeHidden();
  expect(await page.evaluate(() => __wake)).toEqual(["on", "off"]);
});

test("a drive with a gap is saved as partial, and the trip list says how long wasn't recorded", async ({ page }) => {
  await connectFakeUsb(page);
  await expect.poll(() => page.evaluate(() => !!state.drive), { timeout: 10000 }).toBe(true);
  await page.evaluate(() => { const d = state.drive; d.start -= 600000; d.lastSeen = Date.now() - 95000; });
  await expect.poll(() => page.evaluate(() => state.drive.gapSec), { timeout: 5000 }).toBeGreaterThan(90);
  await page.evaluate(() => disconnect());
  const d = (await readStorage(page)).drives.at(-1);
  expect(d.partial).toBe(true);
  expect(d.gapSec).toBeGreaterThan(90);
  await page.evaluate(() => openTrip());
  await expect(page.getByRole("dialog").locator("#tripList .item").first()).toContainText("2 min not recorded");
});

test("a saved drive that never resumed is kept when the app opens again", async ({ page }) => {
  await page.goto("index.html");
  await page.evaluate(() => {
    const t = Date.now() - 3600000;
    localStorage.setItem("odxdev:drive", JSON.stringify({ mode: "ble", at: t + 900000, d: { start: t, lastSeen: t + 900000, gapSec: 0, idle: { ltft1: [], ltft2: [], stft1: [], stft2: [], maf: [], rpm: [] }, run: [], c1: [], c2: [], trip: { sec: 880, km: 12, fuelL: 1.2, idleSec: 60, maf: true } } }));
  });
  await page.reload();
  const s = await readStorage(page);
  expect(s.drives.at(-1).dur).toBe(900);
  expect(s.drives.at(-1).km).toBe(12);
  expect(await page.evaluate(() => localStorage.getItem("odxdev:drive"))).toBeNull();
});
