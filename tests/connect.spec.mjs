import { test, expect, seedStorage, tab } from "./fixtures.mjs";

// #58: no pull-to-refresh, a prompt before reloading while connected, one-tap reconnect, and automatic
// reconnect when Bluetooth drops. A fake Bluetooth LE adapter answers through the demo emulator.
async function fakeBle(page) {
  await page.addInitScript(() => {
    let buf = "", notify = null;
    const rx = { properties: { notify: true }, async startNotifications() {}, addEventListener(t, f) { notify = f; } };
    const tx = { properties: { writeWithoutResponse: true }, async writeValueWithoutResponse(chunk) {
      buf += new TextDecoder().decode(chunk);
      if (buf.includes("\r")) { const cmd = buf.trim(); buf = ""; setTimeout(() => { try { notify({ target: { value: new TextEncoder().encode(demo.emulate(cmd) + "\r\r>") } }); } catch {} }, 3); }
    } };
    const server = { async getPrimaryService(u) { if (u !== 0xFFF0) throw new Error("not here"); return { async getCharacteristics() { return [rx, tx]; } }; } };
    const dev = { id: "dev-1", name: "IOS-Vlink", __fake: true, ls: [], addEventListener(t, f) { if (t === "gattserverdisconnected") this.ls.push(f); },
      gatt: { async connect() { window.__connects = (window.__connects || 0) + 1; if (window.__unreachable) throw new Error("NetworkError"); return server; }, disconnect() {} },
      drop() { this.ls.forEach(f => f()); } };
    window.__dev = dev; window.__picker = 0; window.__granted = false;
    Object.defineProperty(navigator, "bluetooth", { configurable: true, value: {
      requestDevice: async () => { window.__picker++; return dev; },
      getDevices: async () => window.__granted ? [dev] : [] } });
  });
}
const conn = page => page.locator("#connText");
const w = (page, k) => page.evaluate(k => window[k], k);

test("pull-to-refresh is off", async ({ page }) => {
  await page.goto("index.html");
  expect(await page.evaluate(() => [getComputedStyle(document.documentElement).overscrollBehaviorY, getComputedStyle(document.body).overscrollBehaviorY])).toEqual(["none", "none"]);
});

test("short connect screen; setup help behind the info button", async ({ page }) => {
  await seedStorage(page, {});
  await expect(page.locator("#connHelp")).toBeHidden();
  await expect(page.locator("#reconnBtn")).toHaveCount(0);   // nothing to reconnect to yet
  await page.getByRole("button", { name: "How to connect" }).click();
  await expect(page.locator("#connHelp")).toContainText("left of the steering column");
  await expect(page.locator("#connectBox")).not.toContainText("Adapter commands");
  await page.locator("#connectBox summary", { hasText: "What the app reads" }).click();
  await expect(page.locator("#connectBox .port")).toContainText("ATZ");
});

test("Reconnect uses the remembered adapter without the picker", async ({ page }) => {
  await fakeBle(page);
  await page.goto("index.html");
  await page.getByRole("button", { name: /Bluetooth LE adapter/ }).click();
  await expect(conn(page)).toHaveText("Connected · IOS-Vlink", { timeout: 15000 });
  expect(await w(page, "__picker")).toBe(1);
  await tab(page, "More");
  await page.locator("#discBtn").click();
  await tab(page, "Home");
  await expect(page.locator("#reconnBtn")).toHaveText(/Reconnect to IOS-Vlink/);
  await page.evaluate(() => { window.__granted = true; });
  await page.locator("#reconnBtn").click();
  await expect(conn(page)).toHaveText("Connected · IOS-Vlink", { timeout: 15000 });
  expect(await w(page, "__picker")).toBe(1);   // no picker the second time
});

test("Bluetooth that drops reconnects by itself; if it can't, it says so", async ({ page }) => {
  await fakeBle(page);
  await page.goto("index.html");
  await page.getByRole("button", { name: /Bluetooth LE adapter/ }).click();
  await expect(conn(page)).toHaveText("Connected · IOS-Vlink", { timeout: 15000 });
  await page.evaluate(() => window.__dev.drop());
  await expect.poll(() => w(page, "__connects"), { timeout: 15000 }).toBe(2);
  await expect(conn(page)).toHaveText("Connected · IOS-Vlink", { timeout: 15000 });

  await page.evaluate(() => { window.__unreachable = true; window.__dev.drop(); });
  await tab(page, "Home");
  await expect(page.locator("#connectBox")).toContainText("Lost the adapter. Tap Reconnect", { timeout: 15000 });
  expect(await w(page, "__connects")).toBe(5);   // three tries
  await expect(page.locator("#reconnBtn")).toBeVisible();
});

test("reloading while connected asks first", async ({ page }) => {
  await fakeBle(page);
  await page.goto("index.html");
  await page.getByRole("button", { name: /Bluetooth LE adapter/ }).click();
  await expect(conn(page)).toHaveText("Connected · IOS-Vlink", { timeout: 15000 });
  const seen = new Promise(r => page.once("dialog", d => { r(d.type()); d.dismiss(); }));
  page.reload().catch(() => {});
  expect(await seen).toBe("beforeunload");
  await expect(conn(page)).toHaveText("Connected · IOS-Vlink");   // stayed, still connected
});
