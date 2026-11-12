import { test as base, expect } from "@playwright/test";

// Every test fails on an uncaught page error or console error.
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error" && !/favicon|fonts\.g/.test(m.text())) errors.push(m.text()); });
    await use(page);
    expect(errors, "page errors").toEqual([]);
  }
});
export { expect };

export async function connectDemo(page) {
  await page.goto("index.html");
  await page.getByRole("button", { name: /demo/i }).click();
  await expect(page.locator("#connText")).toHaveText("Demo van", { timeout: 15000 });
}
export const tab = (page, name) => page.getByRole("tab", { name: new RegExp("^" + name) }).click();

// Replace the app's saved data (keys are stored with the "odx:" prefix) and reload.
export async function seedStorage(page, data) {
  await page.goto("index.html");
  await page.evaluate(d => {
    for (const k of Object.keys(localStorage)) if (k.startsWith("odx:")) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(d)) localStorage.setItem("odx:" + k, JSON.stringify(v));
  }, data);
  await page.reload();
}
export const readStorage = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith("odx:")).map(k => [k.slice(4), JSON.parse(localStorage.getItem(k))])));

// A fake USB (Web Serial) ELM327 adapter that answers through the app's demo emulator,
// so the real-adapter code path (where data is saved) can be tested without hardware.
// Pass { without: [0xA6] } to make the "van" not support some PIDs.
export async function connectFakeUsb(page, { without = [] } = {}) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "serial", { configurable: true, value: { requestPort: async () => {
      let ctrl; const enc = new TextEncoder(), dec = new TextDecoder();
      return {
        open: async () => {},
        readable: new ReadableStream({ start(c) { ctrl = c; } }),
        writable: new WritableStream({ write(chunk) { const cmd = dec.decode(chunk).trim(); setTimeout(() => { try { ctrl.enqueue(enc.encode(demo.emulate(cmd) + "\r\r>")); } catch {} }, 3); } }),   // the app may have closed the port by then
        close: async () => {}
      };
    } } });
  });
  await page.goto("index.html");
  await page.evaluate(w => w.forEach(p => demo.sup.delete(p)), without);
  await page.getByRole("button", { name: /USB adapter/ }).click();
  await expect(page.locator("#connText")).toHaveText("Connected · USB adapter", { timeout: 15000 });
}
