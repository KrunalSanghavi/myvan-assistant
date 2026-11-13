import { test, expect, tab, seedStorage, connectDemo } from "./fixtures.mjs";

// #47: plain-English self-test results, "Ask about this" on guide and part sheets, links that leave the installed app.
async function readSelfTests(page) {
  await tab(page, "Health");
  await page.locator("#m06Btn").click();
  await expect(page.locator("#healthOut .hero p")).toContainText("Self-tests read", { timeout: 30000 });
}
const openLookup = async (page, code) => {
  await tab(page, "Codes");
  await page.locator("#lookupIn").fill(code);
  await page.getByRole("button", { name: "Open steps" }).click();
};

test("self-test rows say what they measure, as plain pass rules", async ({ page }) => {
  await connectDemo(page);
  await readSelfTests(page);
  await page.locator('.hcard[data-comp="af2"]').click();
  const list = page.locator("#testList");
  await expect(list).toContainText("tells the computer how rich or lean");   // what the group checks
  const row = list.locator("details.tst", { hasText: "Honda test 80" });
  await expect(row).toContainText("Resistance check");
  await expect(row).toContainText("passes at 200 Ω or less");
  await expect(row.locator(".tst-x")).toBeHidden();
  await row.locator("summary").click();
  await expect(row.locator(".tst-x")).toContainText("Electrical resistance, in ohms");
  await expect(row.locator(".tst-x")).toContainText("Honda doesn't publish what test 80 measures");
  await expect(row.locator(".tst-x")).toContainText("Passed, but close to the limit");
});

test("demo van: Ask about this on a part and on its troubleshooting page", async ({ page }) => {
  await connectDemo(page);
  await readSelfTests(page);
  await page.locator('.hcard[data-comp="af2"]').click();
  let sheet = page.getByRole("dialog").last();
  await sheet.getByRole("button", { name: "What do these test results mean?" }).click();
  await expect(sheet.locator(".gask-answer")).toContainText("Demo van: this is a sample answer");
  await sheet.locator("#compGuide").click();
  sheet = page.getByRole("dialog").last();
  await sheet.locator(".gask-in").fill("Can I keep driving to work?");
  await sheet.locator(".gask-form").getByRole("button", { name: "Ask" }).click();
  await expect(sheet.locator(".gask-answer")).toContainText("Can I keep driving to work?");
});

test("with a key, the guide question goes to the AI with the code, never the VIN", async ({ page }) => {
  const calls = [];
  await page.context().route("https://generativelanguage.googleapis.com/**", r => {
    calls.push(JSON.parse(r.request().postData() || "{}"));
    return r.fulfill({ contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: "Check the gas cap first." }] } }] }) });
  });
  await seedStorage(page, { vin: "5FNRL6H9XJB000001" });
  await page.evaluate(() => localStorage.setItem("odxai:cfg", JSON.stringify({ provider: "gemini", keys: { gemini: "AIza" + "T".repeat(35) }, models: { gemini: "gemini-2.5-flash" } })));
  await page.reload();
  await openLookup(page, "P0456");
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Is it safe to drive?" }).click();
  await expect(sheet.locator(".gask-answer")).toContainText("Check the gas cap first.");
  const sent = JSON.stringify(calls);
  expect(sent).toContain("Trouble code P0456");
  expect(sent).toContain("Is it safe to drive?");
  expect(sent).not.toContain("5FNRL6H9XJB000001");
});

test("without a key, Ask about this points to AI setup and Google", async ({ page }) => {
  await seedStorage(page, {});
  await openLookup(page, "P0171");
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "What should I check first?" }).click();
  await expect(sheet.locator(".gask-out")).toContainText("add an AI provider under More → AI answers");
  await expect(sheet.locator(".gask-out").getByRole("link", { name: "Search Google" })).toHaveAttribute("href", /P0171/);
});

test("installed app on Android: web links go to Chrome; the last answer is kept", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { get: () => "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36" });
    const mm = window.matchMedia.bind(window);
    window.matchMedia = q => /display-mode: standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q);
    window.__ext = [];
  });
  await seedStorage(page, {});
  await page.evaluate(() => { window.openExternal = u => window.__ext.push(u); });
  await tab(page, "More");
  await page.getByRole("button", { name: /^Ask about my van/ }).click();
  await page.getByLabel("Your question").fill("Should I buy new tires before a road trip?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.locator("#askOut").getByRole("link", { name: "Search Google" }).click();
  expect(await page.evaluate(() => window.__ext)).toEqual([expect.stringContaining("https://www.google.com/search?q=")]);
  expect(await page.evaluate(() => chromeIntent("https://www.google.com/search?q=a%20b"))).toBe("intent://www.google.com/search?q=a%20b#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fwww.google.com%2Fsearch%3Fq%3Da%2520b;end");

  await page.reload();
  await tab(page, "More");
  await page.getByRole("button", { name: /^Ask about my van/ }).click();
  await expect(page.getByLabel("Your question")).toHaveValue("Should I buy new tires before a road trip?");
  await expect(page.locator("#askOut")).toContainText("doesn't have a built-in answer");
});
