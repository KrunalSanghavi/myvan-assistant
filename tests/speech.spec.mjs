import { test, expect, connectDemo, tab, readStorage } from "./fixtures.mjs";

// A fake voice that records what the app asks it to say.
async function fakeVoice(page) {
  await page.addInitScript(() => {
    window.__said = [];
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { speak: u => window.__said.push(u.text), cancel() {}, getVoices: () => [] } });
  });
}
const said = page => page.evaluate(() => window.__said);
async function openAlerts(page) { await tab(page, "More"); await page.locator("#view-more [data-go=checks]").first().click(); }
const overheat = (page, on) => page.evaluate(on => {
  if (!demo.__vals) demo.__vals = demo.vals;
  demo.vals = on ? function () { return Object.assign(demo.__vals.call(this), { ect: 121 }); } : demo.__vals;
}, on);

test("off by default: nothing is spoken", async ({ page }) => {
  await fakeVoice(page);
  await connectDemo(page);
  await expect(page.locator("#statusCard")).toContainText("Bank 2 running lean", { timeout: 15000 });
  expect(await said(page)).toEqual([]);
  await tab(page, "More");
  await expect(page.locator("#speakRow")).toHaveText("Off");
});

test("All alerts: each new alert is spoken once", async ({ page }) => {
  await fakeVoice(page);
  await connectDemo(page);
  await expect(page.locator("#statusCard")).toContainText("Bank 2 running lean", { timeout: 15000 });
  await openAlerts(page);
  await page.getByRole("button", { name: "All alerts" }).click();
  await expect.poll(() => said(page)).toEqual(["Spoken alerts on.", "Warning. Bank 2 running lean."]);
  await page.waitForTimeout(3000); // more samples arrive; still active, so no repeat
  expect((await said(page)).filter(t => t.includes("Bank 2"))).toHaveLength(1);
  expect((await readStorage(page)).speak).toBe("all");
});

test("Critical only: warnings stay quiet, critical alerts are spoken with what to do", async ({ page }) => {
  await fakeVoice(page);
  await connectDemo(page);
  await openAlerts(page);
  await page.getByRole("button", { name: "Critical only" }).click();
  await expect(page.locator("#statusCard")).toContainText("Bank 2", { timeout: 15000 });
  await overheat(page, true);
  await expect.poll(() => said(page), { timeout: 15000 }).toContainEqual(expect.stringMatching(/^Critical\. Engine is overheating\. Coolant is at \d+ degrees\. Pull over safely/));
  expect((await said(page)).some(t => t.includes("Bank 2"))).toBe(false);
});

test("an alert that clears and comes back within 5 minutes isn't repeated", async ({ page }) => {
  await fakeVoice(page);
  await connectDemo(page);
  await openAlerts(page);
  await page.getByRole("button", { name: "Critical only" }).click();
  await overheat(page, true);
  await expect.poll(() => said(page), { timeout: 15000 }).toContainEqual(expect.stringContaining("overheating"));
  await overheat(page, false);
  await expect.poll(() => page.evaluate(() => state.findings.some(f => f.id === "ect_hot")), { timeout: 15000 }).toBe(false);
  await overheat(page, true);
  await expect.poll(() => page.evaluate(() => state.findings.some(f => f.id === "ect_hot")), { timeout: 15000 }).toBe(true);
  expect((await said(page)).filter(t => t.includes("overheating"))).toHaveLength(1);
});

test("turning it off stops speech; setting is remembered", async ({ page }) => {
  await fakeVoice(page);
  await connectDemo(page);
  await openAlerts(page);
  await page.getByRole("button", { name: "All alerts" }).click();
  await page.getByRole("button", { name: "Off", exact: true }).click();
  await page.reload();
  await tab(page, "More");
  await expect(page.locator("#speakRow")).toHaveText("Off");
  expect((await readStorage(page)).speak).toBe("off");
});

test("browsers without a voice get a clear note and disabled controls", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, "speechSynthesis", { configurable: true, value: undefined }); });
  await page.goto("index.html");
  await openAlerts(page);
  await expect(page.locator("#speakNote")).toContainText("can't speak");
  await expect(page.getByRole("button", { name: "All alerts" })).toBeDisabled();
});
